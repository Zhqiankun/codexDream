import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const metadata = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
if (
  typeof metadata.version !== "string" ||
  !/^\d+\.\d+\.\d+$/u.test(metadata.version)
) {
  throw new Error("Cannot finalize update manifest for an invalid version.");
}

const installerName = `CodexStyle-${metadata.version}-x64.exe`;
const assetUrl =
  `https://github.com/Zhqiankun/codexDream/releases/download/` +
  `v${metadata.version}/${installerName}`;
const installer = resolve(root, "release", installerName);
const manifestPath = resolve(root, "release", "latest.yml");
const manifest = loadYaml(readFileSync(manifestPath, "utf8"));
if (!isRecord(manifest) || !Array.isArray(manifest.files))
  throw new Error("latest.yml is not a valid update manifest.");

const files = manifest.files.filter(isRecord);
const file = files.length === 1 ? files[0] : undefined;
if (
  manifest.version !== metadata.version ||
  ![installerName, assetUrl].includes(manifest.path) ||
  !file ||
  ![installerName, assetUrl].includes(file.url) ||
  file.size !== statSync(installer).size ||
  typeof file.sha512 !== "string" ||
  manifest.sha512 !== file.sha512
) {
  throw new Error("latest.yml does not match the packaged installer.");
}

file.url = assetUrl;
manifest.path = assetUrl;

writeFileSync(
  manifestPath,
  dumpYaml(manifest, { lineWidth: -1, noRefs: true }),
  "utf8",
);
console.log("Finalized latest.yml with immutable GitHub release asset URLs.");

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
