import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBundledPresetSource,
  MASCOT_BUNDLED_PRESET_PACK_ID,
} from "../../src/main/infra/bundled-presets";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import {
  MANAGED_FILES,
  managedThemeFile,
} from "../../src/main/infra/secure-store";
import { createManagedRoot } from "../fixtures/managed-root";

const source = () =>
  createBundledPresetSource(
    resolve("resources/presets", MASCOT_BUNDLED_PRESET_PACK_ID),
    MASCOT_BUNDLED_PRESET_PACK_ID,
  );
const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
// 每个场景完整解码 18 张发行图片；事务场景还会验证受管副本和重启读取。
const presetTestTimeout = 30_000;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

describe("mascot reasoning preset pack", () => {
  it(
    "loads three six-stage themes with verified hashes and low normal backgrounds",
    async () => {
      const pack = await source().load();
      expect(pack.replacesPackIds).toEqual([]);
      expect(pack.themes).toHaveLength(3);
      for (const theme of pack.themes) {
        expect(theme.themeId).toMatch(/^[a-f0-9-]{36}$/u);
        expect(theme.backgroundMode).toBe("reasoning");
        expect(theme.homeCards).toHaveLength(4);
        expect(Object.keys(theme.reasoningImages!)).toEqual(efforts);
        expect(theme.imageBytes.equals(theme.reasoningImages!.low!)).toBe(true);
        expect(
          new Set(
            Object.values(theme.reasoningBackgrounds!).map(
              (asset) => asset.imageSha256,
            ),
          ).size,
        ).toBe(6);
      }
    },
    presetTestTimeout,
  );

  it(
    "installs six distinct managed images, survives restart, and does not revive deletions",
    async () => {
      const managed = await createManagedRoot();
      cleanup.push(managed.cleanup);
      const store = new LocalThemeStore(managed.root, [source()]);
      await store.init();
      expect(store.listRecords()).toHaveLength(5);
      const theme = store
        .listRecords()
        .find((item) => item.json.backgroundMode === "reasoning")!;
      expect(theme.status).toBe("ready");
      expect(
        Object.keys(store.getReasoningBackgrounds(theme.libraryId)),
      ).toEqual(efforts);
      const files = [
        theme.backgroundFile,
        ...Object.values(theme.reasoningBackgrounds!).map(
          (asset) => asset.file,
        ),
      ];
      expect(new Set(files).size).toBe(7);
      expect(store.selected()).toBeUndefined();
      await store.delete(theme.libraryId, theme.revision);
      store.managedStore.close();
      const nextSource = source();
      const load = vi.spyOn(nextSource, "load");
      const reopened = new LocalThemeStore(managed.root, [nextSource]);
      await reopened.init();
      expect(reopened.listRecords()).toHaveLength(4);
      expect(reopened.get(theme.libraryId)).toBeUndefined();
      expect(load).not.toHaveBeenCalled();
      reopened.managedStore.close();
    },
    presetTestTimeout,
  );

  it(
    "preserves an already imported and user-edited theme with the same portable ID",
    async () => {
      const managed = await createManagedRoot();
      cleanup.push(managed.cleanup);
      const pack = await source().load();
      const firstSource = {
        packId: "preexisting-import-fixture",
        load: async () => ({
          ...pack,
          packId: "preexisting-import-fixture",
          themes: [pack.themes[0]],
          introducedThemeIds: [pack.themes[0].themeId],
        }),
      };
      const original = new LocalThemeStore(managed.root, [firstSource]);
      await original.init();
      const theme = original
        .listRecords()
        .find((item) => item.themeId === pack.themes[0].themeId)!;
      const selected = original.listRecords()[0];
      await original.select(selected.libraryId, selected.revision);
      await original.markLastKnownGood(
        selected.libraryId,
        selected.fingerprint!,
      );
      const edited = await original.patch(theme.libraryId, theme.revision, {
        name: "User edited mascot",
      });
      const beforeIndex = JSON.parse(
        original.managedStore.readFile(MANAGED_FILES.index)!.toString("utf8"),
      );
      original.managedStore.close();
      const upgraded = new LocalThemeStore(managed.root, [source()]);
      await upgraded.init();
      expect(upgraded.listRecords()).toHaveLength(5);
      expect(upgraded.get(theme.libraryId)).toEqual(edited);
      const afterIndex = JSON.parse(
        upgraded.managedStore.readFile(MANAGED_FILES.index)!.toString("utf8"),
      );
      expect(afterIndex.selectedLibraryId).toBe(beforeIndex.selectedLibraryId);
      expect(afterIndex.lastKnownGoodLibraryId).toBe(
        beforeIndex.lastKnownGoodLibraryId,
      );
      expect(afterIndex.checkpoints).toEqual(beforeIndex.checkpoints);
      expect(beforeIndex.checkpoints).toHaveLength(1);
      upgraded.managedStore.close();
    },
    presetTestTimeout,
  );

  it(
    "rolls back the entire pack when committing its index fails",
    async () => {
      const managed = await createManagedRoot();
      cleanup.push(managed.cleanup);
      const base = new LocalThemeStore(managed.root);
      await base.init();
      const before = base.managedStore.readFile(MANAGED_FILES.index)!;
      base.managedStore.close();
      const store = new LocalThemeStore(managed.root, [source()]);
      const write = store.managedStore.writeFileAtomic.bind(store.managedStore);
      const stagedFiles: string[] = [];
      let failed = false;
      vi.spyOn(store.managedStore, "writeFileAtomic").mockImplementation(
        (path, bytes) => {
          if (path.directory === "themes") stagedFiles.push(path.fileName);
          if (path === MANAGED_FILES.index && !failed) {
            failed = true;
            throw new Error("injected index failure");
          }
          return write(path, bytes);
        },
      );
      await expect(store.init()).rejects.toThrow();
      expect(store.listRecords()).toHaveLength(2);
      expect(store.managedStore.readFile(MANAGED_FILES.index)).toEqual(before);
      expect(new Set(stagedFiles).size).toBe(21);
      for (const file of stagedFiles)
        expect(
          store.managedStore.readFile(managedThemeFile(file)),
        ).toBeUndefined();
      store.managedStore.close();
      const retry = new LocalThemeStore(managed.root, [source()]);
      await retry.init();
      expect(retry.listRecords()).toHaveLength(5);
      retry.managedStore.close();
    },
    presetTestTimeout,
  );
});
