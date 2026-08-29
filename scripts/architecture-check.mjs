import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];
const required = [
  "src/contracts/index.ts",
  "src/main/app/controller.ts",
  "src/main/domain/theme.ts",
  "src/main/infra/local-store.ts",
  "src/main/infra/bundled-presets.ts",
  "src/main/infra/theme-zip.ts",
  "src/main/infra/safe-css.ts",
  "src/main/infra/electron-updater-gateway.ts",
  "src/main/app/update-service.ts",
  "src/main/session/cdp-client.ts",
  "src/main/session/selector-profile.ts",
  "src/main/session/theme-payload.ts",
  "src/main/session/session-service.ts",
  "src/main/platform/windows.ts",
  "src/main/ipc/handlers.ts",
  "src/preload/index.ts",
  "src/renderer/api/bridge.ts",
  "src/renderer/index.html",
];
for (const file of required) {
  if (!existsSync(resolve(root, file))) failures.push(`missing:${file}`);
}

const packageJson = readJson("package.json");
for (const [section, dependencies] of Object.entries({
  dependencies: packageJson.dependencies,
  devDependencies: packageJson.devDependencies,
})) {
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    if (/[~^*]/u.test(String(version)))
      failures.push(`unpinned:${section}.${name}`);
  }
}
if (packageJson.dependencies?.["electron-updater"] !== "6.8.9")
  failures.push("updater-version-not-pinned");
if (packageJson.dependencies?.["auto-updater"])
  failures.push("unexpected-auto-updater-dependency");

const builder = source("electron-builder.yml");
requireMarkers(builder, "package-fuses", [
  "asar: true",
  "electronFuses:",
  "runAsNode: false",
  "enableNodeOptionsEnvironmentVariable: false",
  "enableNodeCliInspectArguments: false",
  "enableEmbeddedAsarIntegrityValidation: true",
  "onlyLoadAppFromAsar: true",
  "grantFileProtocolExtraPrivileges: false",
]);

const rendererFiles = walk(resolve(root, "src/renderer"));
for (const file of rendererFiles) {
  const text = readFileSync(file, "utf8");
  if (
    /from\s+["'](?:node:|electron)|require\(["'](?:node:|electron)/u.test(text)
  )
    failures.push(`renderer-private-import:${relative(file)}`);
  if (/dangerouslySetInnerHTML/u.test(text))
    failures.push(`renderer-unvalidated-html-or-css:${relative(file)}`);
}

const controller = source("src/main/app/controller.ts");
requireMarkers(controller, "window-security", [
  "contextIsolation: true",
  "sandbox: true",
  "nodeIntegration: false",
  "webSecurity: true",
  "setWindowOpenHandler",
  "will-navigate",
  "will-attach-webview",
  "setPermissionRequestHandler",
  "setPermissionCheckHandler",
  'loadURL("app://studio/index.html")',
  'protocol.handle("app"',
  "await this.session.pause()",
  "createBundledPresetSource",
  "bundledPresetPath()",
  "app.isPackaged ? app.getAppPath() : process.cwd()",
]);
if (/loadURL\(this\.devRendererUrl/u.test(controller))
  failures.push("window-loads-dev-server-directly");
if (/localhost/u.test(controller))
  failures.push("dev-proxy-allows-localhost-alias");
requireMarkers(controller, "dev-proxy-origin", [
  "resolveDevAssetUrl",
  "target.origin !== base.origin",
]);

const ipc = source("src/main/ipc/handlers.ts");
requireMarkers(ipc, "ipc-auth", [
  "event.sender.mainFrame",
  'frame.url === "app://studio/index.html"',
  "schema.safeParse(payload)",
]);
if (/localhost|127\.0\.0\.1/u.test(ipc))
  failures.push("ipc-permits-dev-origin");

const preload = source("src/preload/index.ts");
requireMarkers(preload, "preload-contract", [
  "contextBridge.exposeInMainWorld",
  'invoke("update.getStatus"',
  'invoke("update.request"',
  'invoke("update.cancel"',
  'invoke("update.install"',
  'invoke("update.openRelease"',
]);
if (/exposeInMainWorld\([^,]+,\s*ipcRenderer\)/u.test(preload))
  failures.push("preload-exposes-raw-ipc");

const electronUpdater = source("src/main/infra/electron-updater-gateway.ts");
requireMarkers(electronUpdater, "installed-update-boundary", [
  'import("electron-updater")',
  "autoDownload = false",
  "autoInstallOnAppQuit = false",
  "allowPrerelease = false",
  "allowDowngrade = false",
  "disableWebInstaller = true",
  "updater.setFeedURL({",
  "url: UPDATE_BASE_URL",
  'INSTALL_MARKER_NAME = ".codexstyle-installed"',
  '"https://github.com/Zhqiankun/codexDream/releases/latest/download/"',
]);

const mainIndex = source("src/main/index.ts");
requireMarkers(mainIndex, "single-instance", [
  "requestSingleInstanceLock",
  'scheme: "app"',
  "secure: true",
]);

const safeCss = source("src/main/infra/safe-css.ts");
for (const part of [
  "root",
  "sidebar",
  "main",
  "header",
  "home",
  "home-hero",
  "project-list",
  "thread",
  "message",
  "composer",
  "composer-toolbar",
  "dialog",
]) {
  if (!safeCss.includes(`"${part}"`)) failures.push(`safe-css-part:${part}`);
}
requireMarkers(safeCss, "safe-css-limits", [
  "MAX_BYTES = 256 * 1024",
  "MAX_RULES = 128",
  "MAX_DECLARATIONS = 512",
  "comment-not-allowed",
  "escape-not-allowed",
]);

const themeDomain = source("src/main/domain/theme.ts");
requireMarkers(themeDomain, "theme-summary", [
  "safeThemeAccent",
  "DEFAULT_ACCENT",
  "ACCENT_PATTERN",
  "backgroundColor",
  "backgroundThumbnailUrl",
  "hasUserSelectedBackground",
]);

const zip = source("src/main/infra/theme-zip.ts");
requireMarkers(zip, "zip-contract", [
  "validateEntrySizes: true",
  "actual > entry.uncompressedSize",
  'TextDecoder("utf-8", { fatal: true })',
  "originalThemeJsonBase64",
  "originalCssBase64",
  "originalManifestBase64",
  "readInputArchive",
  "yauzl.fromBuffer",
  "readThemeZip(tempPath)",
  "replaceOutput",
]);
if (/fs\.rm\(filePath|backup =/u.test(zip))
  failures.push("zip-destructive-output-replace");

const store = source("src/main/infra/local-store.ts");
requireMarkers(store, "store-contract", [
  "selectedReadyForInjection",
  "validateStoredImage",
  "markLastKnownGood",
  "recoverJournal",
  "reclaimStaleLock",
  "STORE_TAMPERED",
  "installedPresetPacks",
  "installBundledPresetPack",
  "replacesInstalledPack",
  "previousFingerprints",
]);

const bundledPresets = source("src/main/infra/bundled-presets.ts");
requireMarkers(bundledPresets, "bundled-presets", [
  "readImageFileBounded",
  "validateImage",
  "imageSha256",
  "replacesPackIds",
  "previousFingerprints",
  "BUNDLED_PRESET_PACK_INVALID",
]);

const rendererApp = source("src/renderer/app/App.tsx");
requireMarkers(rendererApp, "theme-library-layout", [
  "backgroundThumbnailUrl",
  "backgroundColor",
  "top-apply-card",
  "HOME_COLOR_TARGETS",
  "mock-activity",
]);
if (rendererApp.includes("导出旧版兼容 ZIP"))
  failures.push("renderer-exposes-legacy-compatible-export");

const cdp = source("src/main/session/cdp-client.ts");
requireMarkers(cdp, "cdp-client", [
  "browserIdFromVersionUrl",
  'url.hostname !== "127.0.0.1"',
  "AbortSignal.timeout",
  'redirect: "error"',
]);
const session = source("src/main/session/session-service.ts");
requireMarkers(session, "session-contract", [
  "CODEX_SELECTOR_PROFILE",
  "Page.removeScriptToEvaluateOnNewDocument",
  "verifyOwnedIdentity",
  "restoreOrphanedState",
  "TARGET_IDENTITY_MISMATCH",
  "onStateChanged",
  "const baseline = await this.platform.listCodexProcesses();",
]);
if (/if \(!owned \|\| this\.paused\(\)\) return;/u.test(session))
  failures.push("session-watcher-disabled-while-paused");
const themePayload = source("src/main/session/theme-payload.ts");
requireMarkers(themePayload, "theme-payload", [
  "data-ds-part",
  "data-codexstyle-owner",
  "data-codexstyle-part",
  "data-codexstyle-style",
  "threadTabBridge",
  "homeCardBridge",
  "activityBridge",
]);
if (/window\[stateKey\].*cleanup|\.cleanup\?\./u.test(themePayload))
  failures.push("theme-payload-invokes-page-cleanup");
const platform = source("src/main/platform/windows.ts");
requireMarkers(platform, "windows-platform", [
  "Get-AppxPackageManifest",
  "SignatureKind -eq 'Store'",
  "timeout: POWER_SHELL_TIMEOUT_MS",
  "IApplicationActivationManager",
  "StoreApplicationActivator",
  "packageInfo.aumid",
]);
for (const forbidden of [
  "taskkill",
  "killOwnedProcess",
  "existsSync",
  "ExecutionPolicy",
  "explorer.exe",
]) {
  if (platform.includes(forbidden))
    failures.push(`windows-forbidden:${forbidden}`);
}

const sourceFiles = walk(resolve(root, "src/main"));
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const forbidden of [
    "taskkill.exe",
    "takeown",
    "icacls",
    "app.asar",
    "dreamskin://",
  ]) {
    if (text.includes(forbidden))
      failures.push(`main-forbidden:${forbidden}:${relative(file)}`);
  }
  if (
    /(?:from\s+["']electron-updater["']|import\(["']electron-updater["']\))/u.test(
      text,
    ) &&
    relative(file) !== "src/main/infra/electron-updater-gateway.ts"
  )
    failures.push(`updater-import-outside-adapter:${relative(file)}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Architecture boundary checks passed.");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(source(path));
}

function requireMarkers(text, scope, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${scope}:missing:${marker}`);
  }
}

function relative(path) {
  return path.slice(root.length + 1).replaceAll("\\", "/");
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : /\.(?:ts|tsx|mjs)$/u.test(entry.name)
        ? [path]
        : [];
  });
}
