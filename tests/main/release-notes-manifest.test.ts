import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const yaml = createRequire(import.meta.url)("js-yaml") as {
  dump: (value: unknown) => string;
  load: (value: string) => Record<string, unknown>;
};
const fixtureParent = resolve("test-results");
const fixtureRoots: string[] = [];
const version = "1.3.30";
const installerName = `CodexStyle-${version}-x64.exe`;
const installerUrl = `https://github.com/Zhqiankun/codexDream/releases/download/v${version}/${installerName}`;

// 运行真实清单生成脚本，但安装器与 CHANGELOG 都是独立夹具，不修改正式 release。
async function runFinalizer(changelog: string) {
  await mkdir(fixtureParent, { recursive: true });
  const root = await mkdtemp(join(fixtureParent, "update-manifest-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "release"));
  for (const script of ["finalize-update-manifest.mjs", "release-notes.mjs"])
    await writeFile(
      join(root, "scripts", script),
      await readFile(resolve("scripts", script)),
    );
  await writeFile(join(root, "package.json"), JSON.stringify({ version }));
  await writeFile(join(root, "CHANGELOG.md"), changelog);
  await writeFile(join(root, "release", installerName), Buffer.alloc(128));
  const original = yaml.dump({
    version,
    path: installerName,
    sha512: "fixture-sha512",
    files: [{ url: installerName, size: 128, sha512: "fixture-sha512" }],
    releaseDate: "2026-11-02T03:18:33.903Z",
  });
  const manifestPath = join(root, "release", "latest.yml");
  await writeFile(manifestPath, original);
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "finalize-update-manifest.mjs")],
    { encoding: "utf8", cwd: root, timeout: 10_000 },
  );
  return { result, original, text: await readFile(manifestPath, "utf8") };
}

afterEach(async () => {
  for (const root of fixtureRoots.splice(0)) {
    if (!resolve(root).startsWith(`${fixtureParent}${sep}`))
      throw new Error(
        "Refusing to remove a directory outside the test fixture root.",
      );
    await rm(root, { recursive: true, force: true });
  }
});

describe("release notes in the update manifest", () => {
  it("publishes only the current Chinese section, including upgrade guidance", async () => {
    const changelog = [
      "# Changelog",
      `## v${version} — 2026-11-02`,
      "### English",
      "- English description.",
      "### 简体中文",
      "- 新版支持更新说明。",
      "",
      "> 升级前请退出工具。",
      "",
      "## v1.3.29 — 2026-11-02",
      "### 简体中文",
      "- 不应混入旧版说明。",
    ].join("\r\n");
    const { result, text } = await runFinalizer(changelog);
    expect(result.status, result.stderr).toBe(0);
    const manifest = yaml.load(text);
    expect(manifest.releaseNotes).toBe(
      "- 新版支持更新说明。\n\n> 升级前请退出工具。",
    );
    expect(manifest).toMatchObject({
      version,
      path: installerUrl,
      sha512: "fixture-sha512",
      files: [{ url: installerUrl, size: 128, sha512: "fixture-sha512" }],
      releaseDate: "2026-11-02T03:18:33.903Z",
    });
  });

  it("uses English when the current release has no Chinese section", async () => {
    const { result, text } = await runFinalizer(
      `## v${version} — 2026-11-02\n\n### English\n\n- Release description.\n`,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(yaml.load(text).releaseNotes).toBe("- Release description.");
  });

  it.each([
    ["missing", "## v1.3.29 — 2026-11-02\n- Old release"],
    ["empty", `## v${version} — 2026-11-02\n### 简体中文\n`],
    ["oversized", `## v${version} — 2026-11-02\n${"更".repeat(11_000)}`],
    [
      "duplicate",
      `## v${version} — 2026-11-02\n- First\n## v${version} — 2026-11-02\n- Second`,
    ],
  ])(
    "rejects %s release notes without modifying the original manifest",
    async (_label, changelog) => {
      const { result, original, text } = await runFinalizer(changelog);
      expect(result.status).not.toBe(0);
      expect(text).toBe(original);
    },
  );
});
