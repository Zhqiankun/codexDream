import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  net,
  protocol,
  shell,
  Tray,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LocalThemeStore } from "../infra/local-store";
import { ThemeService } from "./theme-service";
import { WindowsPlatform } from "../platform/windows";
import { CodexSessionService } from "../session/session-service";
import {
  PROTOCOL_VERSION,
  type ErrorCode,
  type ExportResult,
  type ImportResult,
  type Result,
  type StudioRuntimeInfo,
  type ThemeDetail,
  type ThemePatch,
  type ThemeSnapshot,
  type UpdateSnapshot,
} from "../../contracts";
import { registerIpc } from "../ipc/handlers";
import { MainOperationBusyError, MainOperationGate } from "./operation-gate";
import { UpdateService } from "./update-service";
import { ElectronUpdaterGateway } from "../infra/electron-updater-gateway";
import type { MainLogger } from "../infra/main-logger";

const STUDIO_STARTUP_TIMEOUT_MS = 10_000;
const STUDIO_RETRY_DELAY_MS = 250;
const MAX_STUDIO_RECOVERY_ATTEMPTS = 1;

export class AppController {
  mainWindow?: BrowserWindow;
  tray?: Tray;
  readonly store: LocalThemeStore;
  readonly platform = new WindowsPlatform();
  readonly session: CodexSessionService;
  readonly themeService: ThemeService;
  private readonly operationGate = new MainOperationGate();
  private quitting = false;
  private showStudioRequested = true;
  private studioRendererReady = false;
  private studioReadyToShow = false;
  private studioRecoveryAttempts = 0;
  private studioStartupWatchdog?: ReturnType<typeof setTimeout>;
  private studioRetryTimer?: ReturnType<typeof setTimeout>;
  private readonly updateService: UpdateService;
  private readonly devRendererUrl = resolveDevRendererUrl(
    process.env.ELECTRON_RENDERER_URL,
  );

  constructor(
    updateService?: UpdateService,
    private readonly logger?: MainLogger,
  ) {
    const currentVersion = app.getVersion();
    this.updateService =
      updateService ??
      new UpdateService(
        currentVersion,
        new ElectronUpdaterGateway(),
        undefined,
        () => this.broadcast(),
      );
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
      () =>
        this.store.snapshot(
          this.session.snapshot(),
          this.updateService.snapshot(),
        ).paused,
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
    this.clearStudioStartupWatchdog();
    if (this.studioRetryTimer) clearTimeout(this.studioRetryTimer);
    if (this.updateService.snapshot().status === "downloading")
      this.updateService.cancel();
    this.store.managedStore.close();
  }

  async init(): Promise<void> {
    await this.store.init();
    await this.session.restoreOrphanedState();
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
    registerIpc(this, this.logger);
    this.createTray();
    this.createWindow();
  }

  snapshot(): ThemeSnapshot {
    return this.store.snapshot(
      this.session.snapshot(),
      this.updateService.snapshot(),
    );
  }

  broadcast(snapshot: ThemeSnapshot = this.snapshot()): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send("studio:state-changed", snapshot);
    this.refreshTray();
  }

  async openStudio(): Promise<void> {
    this.showStudioRequested = true;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) this.createWindow();
    if (this.mainWindow) this.showStudioWindowIfReady(this.mainWindow);
  }

  rendererReady(): Result<StudioRuntimeInfo> {
    const window = this.mainWindow;
    if (!window || window.isDestroyed())
      return {
        ok: false,
        error: { code: "UNKNOWN", messageKey: "window.unavailable" },
      };
    this.studioRendererReady = true;
    this.showStudioWindowIfReady(window);
    return {
      ok: true,
      data: { appVersion: app.getVersion(), protocolVersion: PROTOCOL_VERSION },
    };
  }

  async openLogDirectory(): Promise<Result<boolean>> {
    if (!this.logger)
      return resultError("UNKNOWN", "diagnostics.logsUnavailable");
    const failure = await shell.openPath(this.logger.directory);
    if (failure) {
      this.logger.warn("diagnostics.logs.openFailed");
      return resultError("UNKNOWN", "diagnostics.logsOpenFailed");
    }
    this.logger.info("diagnostics.logs.opened");
    return { ok: true, data: true };
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

  chooseSendIcon(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeDetail>> {
    return this.runSideEffect(() =>
      this.themeService.chooseSendIcon(libraryId, expectedRevision),
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

  deleteTheme(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeSnapshot>> {
    if (this.session.snapshot().canEnd)
      return Promise.resolve(resultError("THEME_IN_USE", "theme.inUse"));
    return this.runSideEffect(() =>
      this.themeService.delete(libraryId, expectedRevision),
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
    format: "simplified" | "compatibility" | "formal",
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
    return { ok: true, data: this.updateService.snapshot() };
  }

  async requestUpdate(): Promise<Result<UpdateSnapshot>> {
    try {
      return { ok: true, data: await this.updateService.checkAndDownload() };
    } catch (error) {
      return updateError(error, this.updateService.snapshot());
    } finally {
      this.broadcast();
    }
  }

  cancelUpdate(): Result<UpdateSnapshot> {
    const data = this.updateService.cancel();
    this.broadcast();
    return { ok: true, data };
  }

  installUpdate(mode: "now" | "on-quit"): Promise<Result<UpdateSnapshot>> {
    if (mode === "on-quit") {
      try {
        const data = this.updateService.scheduleInstallOnQuit();
        this.broadcast();
        return Promise.resolve({ ok: true, data });
      } catch (error) {
        return Promise.resolve(
          updateError(error, this.updateService.snapshot()),
        );
      }
    }
    return this.installDownloadedUpdate();
  }

  async openUpdatePage(): Promise<Result<UpdateSnapshot>> {
    try {
      return {
        ok: true,
        data: await this.updateService.openAvailableRelease(),
      };
    } catch {
      return resultError("UPDATE_OPEN_FAILED", "update.openFailed");
    }
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
            buttons: ["取消", "退出并关闭受管会话"],
            defaultId: 0,
            cancelId: 0,
            title: "退出 CodexStyle",
            message:
              "CodexStyle 当前管理一个已验证的 Codex 会话。退出将关闭该会话。",
          });
          if (response.response !== 1) return;
          const result = await this.endOwnedSession();
          if (!result.ok) {
            await dialog.showMessageBox({
              type: "error",
              title: "CodexStyle",
              message: "无法安全结束受管 Codex 会话，CodexStyle 将继续运行。",
            });
            return;
          }
        }
        this.quitting = true;
        if (this.updateService.shouldInstallOnQuit()) {
          try {
            this.updateService.installNow();
            return;
          } catch {
            this.quitting = false;
            await dialog.showMessageBox({
              type: "error",
              title: "CodexStyle 更新",
              message: "无法启动已下载的更新，CodexStyle 将继续运行。",
            });
            return;
          }
        }
        this.tray?.destroy();
        app.quit();
      });
    } catch (error) {
      if (!(error instanceof MainOperationBusyError)) throw error;
    }
  }

  private async installDownloadedUpdate(): Promise<Result<UpdateSnapshot>> {
    try {
      return await this.runMainOperation(async () => {
        const update = this.updateService.snapshot();
        if (
          update.status !== "downloaded" &&
          update.status !== "scheduled" &&
          !(update.status === "error" && update.errorPhase === "install")
        )
          return resultError("UPDATE_INSTALL_FAILED", "update.installFailed");

        const ownsSession = this.session.snapshot().canEnd;
        const response = await dialog.showMessageBox({
          type: "warning",
          buttons: ["取消", ownsSession ? "关闭 Codex 并安装" : "重启并安装"],
          defaultId: 0,
          cancelId: 0,
          title: "安装 CodexStyle 更新",
          message: `即将安装 CodexStyle v${update.latestVersion}。`,
          detail: ownsSession
            ? "安装包已通过 SHA-512 完整性校验，但尚未代码签名。继续将先安全关闭本工具启动的 Codex 会话；Windows 仍可能显示未知发布者。"
            : "安装包已通过 SHA-512 完整性校验，但尚未代码签名。Windows 仍可能显示未知发布者。",
        });
        if (response.response !== 1)
          return resultError("CANCELLED", "update.installCancelled");

        if (ownsSession) {
          const ended = await this.endOwnedSession();
          if (!ended.ok)
            return resultError("CLEANUP_FAILED", "session.cleanupFailed");
        }

        this.quitting = true;
        try {
          return { ok: true, data: this.updateService.installNow() };
        } catch (error) {
          this.quitting = false;
          return updateError(error, this.updateService.snapshot());
        }
      });
    } catch (error) {
      return error instanceof MainOperationBusyError
        ? resultError("OPERATION_BUSY", "ipc.busy")
        : resultError("UPDATE_INSTALL_FAILED", "update.installFailed");
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
    if (this.mainWindow && !this.mainWindow.isDestroyed()) return;
    this.clearStudioStartupWatchdog();
    this.studioRendererReady = false;
    this.studioReadyToShow = false;
    const window = new BrowserWindow({
      width: 1260,
      height: 820,
      minWidth: 960,
      minHeight: 620,
      show: false,
      backgroundColor: "#0b1020",
      title: "CodexStyle Studio",
      icon: createAppIcon(),
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    this.mainWindow = window;
    window.webContents.setWindowOpenHandler(() => ({
      action: "deny",
    }));
    window.webContents.on("will-navigate", (event, targetUrl) => {
      if (!isStudioDocumentUrl(targetUrl)) event.preventDefault();
    });
    window.webContents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
    window.webContents.session.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.webContents.on(
      "did-fail-load",
      (_event, code, description, url, isMainFrame) => {
        if (isMainFrame)
          this.recoverStudioWindow(
            window,
            `did-fail-load ${code} ${description} ${url}`,
          );
      },
    );
    window.webContents.on("preload-error", (_event, path, error) => {
      this.recoverStudioWindow(
        window,
        `preload-error ${path}: ${error.message}`,
      );
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      this.recoverStudioWindow(window, `render-process-gone ${details.reason}`);
    });
    window.on("close", (event) => {
      if (!this.quitting) {
        event.preventDefault();
        this.showStudioRequested = false;
        window.hide();
      }
    });
    window.on("closed", () => {
      if (this.mainWindow !== window) return;
      this.clearStudioStartupWatchdog();
      this.mainWindow = undefined;
      this.studioRendererReady = false;
      this.studioReadyToShow = false;
    });
    window.once("ready-to-show", () => {
      if (this.mainWindow !== window || window.isDestroyed()) return;
      this.studioReadyToShow = true;
      this.showStudioWindowIfReady(window);
    });
    this.studioStartupWatchdog = setTimeout(
      () => this.recoverStudioWindow(window, "renderer-ready timeout"),
      STUDIO_STARTUP_TIMEOUT_MS,
    );
    this.studioStartupWatchdog.unref?.();
    void window
      .loadURL("app://studio/index.html")
      .catch((error: unknown) =>
        this.recoverStudioWindow(window, `loadURL ${formatError(error)}`),
      );
  }

  private showStudioWindowIfReady(window: BrowserWindow): void {
    if (
      this.mainWindow !== window ||
      window.isDestroyed() ||
      !this.studioRendererReady ||
      !this.studioReadyToShow
    )
      return;
    this.clearStudioStartupWatchdog();
    if (!this.showStudioRequested) return;
    window.show();
    window.focus();
  }

  private recoverStudioWindow(window: BrowserWindow, reason: string): void {
    if (this.quitting || this.mainWindow !== window || window.isDestroyed())
      return;
    this.logger?.error("studio.window.startFailed", reason);
    console.error("CodexStyle Studio window failed to start", reason);
    this.clearStudioStartupWatchdog();
    this.mainWindow = undefined;
    window.destroy();
    if (this.studioRecoveryAttempts < MAX_STUDIO_RECOVERY_ATTEMPTS) {
      this.studioRecoveryAttempts += 1;
      this.studioRetryTimer = setTimeout(() => {
        this.studioRetryTimer = undefined;
        if (!this.quitting) this.createWindow();
      }, STUDIO_RETRY_DELAY_MS);
      this.studioRetryTimer.unref?.();
      return;
    }
    dialog.showErrorBox(
      "CodexStyle 启动失败",
      "工作台页面连续两次未能加载。应用将退出，请重新打开；如果仍然失败，请重新安装最新版。",
    );
    app.quit();
  }

  private clearStudioStartupWatchdog(): void {
    if (!this.studioStartupWatchdog) return;
    clearTimeout(this.studioStartupWatchdog);
    this.studioStartupWatchdog = undefined;
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
        { label: "检查更新", click: () => void this.checkForUpdatesFromTray() },
        { label: "退出", click: () => void this.requestQuit() },
      ]),
    );
  }

  private async checkForUpdatesFromTray(): Promise<void> {
    const result = await this.requestUpdate();
    if (!result.ok) {
      const response = await dialog.showMessageBox({
        type: "warning",
        buttons: ["取消", "打开下载页面"],
        defaultId: 1,
        cancelId: 0,
        title: "CodexStyle 更新",
        message:
          result.error.code === "UPDATE_UNSUPPORTED"
            ? "应用内更新仅支持正式安装的 Windows 版本。开发版或 ZIP 便携版请从 GitHub Release 手动更新。"
            : result.error.code === "UPDATE_DOWNLOAD_FAILED"
              ? "更新下载或完整性校验失败，请稍后重试。"
              : "无法连接 GitHub 检查更新，请稍后重试。",
      });
      if (response.response === 1) await this.openUpdatePage();
      return;
    }
    if (result.data.status === "current") {
      await dialog.showMessageBox({
        type: "info",
        title: "CodexStyle 更新",
        message: `当前已是最新版 v${result.data.currentVersion}。`,
      });
      return;
    }
    if (result.data.status !== "downloaded") return;
    const response = await dialog.showMessageBox({
      type: "warning",
      buttons: ["稍后", "重启并安装", "退出时安装"],
      defaultId: 1,
      cancelId: 0,
      title: "CodexStyle 更新",
      message: `CodexStyle v${result.data.latestVersion} 已下载并通过完整性校验。`,
      detail:
        "当前安装包尚未代码签名，Windows 仍可能显示未知发布者。你可以立即重启安装，或在之后从托盘退出时安装。",
    });
    if (response.response === 1) await this.installUpdate("now");
    if (response.response === 2) await this.installUpdate("on-quit");
  }
}

function resultError<T>(code: ErrorCode, messageKey: string): Result<T> {
  return { ok: false, error: { code, messageKey } };
}

function updateError<T>(
  errorValue: unknown,
  snapshot: UpdateSnapshot,
): Result<T> {
  const raw =
    errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (raw.includes("UPDATE_UNSUPPORTED"))
    return resultError("UPDATE_UNSUPPORTED", "update.unsupported");
  if (
    raw.includes("UPDATE_INSTALL_FAILED") ||
    snapshot.errorPhase === "install"
  )
    return resultError("UPDATE_INSTALL_FAILED", "update.installFailed");
  if (snapshot.errorPhase === "download")
    return resultError("UPDATE_DOWNLOAD_FAILED", "update.downloadFailed");
  return resultError("UPDATE_CHECK_FAILED", "update.checkFailed");
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
  if (raw.includes("STORE_ACTIVATION_FAILED"))
    return resultError("STORE_ACTIVATION_FAILED", "session.launchFailed");
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
  if (code === "STORE_ACTIVATION_FAILED")
    return "Windows 未能启动 Store Codex，未注入任何主题。";
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
  const image = nativeImage.createFromPath(resourcePath("tray-icon.png"));
  if (!image.isEmpty()) return image;
  return createAppIcon().resize({ width: 16, height: 16 });
}

function createAppIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(resourcePath("icon.png"));
}

function resourcePath(fileName: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, fileName)
    : join(app.getAppPath(), "resources", fileName);
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
