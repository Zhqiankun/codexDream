import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { load as loadYaml } from "js-yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const unpacked = resolve(root, "release", "win-unpacked");
const nativeAddon = resolve(
  unpacked,
  "resources",
  "native",
  "secure_store.node",
);
const metadata = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const presetCatalogPath = resolve(root, "resources", "presets", "catalog.json");
const presetCatalogBytes = readFileSync(presetCatalogPath);
const presetCatalog = JSON.parse(presetCatalogBytes.toString("utf8"));
const pluginRoot = "plugins/codexstyle-assistant";
const marketplaceManifest = ".agents/plugins/marketplace.json";
const pluginFiles = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "mcp/dist/server.mjs",
  "runtime/node.exe",
  "runtime/LICENSE-node.txt",
  "skills/codexstyle-theme-designer/SKILL.md",
  "skills/codexstyle-theme-designer/agents/openai.yaml",
  "skills/codexstyle-theme-designer/references/palette-contract.md",
];
const presetThemes = Array.isArray(presetCatalog.themes)
  ? presetCatalog.themes
  : [];
if (
  presetCatalog.schemaVersion !== 4 ||
  typeof presetCatalog.packId !== "string" ||
  !Array.isArray(presetCatalog.replacesPackIds) ||
  presetCatalog.replacesPackIds.length !== 6 ||
  presetCatalog.replacesPackIds[0] !== "user-wallpapers-2026-08-29-v1" ||
  presetCatalog.replacesPackIds[1] !== "user-wallpapers-2026-08-29-v2" ||
  presetCatalog.replacesPackIds[2] !== "user-wallpapers-2026-08-29-v3" ||
  presetCatalog.replacesPackIds[3] !== "user-wallpapers-2026-08-30-v4" ||
  presetCatalog.replacesPackIds[4] !== "user-wallpapers-2026-08-30-v5" ||
  presetCatalog.replacesPackIds[5] !== "user-wallpapers-2026-08-30-v6" ||
  !Array.isArray(presetCatalog.introducedThemeIds) ||
  presetCatalog.introducedThemeIds.length !== 12 ||
  new Set(presetCatalog.introducedThemeIds).size !== 12 ||
  presetThemes.length !== 25 ||
  presetThemes.some(
    (theme) =>
      !isRecord(theme) ||
      typeof theme.image !== "string" ||
      !/^[a-z0-9][a-z0-9.-]{0,79}\.(?:png|jpg|webp)$/u.test(theme.image) ||
      typeof theme.imageSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(theme.imageSha256) ||
      !Array.isArray(theme.previousImageSha256) ||
      theme.previousImageSha256.length > 8 ||
      theme.previousImageSha256.some(
        (fingerprint) => !/^[a-f0-9]{64}$/u.test(fingerprint),
      ) ||
      !Array.isArray(theme.previousFingerprints) ||
      theme.previousFingerprints.length > 8 ||
      theme.previousFingerprints.some(
        (fingerprint) => !/^[a-f0-9]{64}$/u.test(fingerprint),
      ),
  )
) {
  console.error("Package verification failed; preset catalog is invalid.");
  process.exit(1);
}
if (
  typeof metadata.version !== "string" ||
  !/^\d+\.\d+\.\d+$/u.test(metadata.version)
) {
  console.error("Package verification failed; package version is invalid.");
  process.exit(1);
}
const executable = resolve(unpacked, "CodexStyle.exe");
const installer = resolve(
  root,
  "release",
  `CodexStyle-${metadata.version}-x64.exe`,
);
const archive = resolve(
  root,
  "release",
  `CodexStyle-${metadata.version}-x64.zip`,
);
const pluginRuntime = resolve(
  unpacked,
  "resources",
  pluginRoot,
  "runtime",
  "node.exe",
);
const blockmap = `${installer}.blockmap`;
const latestManifest = resolve(root, "release", "latest.yml");
const packagedUpdateConfig = resolve(unpacked, "resources", "app-update.yml");
const icon = resolve(root, "resources", "icon.ico");
const required = [
  "package.json",
  "electron-builder.yml",
  "out/main/index.js",
  "out/preload/index.cjs",
  "out/renderer/index.html",
  "native/secure-store/build/Release/secure_store.node",
  "resources/icon-source.png",
  "resources/icon.ico",
  "resources/icon.png",
  "resources/tray-icon.png",
  "resources/tray-icon@2x.png",
  "resources/presets/catalog.json",
  ...presetThemes.map((theme) => `resources/presets/${theme.image}`),
  ...pluginFiles.map((file) => `${pluginRoot}/${file}`),
  marketplaceManifest,
  "release/win-unpacked/resources/app.asar",
  "release/win-unpacked/resources/icon.png",
  "release/win-unpacked/resources/native/secure_store.node",
  "release/win-unpacked/resources/tray-icon.png",
  "release/win-unpacked/resources/tray-icon@2x.png",
  ...pluginFiles.map(
    (file) => `release/win-unpacked/resources/${pluginRoot}/${file}`,
  ),
  `release/win-unpacked/resources/${marketplaceManifest}`,
  "release/win-unpacked/CodexStyle.exe",
  `release/CodexStyle-${metadata.version}-x64.exe`,
  `release/CodexStyle-${metadata.version}-x64.exe.blockmap`,
  "release/latest.yml",
  `release/CodexStyle-${metadata.version}-x64.zip`,
  "release/win-unpacked/resources/app-update.yml",
  "release/SHA256SUMS.txt",
];
const missing = required.filter((entry) => !existsSync(resolve(root, entry)));
if (missing.length) {
  console.error(`Package verification failed; missing: ${missing.join(", ")}`);
  process.exit(1);
}

if (
  !readFileSync(resolve(root, marketplaceManifest)).equals(
    readFileSync(resolve(unpacked, "resources", marketplaceManifest)),
  )
) {
  console.error(
    "Package verification failed; CodexStyle marketplace manifest differs.",
  );
  process.exit(1);
}

if (process.platform !== "win32" || process.arch !== "x64") {
  console.error("Package verification requires a Windows x64 host.");
  process.exit(1);
}

if (statSync(installer).size < 1024 * 1024) {
  console.error(
    "Package verification failed; installer is unexpectedly small.",
  );
  process.exit(1);
}

if (statSync(archive).size < 1024 * 1024) {
  console.error(
    "Package verification failed; portable archive is unexpectedly small.",
  );
  process.exit(1);
}

const expectedChecksums = [installer, blockmap, latestManifest, archive]
  .map((path) => {
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    return `${hash}  ${path.split(/[\\/]/u).at(-1)}`;
  })
  .join("\n");
const actualChecksums = readFileSync(
  resolve(root, "release", "SHA256SUMS.txt"),
  "utf8",
).trim();
if (actualChecksums !== expectedChecksums) {
  console.error("Package verification failed; release checksums do not match.");
  process.exit(1);
}

const installerName = `CodexStyle-${metadata.version}-x64.exe`;
const installerUrl =
  `https://github.com/Zhqiankun/codexDream/releases/download/` +
  `v${metadata.version}/${installerName}`;
const installerBytes = readFileSync(installer);
const installerSha512 = createHash("sha512")
  .update(installerBytes)
  .digest("base64");
const latest = parseYamlObject(latestManifest, "latest.yml");
const latestFiles = Array.isArray(latest.files) ? latest.files : [];
const installerFiles = latestFiles.filter(
  (entry) => isRecord(entry) && entry.url === installerUrl,
);
if (
  latest.version !== metadata.version ||
  latest.path !== installerUrl ||
  latest.sha512 !== installerSha512 ||
  installerFiles.length !== 1 ||
  installerFiles[0].sha512 !== installerSha512 ||
  installerFiles[0].size !== installerBytes.length ||
  typeof latest.releaseDate !== "string" ||
  !Number.isFinite(Date.parse(latest.releaseDate))
) {
  console.error(
    "Package verification failed; latest.yml does not match the installer.",
  );
  process.exit(1);
}

const updateConfig = parseYamlObject(packagedUpdateConfig, "app-update.yml");
if (
  updateConfig.provider !== "generic" ||
  updateConfig.url !==
    "https://github.com/Zhqiankun/codexDream/releases/latest/download/" ||
  typeof updateConfig.updaterCacheDirName !== "string" ||
  !updateConfig.updaterCacheDirName
) {
  console.error(
    "Package verification failed; packaged update source is not fixed.",
  );
  process.exit(1);
}

let blockmapPayload;
try {
  blockmapPayload = JSON.parse(gunzipSync(readFileSync(blockmap)).toString());
} catch {
  console.error("Package verification failed; NSIS blockmap is invalid.");
  process.exit(1);
}
const blockmapRecord = isRecord(blockmapPayload) ? blockmapPayload : {};
const blockmapFiles = Array.isArray(blockmapRecord.files)
  ? blockmapRecord.files
  : [];
const blockmapFile = blockmapFiles.length === 1 ? blockmapFiles[0] : undefined;
const blockmapFileRecord = isRecord(blockmapFile) ? blockmapFile : {};
const sizes = Array.isArray(blockmapFileRecord.sizes)
  ? blockmapFileRecord.sizes
  : [];
const blockChecksums = Array.isArray(blockmapFileRecord.checksums)
  ? blockmapFileRecord.checksums
  : [];
if (
  blockmapRecord.version !== "2" ||
  blockmapFileRecord.name !== "file" ||
  blockmapFileRecord.offset !== 0 ||
  sizes.length === 0 ||
  sizes.length !== blockChecksums.length ||
  !sizes.every((size) => Number.isSafeInteger(size) && size > 0) ||
  sizes.reduce((total, size) => total + size, 0) !== installerBytes.length
) {
  console.error(
    "Package verification failed; NSIS blockmap does not match the installer.",
  );
  process.exit(1);
}

for (const [label, path] of [
  ["application", executable],
  ["native addon", nativeAddon],
  ["plugin Node runtime", pluginRuntime],
]) {
  if (peMachine(path) !== 0x8664) {
    console.error(`Package verification failed; ${label} is not Windows x64.`);
    process.exit(1);
  }
}

const iconBytes = readFileSync(icon);
const iconImageOffset = iconBytes.length >= 22 ? iconBytes.readUInt32LE(18) : 0;
if (
  iconBytes.length < 30 ||
  iconBytes.readUInt16LE(0) !== 0 ||
  iconBytes.readUInt16LE(2) !== 1 ||
  iconBytes.readUInt16LE(4) < 1 ||
  iconImageOffset < 22 ||
  !iconBytes
    .subarray(iconImageOffset, iconImageOffset + 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
) {
  console.error("Package verification failed; Windows icon is invalid.");
  process.exit(1);
}

const adapter = readFileSync(
  resolve(root, "src/main/infra/secure-store.ts"),
  "utf8",
);
if (adapter.includes("node:fs") || !adapter.includes("native-unavailable")) {
  console.error(
    "Package verification failed; secure-store fallback policy changed.",
  );
  process.exit(1);
}

try {
  const require = createRequire(import.meta.url);
  const native = require(nativeAddon);
  if (typeof native.open !== "function") throw new Error("invalid export");
  const asar = require("@electron/asar");
  const asarPath = resolve(unpacked, "resources", "app.asar");
  const entries = asar.listPackage(asarPath);
  if (
    !entries.some(
      (entry) =>
        entry.replaceAll("\\", "/") ===
        "/node_modules/electron-updater/out/main.js",
    )
  )
    throw new Error("electron-updater runtime missing");
  if (
    entries.some((entry) =>
      entry
        .replaceAll("\\", "/")
        .startsWith("/node_modules/@modelcontextprotocol/sdk/"),
    )
  )
    throw new Error("MCP build-only SDK leaked into app.asar");
  const packagedYaml = JSON.parse(
    asar
      .extractFile(
        asarPath,
        asarLookupPath("node_modules/js-yaml/package.json"),
      )
      .toString("utf8"),
  );
  if (packagedYaml.version !== "4.3.2")
    throw new Error("fixed js-yaml runtime missing");
  const packagedCatalog = asar.extractFile(
    asarPath,
    asarLookupPath("resources/presets/catalog.json"),
  );
  if (!packagedCatalog.equals(presetCatalogBytes))
    throw new Error("preset catalog changed during packaging");
  for (const theme of presetThemes) {
    const entry = `resources/presets/${theme.image}`;
    if (
      !entries.some(
        (candidate) => candidate.replaceAll("\\", "/") === `/${entry}`,
      )
    )
      throw new Error(`preset asset missing: ${theme.image}`);
    const bytes = asar.extractFile(asarPath, asarLookupPath(entry));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== theme.imageSha256)
      throw new Error(`preset asset hash changed: ${theme.image}`);
  }
  for (const file of pluginFiles) {
    const sourceBytes = readFileSync(resolve(root, pluginRoot, file));
    const packagedBytes = readFileSync(
      resolve(unpacked, "resources", pluginRoot, file),
    );
    if (!packagedBytes.equals(sourceBytes))
      throw new Error(`plugin asset changed during packaging: ${file}`);
  }
} catch (error) {
  console.error(
    `Package verification failed; packaged runtime validation failed: ${String(error)}`,
  );
  process.exit(1);
}

console.log("Package layout and native secure-store verified.");

function peMachine(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 0x40 || bytes.toString("ascii", 0, 2) !== "MZ") return 0;
  const peOffset = bytes.readUInt32LE(0x3c);
  if (
    peOffset < 0x40 ||
    peOffset + 6 > bytes.length ||
    bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0"
  )
    return 0;
  return bytes.readUInt16LE(peOffset + 4);
}

function asarLookupPath(entry) {
  return entry.replaceAll("/", "\\");
}

function parseYamlObject(path, label) {
  const value = loadYaml(readFileSync(path, "utf8"));
  if (!isRecord(value)) {
    console.error(`Package verification failed; ${label} is not an object.`);
    process.exit(1);
  }
  return value;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
