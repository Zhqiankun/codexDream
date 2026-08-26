import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  net,
  protocol,
  session as electronSession,
  Tray,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LocalThemeStore } from "../infra/local-store";
import { ThemeService } from "./theme-service";
import { WindowsPlatform } from "../platform/windows";
import { CodexSessionService } from "../session/session-service";
import type {
  ErrorCode,
  ExportResult,
  ImportResult,
  Result,
  ThemeDetail,
  ThemePatch,
  ThemeSnapshot,
  UpdateSnapshot,
} from "../../contracts";
import { registerIpc } from "../ipc/handlers";
import { MainOperationBusyError, MainOperationGate } from "./operation-gate";

export class AppController {
  mainWindow?: BrowserWindow;
  tray?: Tray;
  readonly store: LocalThemeStore;
  readonly platform = new WindowsPlatform();
  readonly session: CodexSessionService;
  readonly themeService: ThemeService;
  private readonly operationGate = new MainOperationGate();
  private quitting = false;
  private readonly update = {
    configured: false as const,
    status: "unavailable" as const,
  };
  private readonly devRendererUrl = resolveDevRendererUrl(
    process.env.ELECTRON_RENDERER_URL,
  );

  constructor() {
    const localAppData = process.env.LOCALAPPDATA || app.getPath("userData");
    this.store = new LocalThemeStore(join(localAppData, "CodexStyle"));
    this.session = new CodexSessionService(
      this.platform,
      async () => {
        const record = await this.store.selectedReadyForInjection();
        if (!record) return undefined;
        const image = this.store.getBackground(record.libraryId);
        return image ? { record, image } : undefined;
      },
      () => this.store.snapshot(this.session.snapshot(), this.update).paused,
      this.store.managedStore,
      (libraryId, fingerprint) =>
        this.store.markLastKnownGood(libraryId, fingerprint),
      (pid, nonce) => this.handleWatcherStateChange(pid, nonce),
    );
    this.themeService = new ThemeService(
      this.store,
      () => this.mainWindow,
      () => this.snapshot(),
    );
  }

  dispose(): void {
    this.quitting = true;
    this.store.managedStore.close();
  }

  async init(): Promise<void> {
    await this.store.init();
    await this.session.restoreOrphanedState();
    // Studio assets use stable app:// URLs. Clear any response cached by an
    // earlier build before the first window loads, then mark every response as
    // non-cacheable so development reloads and installed upgrades cannot serve
    // stale renderer code.
    await electronSession.defaultSession.clearCache();
    protocol.handle("app", async (request) => {
      let url: URL;
      try {
        url = new URL(request.url);
      } catch {
        return new Response("Bad URL", { status: 400 });
      }
      if (url.protocol !== "app:" || url.username || url.password || url.hash)
        return new Response("Bad URL", { status: 400 });
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response("Method not allowed", { status: 405 });
      if (url.hostname === "studio") {
        if (url.search && !this.devRendererUrl)
          return new Response("Bad URL", { status: 400 });
        let relative: string;
        try {
          relative = decodeURIComponent(
            url.pathname.replace(/^\/+/, "") || "index.html",
          );
        } catch {
          return new Response("Bad path", { status: 400 });
        }
        if (!isSafeStudioAssetPath(relative))
          return new Response("Bad path", { status: 400 });
        if (this.devRendererUrl) {
          const target = resolveDevAssetUrl(
            `${relative}${url.search}`,
            this.devRendererUrl,
          );
          if (!target) return new Response("Bad path", { status: 400 });
          return withoutCache(
            await net.fetch(target, {
              method: request.method,
              redirect: "error",
            }),
            request.method,
          );
        }
        const rendererRoot = join(__dirname, "../renderer");
        return withoutCache(
          await net.fetch(
            pathToFileURL(join(rendererRoot, relative)).toString(),
            { method: request.method, redirect: "error" },
          ),
          request.method,
        );
      }
      if (url.hostname === "theme-asset") {
        const version = url.searchParams.get("v");
        if (
          url.username ||
          url.password ||
          (url.search !== "" &&
            (url.searchParams.size !== 1 ||
              typeof version !== "string" ||
              !/^[1-9][0-9]*$/u.test(version)))
        )
          return new Response("Not found", { status: 404 });
        const libraryId = decodeURIComponent(url.pathname.replace(/^\//u, ""));
        if (!isLibraryId(libraryId))
          return new Response("Not found", { status: 404 });
        const data = this.themeService.asset(libraryId);
        const mime =
          this.themeService.assetMime(libraryId) ?? "application/octet-stream";
        return data
          ? new Response(new Uint8Array(data), {
              headers: { "content-type": mime, "cache-control": "no-store" },
            })
          : new Response("Not found", { status: 404 });
      }
      return new Response("Not found", { status: 404 });
    });
    this.createWindow();
    this.createTray();
    registerIpc(this);
  }

  snapshot(): ThemeSnapshot {
    return this.store.snapshot(this.session.snapshot(), this.update);
  }

  broadcast(snapshot: ThemeSnapshot = this.snapshot()): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send("studio:state-changed", snapshot);
    this.refreshTray();
  }

  async openStudio(): Promise<void> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) this.createWindow();
    this.mainWindow?.show();
    this.mainWindow?.focus();
  }

  getStudioSnapshot(): Result<ThemeSnapshot> {
    return { ok: true, data: this.snapshot() };
  }

  getTheme(libraryId: string): Result<ThemeDetail> {
    return this.themeService.get(libraryId);
  }

  createDraft(name?: string): Promise<Result<ThemeDetail>> {
    return this.runSideEffect(() => this.themeService.createDraft(name));
  }

  patchDraft(
    libraryId: string,
    expectedRevision: number,
    patch: ThemePatch,
  ): Promise<Result<ThemeDetail>> {
    return this.runSideEffect(() =>
      this.themeService.patch(libraryId, expectedRevision, patch),
    );
  }

  chooseBackground(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeDetail>> {
    return this.runSideEffect(() =>
      this.themeService.chooseBackground(libraryId, expectedRevision),
    );
  }

  commitTheme(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeDetail>> {
    return this.runSideEffect(() =>
      this.themeService.commit(libraryId, expectedRevision),
    );
  }

  importTheme(): Promise<Result<ImportResult>> {
    return this.runSideEffect(() => this.themeService.importZip());
  }

  resolveThemeImport(
    transactionId: string,
    action: "keep-both" | "replace" | "cancel",
    replaceLibraryId?: string,
    expectedRevision?: number,
  ): Promise<Result<ImportResult>> {
    return this.runSideEffect(() =>
      this.themeService.resolveImport(
        transactionId,
        action,
        replaceLibraryId,
        expectedRevision,
      ),
    );
  }

  exportTheme(
    libraryId: string,
    expectedRevision: number,
    format: "simplified" | "formal",
  ): Promise<Result<ExportResult>> {
    return this.runSideEffect(() =>
      this.themeService.exportZip(libraryId, expectedRevision, format),
    );
  }

  selectThemeForNextLaunch(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeSnapshot>> {
    return this.runSideEffect(() =>
      this.themeService.select(libraryId, expectedRevision),
    );
  }

  clearThemeSelection(): Promise<Result<ThemeSnapshot>> {
    return this.runSideEffect(() => this.themeService.clearSelection());
  }

  async launchSession(): Promise<Result<ThemeSnapshot>> {
    return this.runSideEffect(async () => {
      try {
        await this.session.launch();
        return { ok: true, data: this.snapshot() };
      } catch (error) {
        return sessionError(error);
      }
    });
  }

  async pauseSession(): Promise<Result<ThemeSnapshot>> {
    return this.runSideEffect(async () => {
      const result = await this.themeService.setPaused(true);
      if (!result.ok) return result;
      try {
        await this.session.pause();
        return { ok: true, data: this.snapshot() };
      } catch (error) {
        await this.themeService.setPaused(false).catch(() => undefined);
        return sessionError(error);
      }
    });
  }

  async resumeSession(): Promise<Result<ThemeSnapshot>> {
    return this.runSideEffect(async () => {
      const result = await this.themeService.setPaused(false);
      if (!result.ok) return result;
      try {
        await this.session.resume();
        return { ok: true, data: this.snapshot() };
      } catch (error) {
        await this.themeService.setPaused(true).catch(() => undefined);
        return sessionError(error);
      }
    });
  }

  async endOwnedSession(): Promise<Result<ThemeSnapshot>> {
    return this.runSideEffect(async () => {
      try {
        await this.session.endOwned();
        return { ok: true, data: this.snapshot() };
      } catch (error) {
        return sessionError(error);
      }
    });
  }

  getUpdateStatus(): Result<UpdateSnapshot> {
    return { ok: true, data: this.update };
  }

  requestUpdate(): Result<UpdateSnapshot> {
    return resultError("UPDATE_UNCONFIGURED", "update.unconfigured");
  }

  async launch(): Promise<void> {
    const result = await this.launchSession();
    if (!result.ok && result.error.code !== "OPERATION_BUSY") {
      await dialog.showMessageBox({
        type: "warning",
        title: "CodexStyle",
        message: launchFailureMessage(result.error.code),
      });
    }
  }

  async pause(): Promise<void> {
    const result = await this.pauseSession();
    if (!result.ok && result.error.code !== "OPERATION_BUSY")
      throw new Error(result.error.code);
  }

  async resume(): Promise<void> {
    const result = await this.resumeSession();
    if (!result.ok && result.error.code !== "OPERATION_BUSY")
      throw new Error(result.error.code);
  }

  async requestQuit(): Promise<void> {
    try {
      await this.runMainOperation(async () => {
        if (this.session.snapshot().canEnd) {
          const response = await dialog.showMessageBox({
            type: "warning",
            buttons: ["取消", "退出并关闭已拥有会话"],
            defaultId: 0,
            cancelId: 0,
            title: "退出 CodexStyle",
            message:
              "CodexStyle 当前拥有一个已验证的 Codex 会话。退出将关闭该会话。",
          });
          if (response.response !== 1) return;
          const result = await this.endOwnedSession();
          if (!result.ok) {
            await dialog.showMessageBox({
              type: "error",
              title: "CodexStyle",
              message:
                "Unable to close the verified Codex session safely. CodexStyle will remain running.",
            });
            return;
          }
        }
        this.quitting = true;
        this.tray?.destroy();
        app.quit();
      });
    } catch (error) {
      if (!(error instanceof MainOperationBusyError)) throw error;
    }
  }

  private async runSideEffect<T>(
    operation: () => Promise<Result<T>> | Result<T>,
  ): Promise<Result<T>> {
    try {
      return await this.runMainOperation(operation);
    } catch (error) {
      return error instanceof MainOperationBusyError
        ? resultError("OPERATION_BUSY", "ipc.busy")
        : resultError("UNKNOWN", "error.unknown");
    }
  }

  private async runMainOperation<T>(
    operation: () => Promise<T> | T,
  ): Promise<T> {
    return this.operationGate.run(async (isRootOperation) => {
      const before = isRootOperation ? this.snapshot() : undefined;
      try {
        return await operation();
      } finally {
        if (before) {
          const after = this.snapshot();
          if (!snapshotsEqual(before, after)) this.broadcast(after);
        }
      }
    });
  }

  private async handleWatcherStateChange(
    pid: number,
    nonce: string,
  ): Promise<void> {
    try {
      await this.runMainOperation(() =>
        this.session.orphanForWatcher(pid, nonce),
      );
    } catch {
      // A concurrent command leaves the watcher intact for its next check.
    }
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1260,
      height: 820,
      minWidth: 960,
      minHeight: 620,
      show: false,
      backgroundColor: "#0b1020",
      title: "CodexStyle Studio",
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    this.mainWindow.webContents.setWindowOpenHandler(() => ({
      action: "deny",
    }));
    this.mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
      if (!isStudioDocumentUrl(targetUrl)) event.preventDefault();
    });
    this.mainWindow.webContents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
    this.mainWindow.webContents.session.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    this.mainWindow.webContents.session.setPermissionCheckHandler(() => false);
    this.mainWindow.on("close", (event) => {
      if (!this.quitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });
    this.mainWindow.on("closed", () => {
      this.mainWindow = undefined;
    });
    this.mainWindow.once("ready-to-show", () => this.mainWindow?.show());
    void this.mainWindow.loadURL("app://studio/index.html");
  }

  private createTray(): void {
    const icon = createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip("CodexStyle");
    this.tray.on("click", () => void this.openStudio());
    this.refreshTray();
  }

  private refreshTray(): void {
    if (!this.tray) return;
    const session = this.session.snapshot();
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开 Studio", click: () => void this.openStudio() },
        {
          label: "启动 Codex",
          enabled:
            session.state === "NO_SESSION" || session.state === "INCOMPATIBLE",
          click: () => void this.launch(),
        },
        {
          label: "暂停后续注入",
          enabled: session.state === "THEMED_SESSION",
          click: () =>
            void this.pause().catch(() =>
              dialog.showMessageBox({
                type: "error",
                title: "CodexStyle",
                message: "无法安全暂停后续注入，当前会话保持原样。",
              }),
            ),
        },
        {
          label: "恢复后续注入",
          enabled: session.state === "PAUSED_FUTURE",
          click: () =>
            void this.resume().catch(() =>
              dialog.showMessageBox({
                type: "error",
                title: "CodexStyle",
                message: "无法恢复后续注入设置，当前会话保持原样。",
              }),
            ),
        },
        { type: "separator" },
        {
          label: "检查更新（未配置）",
          click: () =>
            void dialog.showMessageBox({
              message: "更新尚未配置，当前不可用。",
              title: "CodexStyle",
            }),
        },
        { label: "退出", click: () => void this.requestQuit() },
      ]),
    );
  }
}

function resultError<T>(code: ErrorCode, messageKey: string): Result<T> {
  return { ok: false, error: { code, messageKey } };
}

function sessionError<T>(errorValue: unknown): Result<T> {
  const raw =
    errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (raw.includes("EXTERNAL_SESSION_RUNNING"))
    return resultError("EXTERNAL_SESSION_RUNNING", "session.externalRunning");
  if (raw.includes("STORE_PACKAGE_NOT_FOUND"))
    return resultError(
      "STORE_PACKAGE_NOT_FOUND",
      "session.storePackageNotFound",
    );
  if (raw.includes("CDP_UNAVAILABLE"))
    return resultError("CDP_UNAVAILABLE", "session.cdpUnavailable");
  if (raw.includes("TARGET_IDENTITY_MISMATCH"))
    return resultError("TARGET_IDENTITY_MISMATCH", "session.identityMismatch");
  if (raw.includes("TARGET_INCOMPATIBLE"))
    return resultError("TARGET_INCOMPATIBLE", "session.targetIncompatible");
  if (raw.includes("INJECTION"))
    return resultError("INJECTION_FAILED", "session.injectionFailed");
  if (raw.includes("PAUSED")) return resultError("PAUSED", "session.paused");
  if (raw.includes("INCOMPLETE_THEME"))
    return resultError("INCOMPLETE_THEME", "session.themeNotReady");
  if (raw.includes("UNSAFE_CSS"))
    return resultError("UNSAFE_CSS", "session.themeUnsafe");
  if (raw.includes("STORE_TAMPERED"))
    return resultError("STORE_TAMPERED", "store.tampered");
  if (raw.includes("CLEANUP_FAILED"))
    return resultError("CLEANUP_FAILED", "session.cleanupFailed");
  return resultError("UNKNOWN", "error.unknown");
}

function launchFailureMessage(code: ErrorCode): string {
  if (code === "EXTERNAL_SESSION_RUNNING")
    return "外部 Codex 正在运行，请关闭它后再试。";
  if (
    code === "TARGET_IDENTITY_MISMATCH" ||
    code === "TARGET_INCOMPATIBLE" ||
    code === "CDP_UNAVAILABLE"
  )
    return "当前 Codex 版本不兼容或未开放 CDP，未注入任何主题。";
  return "Codex 启动失败，未注入任何主题。";
}

function snapshotsEqual(left: ThemeSnapshot, right: ThemeSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createTrayIcon(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="8" fill="#f5b94c"/><path d="M9 23V9h4.2l2.8 4.1L18.8 9H23v14h-3.4v-8.2l-3.6 5-3.6-5V23H9Z" fill="#17120a"/></svg>`;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
  );
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

function isLibraryId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function isSafeStudioAssetPath(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.split("/").some((part) => part === "." || part === "..")
  );
}

function isStudioDocumentUrl(value: string): boolean {
  return value === "app://studio/index.html";
}

function resolveDevRendererUrl(value: string | undefined): string | undefined {
  if (!value || process.env.NODE_ENV === "production") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined;
    return `${url.toString().replace(/\/$/u, "")}/`;
  } catch {
    return undefined;
  }
}

function resolveDevAssetUrl(
  relative: string,
  baseUrl: string,
): string | undefined {
  try {
    const base = new URL(baseUrl);
    const target = new URL(relative, base);
    if (
      target.origin !== base.origin ||
      target.protocol !== base.protocol ||
      target.username ||
      target.password
    )
      return undefined;
    return target.toString();
  } catch {
    return undefined;
  }
}

export function withoutCache(
  response: Response,
  method: "GET" | "HEAD",
): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return new Response(method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
