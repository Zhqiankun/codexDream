import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const metadata = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const artifacts = [
  resolve(root, "release", `CodexStyle-${metadata.version}-x64.exe`),
  resolve(root, "release", `CodexStyle-${metadata.version}-x64.zip`),
];
const lines = artifacts.map((artifact) => {
  const digest = createHash("sha256")
    .update(readFileSync(artifact))
    .digest("hex");
  return `${digest}  ${basename(artifact)}`;
});

writeFileSync(
  resolve(root, "release", "SHA256SUMS.txt"),
  `${lines.join("\n")}\n`,
  "utf8",
);
console.log("Generated SHA256SUMS.txt for Windows release artifacts.");
