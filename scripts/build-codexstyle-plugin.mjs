import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(
  root,
  "plugins",
  "codexstyle-assistant",
  "mcp",
  "dist",
);
const runtimeDirectory = resolve(
  root,
  "plugins",
  "codexstyle-assistant",
  "runtime",
);

if (
  process.platform !== "win32" ||
  process.arch !== "x64" ||
  process.version !== "v22.22.0"
) {
  throw new Error(
    "CodexStyle plugin runtime must be built with Node.js 22.22.0 on Windows x64.",
  );
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(runtimeDirectory, { recursive: true });
await build({
  entryPoints: [
    resolve(root, "plugins", "codexstyle-assistant", "mcp", "src", "server.ts"),
  ],
  outfile: resolve(outputDirectory, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
});
const bundlePath = resolve(outputDirectory, "server.mjs");
const bundleSource = await readFile(bundlePath, "utf8");
await writeFile(bundlePath, bundleSource.replace(/[ \t]+$/gmu, ""), "utf8");
await copyFile(process.execPath, resolve(runtimeDirectory, "node.exe"));
