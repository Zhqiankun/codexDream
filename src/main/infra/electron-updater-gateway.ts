import { app, shell } from "electron";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AppUpdater,
  CancellationToken,
  ProgressInfo,
  UpdateCheckResult,
} from "electron-updater";
import type {
  DownloadProgress,
  ReleaseInfo,
  UpdateGateway,
} from "../app/update-service";

export const INSTALL_MARKER_NAME = ".codexstyle-installed";
export const INSTALL_MARKER_CONTENT = "com.codexstyle.desktop/v1";
export const UPDATE_BASE_URL =
  "https://github.com/Zhqiankun/codexDream/releases/latest/download/";

type CancellationTokenConstructor = new () => CancellationToken;

interface NormalizedUpdaterModule {
  autoUpdater: AppUpdater;
  CancellationToken: CancellationTokenConstructor;
}

interface ElectronUpdaterGatewayOptions {
  supported?: boolean;
  loadUpdater?: () => Promise<unknown>;
}

export class ElectronUpdaterGateway implements UpdateGateway {
  readonly supported: boolean;
  readonly fallbackUrl =
    "https://github.com/Zhqiankun/codexDream/releases/latest";
  private readonly loadUpdater: () => Promise<unknown>;
  private updaterPromise?: Promise<NormalizedUpdaterModule>;
  private updater?: AppUpdater;
  private cancellationToken?: CancellationToken;
  private cancelPending = false;

  constructor(options: ElectronUpdaterGatewayOptions = {}) {
    this.supported = options.supported ?? isInstalledWindowsBuild();
    this.loadUpdater =
      options.loadUpdater ?? (() => import("electron-updater"));
  }

  async fetchLatest(): Promise<ReleaseInfo> {
    const { updater } = await this.configuredUpdater();
    const result = await updater.checkForUpdates();
    if (!result) throw new Error("UPDATE_CHECK_FAILED:no-result");
    const version = normalizeVersion(result);
    validateUpdateInfo(result, version);
    return {
      version,
      url: releaseUrl(version),
    };
  }

  async download(
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const { module, updater } = await this.configuredUpdater();
    const token = new module.CancellationToken();
    this.cancellationToken = token;
    if (this.cancelPending) token.cancel();
    const progressListener = (progress: ProgressInfo) =>
      onProgress({
        percent: progress.percent,
        transferredBytes: progress.transferred,
        totalBytes: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    updater.on("download-progress", progressListener);
    try {
      await updater.downloadUpdate(token);
    } finally {
      updater.removeListener("download-progress", progressListener);
      if (this.cancellationToken === token) this.cancellationToken = undefined;
      this.cancelPending = false;
    }
  }

  cancelDownload(): void {
    this.cancelPending = true;
    this.cancellationToken?.cancel();
  }

  install(): void {
    if (!this.updater)
      throw new Error("UPDATE_INSTALL_FAILED:updater-not-ready");
    // Keep the installer visible while binaries are unsigned. Windows may
    // display its unknown-publisher warning before the per-user replacement.
    this.updater.quitAndInstall(false, true);
  }

  async openRelease(url: string): Promise<void> {
    validateReleaseUrl(url);
    await shell.openExternal(url, { activate: true });
  }

  private async configuredUpdater(): Promise<{
    module: NormalizedUpdaterModule;
    updater: AppUpdater;
  }> {
    if (!this.supported) throw new Error("UPDATE_UNSUPPORTED");
    this.updaterPromise ??= this.loadUpdater().then(normalizeUpdaterModule);
    const module = await this.updaterPromise;
    const updater = module.autoUpdater;
    if (this.updater !== updater) {
      updater.setFeedURL({
        provider: "generic",
        url: UPDATE_BASE_URL,
        channel: "latest",
        useMultipleRangeRequest: false,
      });
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = false;
      updater.allowDowngrade = false;
      updater.disableWebInstaller = true;
      updater.disableDifferentialDownload = false;
      this.updater = updater;
    }
    return { module, updater };
  }
}

function normalizeUpdaterModule(value: unknown): NormalizedUpdaterModule {
  const namespace = isRecord(value) ? value : undefined;
  const defaultExport =
    namespace && isRecord(namespace.default) ? namespace.default : undefined;
  const autoUpdater = namespace?.autoUpdater ?? defaultExport?.autoUpdater;
  const CancellationToken =
    namespace?.CancellationToken ?? defaultExport?.CancellationToken;
  const cancellationTokenPrototype =
    typeof CancellationToken === "function"
      ? CancellationToken.prototype
      : undefined;
  if (
    !isUpdater(autoUpdater) ||
    !isRecord(cancellationTokenPrototype) ||
    typeof cancellationTokenPrototype.cancel !== "function"
  )
    throw new Error("UPDATE_CHECK_FAILED:updater-module-exports");
  return {
    autoUpdater: autoUpdater as AppUpdater,
    CancellationToken: CancellationToken as CancellationTokenConstructor,
  };
}

function isUpdater(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    "setFeedURL",
    "checkForUpdates",
    "downloadUpdate",
    "quitAndInstall",
    "on",
    "removeListener",
  ].every((key) => typeof value[key] === "function");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isInstalledWindowsBuild(
  packaged = app.isPackaged,
  platform = process.platform,
  executablePath = process.execPath,
): boolean {
  if (!packaged || platform !== "win32") return false;
  try {
    const marker = readFileSync(
      join(dirname(executablePath), INSTALL_MARKER_NAME),
      "utf8",
    ).trim();
    return marker === INSTALL_MARKER_CONTENT;
  } catch {
    return false;
  }
}

function normalizeVersion(result: UpdateCheckResult): string {
  const value = result.updateInfo.version;
  const match =
    /^(?:v)?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/u.exec(value);
  if (!match) throw new Error("UPDATE_CHECK_FAILED:release-version");
  const parts = match[1].split(".").map(Number);
  if (!parts.every(Number.isSafeInteger))
    throw new Error("UPDATE_CHECK_FAILED:release-version");
  return match[1];
}

function releaseUrl(version: string): string {
  return `https://github.com/Zhqiankun/codexDream/releases/tag/v${version}`;
}

function validateUpdateInfo(result: UpdateCheckResult, version: string): void {
  const expectedName = `CodexStyle-${version}-x64.exe`;
  const expectedUrl = updateAssetUrl(version, expectedName);
  const files = result.updateInfo.files;
  if (!Array.isArray(files) || files.length !== 1)
    throw new Error("UPDATE_CHECK_FAILED:release-files");
  const file = files[0];
  if (
    file.url !== expectedUrl ||
    !Number.isSafeInteger(file.size) ||
    (file.size ?? 0) < 1024 * 1024 ||
    (file.size ?? 0) > 512 * 1024 * 1024 ||
    !isSha512(file.sha512)
  )
    throw new Error("UPDATE_CHECK_FAILED:release-file");
  if (
    (result.updateInfo.path !== undefined &&
      result.updateInfo.path !== expectedUrl) ||
    (result.updateInfo.sha512 !== undefined &&
      result.updateInfo.sha512 !== file.sha512)
  )
    throw new Error("UPDATE_CHECK_FAILED:release-metadata");
}

export function updateAssetUrl(version: string, fileName: string): string {
  return `https://github.com/Zhqiankun/codexDream/releases/download/v${version}/${fileName}`;
}

function isSha512(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{86}==$/u.test(value))
    return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === 64 && bytes.toString("base64") === value;
}

function validateReleaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("UPDATE_OPEN_FAILED:release-url");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/Zhqiankun/codexDream/releases/latest" &&
      !/^\/Zhqiankun\/codexDream\/releases\/tag\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(
        url.pathname,
      ))
  )
    throw new Error("UPDATE_OPEN_FAILED:release-url");
}
