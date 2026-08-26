import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const icon = resolve(root, "resources", "icon.ico");
const required = [
  "package.json",
  "electron-builder.yml",
  "out/main/index.js",
  "out/preload/index.cjs",
  "out/renderer/index.html",
  "native/secure-store/build/Release/secure_store.node",
  "resources/icon.ico",
  "resources/icon.png",
  "release/win-unpacked/resources/app.asar",
  "release/win-unpacked/resources/native/secure_store.node",
  "release/win-unpacked/CodexStyle.exe",
  `release/CodexStyle-${metadata.version}-x64.exe`,
];
const missing = required.filter((entry) => !existsSync(resolve(root, entry)));
if (missing.length) {
  console.error(`Package verification failed; missing: ${missing.join(", ")}`);
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

for (const [label, path] of [
  ["application", executable],
  ["native addon", nativeAddon],
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
} catch (error) {
  console.error(
    `Package verification failed; native addon did not load: ${String(error)}`,
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
