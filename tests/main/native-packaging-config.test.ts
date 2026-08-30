import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

describe("native secure-store packaging", () => {
  it("builds the source addon and ships it outside app.asar", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string | undefined>;
      dependencies: Record<string, string | undefined>;
      devDependencies: Record<string, string | undefined>;
    };
    const builderConfig = await readFile(
      resolve(root, "electron-builder.yml"),
      "utf8",
    );

    expect(packageJson.devDependencies["node-gyp"]).toBe("12.4.0");
    expect(packageJson.devDependencies["@modelcontextprotocol/sdk"]).toBe(
      "1.30.0",
    );
    expect(packageJson.devDependencies["js-yaml"]).toBe("4.3.2");
    expect(
      packageJson.dependencies["@modelcontextprotocol/sdk"],
    ).toBeUndefined();
    expect(packageJson.dependencies["electron-updater"]).toBe("6.8.9");
    expect(packageJson.scripts["build:native"]).toBe(
      "node scripts/build-native.mjs",
    );
    expect(packageJson.scripts["build:plugin"]).toBe(
      "node scripts/build-codexstyle-plugin.mjs",
    );
    expect(packageJson.scripts.build).toBe(
      "npm run build:icons && npm run build:native && npm run build:plugin && electron-vite build",
    );
    expect(packageJson.scripts["package:win"]).toContain(
      "npm run release:checksums",
    );
    expect(packageJson.scripts["package:win"]).toContain("--publish never");
    expect(packageJson.scripts["package:win"]).toContain(
      "npm run release:update-manifest",
    );
    expect(packageJson.scripts["release:update-manifest"]).toBe(
      "node scripts/finalize-update-manifest.mjs",
    );
    expect(builderConfig).toMatch(
      /extraResources:\s*[\s\S]*from: native\/secure-store\/build\/Release\/secure_store\.node\s*[\s\S]*to: native\/secure_store\.node/u,
    );
    expect(builderConfig).toMatch(
      /from: \.agents\/plugins\/marketplace\.json\s*[\s\S]*to: \.agents\/plugins\/marketplace\.json/u,
    );
    expect(builderConfig).toMatch(
      /from: plugins\/codexstyle-assistant\s*[\s\S]*to: plugins\/codexstyle-assistant/u,
    );
    expect(builderConfig).toContain("runtime/**");
    expect(builderConfig).toMatch(
      /from: resources\/icon\.png\s*[\s\S]*to: icon\.png/u,
    );
    expect(builderConfig).toMatch(
      /from: resources\/tray-icon\.png\s*[\s\S]*to: tray-icon\.png/u,
    );
    expect(builderConfig).toContain("resources/presets/**");
    expect(builderConfig).toMatch(/target: nsis[\s\S]*target: zip/u);
    expect(builderConfig).toContain("include: resources/installer.nsh");
    expect(builderConfig).toContain("provider: generic");
    expect(builderConfig).toContain(
      "url: https://github.com/Zhqiankun/codexDream/releases/latest/download/",
    );
    expect(packageJson.scripts["release:checksums"]).toBe(
      "node scripts/generate-checksums.mjs",
    );
  });

  it("packages an installation marker and immutable update metadata", async () => {
    const installerInclude = await readFile(
      resolve(root, "resources/installer.nsh"),
      "utf8",
    );
    const verifyScript = await readFile(
      resolve(root, "scripts/verify-package.mjs"),
      "utf8",
    );
    const manifestScript = await readFile(
      resolve(root, "scripts/finalize-update-manifest.mjs"),
      "utf8",
    );
    const releaseWorkflow = await readFile(
      resolve(root, ".github/workflows/release.yml"),
      "utf8",
    );

    expect(installerInclude).toContain("$INSTDIR\\.codexstyle-installed");
    expect(installerInclude).toContain("com.codexstyle.desktop/v1");
    expect(verifyScript).toContain('"release/latest.yml"');
    expect(verifyScript).toContain(".exe.blockmap");
    expect(verifyScript).toContain('createHash("sha512")');
    expect(verifyScript).toContain('"resources/presets/catalog.json"');
    expect(verifyScript).toContain("preset asset hash changed");
    expect(manifestScript).toContain("releases/download/");
    expect(manifestScript).toContain("v${metadata.version}/${installerName}");
    expect(releaseWorkflow).toContain("release/latest.yml");
    expect(releaseWorkflow).toContain("release/CodexStyle-*-x64.exe.blockmap");
    expect(releaseWorkflow).toContain("already public and immutable");
    expect(releaseWorkflow).toContain("must be newer than the current stable");
    expect(releaseWorkflow).toContain("group: release-stable-channel");
  });

  it("closes the managed root during Electron shutdown", async () => {
    const main = await readFile(resolve(root, "src/main/index.ts"), "utf8");
    const controller = await readFile(
      resolve(root, "src/main/app/controller.ts"),
      "utf8",
    );

    expect(controller).toContain("dispose(): void");
    expect(controller).toContain("this.quitting = true");
    expect(controller).toContain("this.store.managedStore.close()");
    expect(main).toMatch(
      /app\.on\("before-quit", \(\) => \{[\s\S]*controller\.dispose\(\);[\s\S]*logger\.dispose\(\);/u,
    );
  });

  it("does not enable a browser-specific V8 snapshot fuse without shipping its snapshot", async () => {
    const builderConfig = await readFile(
      resolve(root, "electron-builder.yml"),
      "utf8",
    );

    expect(builderConfig).not.toMatch(
      /loadBrowserProcessSpecificV8Snapshot:\s*true/u,
    );
  });

  it("builds the sandbox preload as CommonJS and loads that file", async () => {
    const viteConfig = await readFile(
      resolve(root, "electron.vite.config.ts"),
      "utf8",
    );
    const controller = await readFile(
      resolve(root, "src/main/app/controller.ts"),
      "utf8",
    );

    expect(viteConfig).toMatch(
      /preload:[\s\S]*format:\s*["']cjs["'][\s\S]*entryFileNames:\s*["']index\.cjs["']/u,
    );
    expect(controller).toContain('join(__dirname, "../preload/index.cjs")');
  });

  it("bundles preload runtime dependencies instead of externalizing zod", async () => {
    const viteConfig = await readFile(
      resolve(root, "electron.vite.config.ts"),
      "utf8",
    );
    const preloadSource = await readFile(
      resolve(root, "src/preload/index.ts"),
      "utf8",
    );

    expect(preloadSource).toContain('from "../contracts"');
    expect(viteConfig).not.toMatch(
      /preload:\s*\{[\s\S]*externalizeDepsPlugin\(\)/u,
    );
    expect(viteConfig).toMatch(
      /preload:\s*\{[\s\S]*build:\s*\{[\s\S]*externalizeDeps:\s*false/u,
    );
  });
});
