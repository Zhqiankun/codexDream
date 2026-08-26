import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nativeDirectory = resolve(root, "native", "secure-store");
const output = resolve(
  nativeDirectory,
  "build",
  "Release",
  "secure_store.node",
);

if (process.platform !== "win32" || process.arch !== "x64") {
  console.error("CodexStyle native secure-store requires Windows x64.");
  process.exit(1);
}

const require = createRequire(import.meta.url);
let nodeGypEntry;
try {
  nodeGypEntry = require.resolve("node-gyp/bin/node-gyp.js");
} catch {
  console.error("node-gyp 12.4.0 is required to build secure-store.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [nodeGypEntry, "rebuild", "--directory", nativeDirectory, "--arch=x64"],
  {
    cwd: root,
    env: {
      ...process.env,
      npm_config_arch: "x64",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error || result.status !== 0 || !existsSync(output)) {
  console.error("secure-store native build failed.");
  process.exit(1);
}
