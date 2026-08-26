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
      devDependencies: Record<string, string | undefined>;
    };
    const builderConfig = await readFile(
      resolve(root, "electron-builder.yml"),
      "utf8",
    );

    expect(packageJson.devDependencies["node-gyp"]).toBe("12.4.0");
    expect(packageJson.scripts["build:native"]).toBe(
      "node scripts/build-native.mjs",
    );
    expect(packageJson.scripts.build).toBe(
      "npm run build:icons && npm run build:native && electron-vite build",
    );
    expect(packageJson.scripts["package:win"]).toBe(
      "npm run build && electron-builder --win --x64",
    );
    expect(builderConfig).toMatch(
      /extraResources:\s*[\s\S]*from: native\/secure-store\/build\/Release\/secure_store\.node\s*[\s\S]*to: native\/secure_store\.node/u,
    );
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
    expect(main).toContain('app.on("before-quit", () => controller.dispose())');
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
