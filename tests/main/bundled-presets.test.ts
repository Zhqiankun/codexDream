import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBundledPresetSource,
  DEFAULT_BUNDLED_PRESET_PACK_ID,
} from "../../src/main/infra/bundled-presets";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import { MANAGED_FILES } from "../../src/main/infra/secure-store";
import { readThemeConfiguration } from "../../src/contracts";
import { createManagedRoot } from "../fixtures/managed-root";

const presetRoot = resolve(process.cwd(), "resources", "presets");
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
  vi.restoreAllMocks();
});

describe("bundled image theme presets", () => {
  it("strictly loads all 13 catalog themes and verifies every image hash", async () => {
    const pack = await createBundledPresetSource(presetRoot).load();

    expect(pack.packId).toBe(DEFAULT_BUNDLED_PRESET_PACK_ID);
    expect(pack.themes).toHaveLength(13);
    expect(new Set(pack.themes.map((theme) => theme.themeId)).size).toBe(13);
    expect(new Set(pack.themes.map((theme) => theme.image)).size).toBe(13);
    expect(
      pack.themes.every(
        (theme) =>
          theme.imageBytes.byteLength === theme.imageInfo.bytes &&
          theme.imageSha256 === theme.imageInfo.sha256 &&
          theme.style.mode === "configured",
      ),
    ).toBe(true);
  });

  it("rejects a catalog whose declared image hash does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-presets-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const catalog = JSON.parse(
      await readFile(join(presetRoot, "catalog.json"), "utf8"),
    ) as {
      themes: Array<{ image: string; imageSha256: string }>;
    };
    catalog.themes = [catalog.themes[0]];
    catalog.themes[0].imageSha256 = "0".repeat(64);
    await writeFile(join(root, "catalog.json"), JSON.stringify(catalog));
    await copyFile(
      join(presetRoot, catalog.themes[0].image),
      join(root, catalog.themes[0].image),
    );

    await expect(createBundledPresetSource(root).load()).rejects.toThrow(
      "BUNDLED_PRESET_PACK_INVALID:image-hash",
    );
  });

  it("adds the pack once to an existing library and respects later deletion", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const original = new LocalThemeStore(managed.root);
    await original.init();
    const originalIds = original.listRecords().map((theme) => theme.libraryId);
    const selected = original.listRecords()[0];
    await original.select(selected.libraryId, selected.revision);
    await original.setPaused(true);
    original.managedStore.close();

    const source = createBundledPresetSource(presetRoot);
    const upgraded = new LocalThemeStore(managed.root, [source]);
    await upgraded.init();
    const themes = upgraded.listRecords();
    expect(themes).toHaveLength(15);
    expect(themes.slice(0, 2).map((theme) => theme.libraryId)).toEqual(
      originalIds,
    );
    expect(themes.slice(2).every((theme) => theme.status === "ready")).toBe(
      true,
    );
    expect(upgraded.selected()?.libraryId).toBe(selected.libraryId);
    expect(
      upgraded.snapshot(
        {
          state: "NO_SESSION",
          messageKey: "session.ready",
          canEnd: false,
          launchedByTool: false,
        },
        { configured: false, status: "unsupported", currentVersion: "test" },
      ).paused,
    ).toBe(true);
    for (const theme of themes.slice(2)) {
      expect(readThemeConfiguration(theme.json).styleConfig.mode).toBe(
        "configured",
      );
      expect(upgraded.getBackground(theme.libraryId)?.byteLength).toBe(
        theme.backgroundBytes,
      );
      expect(theme.fingerprint).toHaveLength(64);
    }
    const stored = JSON.parse(
      upgraded.managedStore.readFile(MANAGED_FILES.index)!.toString("utf8"),
    ) as { installedPresetPacks: string[] };
    expect(stored.installedPresetPacks).toEqual([
      DEFAULT_BUNDLED_PRESET_PACK_ID,
    ]);

    const removed = themes[2];
    await upgraded.delete(removed.libraryId, removed.revision);
    upgraded.managedStore.close();
    const load = vi.fn(async () => {
      throw new Error("pack should not be reloaded");
    });
    const reloaded = new LocalThemeStore(managed.root, [
      { packId: DEFAULT_BUNDLED_PRESET_PACK_ID, load },
    ]);
    await reloaded.init();
    expect(load).not.toHaveBeenCalled();
    expect(reloaded.listRecords()).toHaveLength(14);
    expect(reloaded.get(removed.libraryId)).toBeUndefined();
  });

  it("rolls back every staged image when a pack write fails", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const original = new LocalThemeStore(managed.root);
    await original.init();
    const originalIds = original.listRecords().map((theme) => theme.libraryId);
    original.managedStore.close();

    const prepared = await createBundledPresetSource(presetRoot).load();
    const source = {
      packId: "test-pack",
      load: vi.fn(async () => ({
        packId: "test-pack",
        themes: prepared.themes.slice(0, 2),
      })),
    };
    const failing = new LocalThemeStore(managed.root, [source]);
    const originalWrite = failing.managedStore.writeFileAtomic.bind(
      failing.managedStore,
    );
    let imageWrites = 0;
    vi.spyOn(failing.managedStore, "writeFileAtomic").mockImplementation(
      (file, data) => {
        if (file.directory === "themes") {
          imageWrites += 1;
          if (imageWrites === 2) throw new Error("simulated preset write");
        }
        originalWrite(file, data);
      },
    );

    await expect(failing.init()).rejects.toThrow("simulated preset write");
    expect(failing.listRecords().map((theme) => theme.libraryId)).toEqual(
      originalIds,
    );
    failing.managedStore.close();

    const verified = new LocalThemeStore(managed.root);
    await verified.init();
    expect(verified.listRecords().map((theme) => theme.libraryId)).toEqual(
      originalIds,
    );
    const stored = JSON.parse(
      verified.managedStore.readFile(MANAGED_FILES.index)!.toString("utf8"),
    ) as { installedPresetPacks?: string[] };
    expect(stored.installedPresetPacks).toEqual([]);
  });
});
