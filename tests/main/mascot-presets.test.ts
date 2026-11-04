import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readThemeConfiguration } from "../../src/contracts";
import {
  createBundledPresetSource,
  DIVINE_ULTRA_BUNDLED_PRESET_PACK_ID,
  MASCOT_BUNDLED_PRESET_PACK_ID,
  REDESIGNED_MASCOT_BUNDLED_PRESET_PACK_ID,
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
const redesignedSource = () =>
  createBundledPresetSource(
    resolve("resources/presets", REDESIGNED_MASCOT_BUNDLED_PRESET_PACK_ID),
    REDESIGNED_MASCOT_BUNDLED_PRESET_PACK_ID,
  );
const divineUltraSource = () =>
  createBundledPresetSource(
    resolve("resources/presets", DIVINE_ULTRA_BUNDLED_PRESET_PACK_ID),
    DIVINE_ULTRA_BUNDLED_PRESET_PACK_ID,
  );
const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
// 每个场景完整解码 18 张发行图片；事务场景还会验证受管副本和重启读取。
const presetTestTimeout = 30_000;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

describe("mascot reasoning preset pack", () => {
  it("installs four redesigned themes with all 24 verified stages in a fresh library", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const pack = await redesignedSource().load();
    expect(pack.themes).toHaveLength(4);
    expect(pack.replacesPackIds).toEqual([MASCOT_BUNDLED_PRESET_PACK_ID]);
    expect(pack.introducedThemeIds).toHaveLength(1);
    const store = new LocalThemeStore(managed.root, [
      { packId: pack.packId, load: async () => pack },
    ]);
    await store.init();
    expect(store.listRecords()).toHaveLength(6);
    for (const expected of pack.themes) {
      const theme = store
        .listRecords()
        .find((item) => item.themeId === expected.themeId)!;
      expect(theme.name).toBe(expected.name);
      expect(
        Object.keys(store.getReasoningBackgrounds(theme.libraryId)),
      ).toEqual(efforts);
      for (const effort of efforts)
        expect(
          store
            .getReasoningBackgrounds(theme.libraryId)
            [effort]!.equals(expected.reasoningImages![effort]!),
        ).toBe(true);
      expect(
        store
          .getBackground(theme.libraryId)!
          .equals(expected.reasoningImages!.low!),
      ).toBe(true);
      expect(
        new Set(
          Object.values(expected.reasoningBackgrounds!).map(
            (asset) => asset.imageSha256,
          ),
        ).size,
      ).toBe(6);
    }
    store.managedStore.close();
  }, 60_000);

  it("upgrades actual v9 assets in place, adds GPT once, and retains selection and recovery references", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const legacy = new LocalThemeStore(managed.root, [source()]);
    await legacy.init();
    const originals = legacy
      .listRecords()
      .filter((item) => item.json.backgroundMode === "reasoning")
      .map((item) => structuredClone(item));
    await legacy.select(originals[0].libraryId, originals[0].revision);
    await legacy.markLastKnownGood(
      originals[0].libraryId,
      originals[0].fingerprint!,
    );
    legacy.managedStore.close();
    const pack = await redesignedSource().load();
    for (const original of originals) {
      const expected = pack.themes.find(
        (item) => item.themeId === original.themeId,
      )!;
      expect(expected.previousFingerprints).toContain(original.fingerprint);
      expect(expected.previousImageSha256).toContain(original.backgroundSha256);
    }
    const next = { packId: pack.packId, load: vi.fn(async () => pack) };
    const store = new LocalThemeStore(managed.root, [next]);
    await store.init();
    expect(store.listRecords()).toHaveLength(6);
    for (const original of originals) {
      const updated = store.get(original.libraryId)!;
      const expected = pack.themes.find(
        (item) => item.themeId === original.themeId,
      )!;
      expect(updated).toMatchObject({
        themeId: original.themeId,
        name: original.name,
        revision: original.revision + 1,
      });
      expect(
        store.getBackground(updated.libraryId)!.equals(expected.imageBytes),
      ).toBe(true);
      for (const effort of efforts)
        expect(
          store
            .getReasoningBackgrounds(updated.libraryId)
            [effort]!.equals(expected.reasoningImages![effort]!),
        ).toBe(true);
      for (const oldFile of [
        original.backgroundFile!,
        ...Object.values(original.reasoningBackgrounds!).map(
          (asset) => asset.file,
        ),
      ]) {
        expect(
          store.managedStore.readFile(managedThemeFile(oldFile)),
        ).toBeUndefined();
      }
    }
    const after = store.managedStore.readFile(MANAGED_FILES.index)!;
    expect(JSON.parse(after.toString())).toMatchObject({
      selectedLibraryId: originals[0].libraryId,
      lastKnownGoodLibraryId: originals[0].libraryId,
    });
    store.managedStore.close();
    next.load.mockClear();
    const reopened = new LocalThemeStore(managed.root, [next]);
    await reopened.init();
    expect(next.load).not.toHaveBeenCalled();
    expect(reopened.managedStore.readFile(MANAGED_FILES.index)).toEqual(after);
    expect(reopened.listRecords()).toHaveLength(6);
    reopened.managedStore.close();
  }, 60_000);

  it("keeps edited ready themes, draft checkpoints, and deleted v9 themes untouched", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const legacy = new LocalThemeStore(managed.root, [source()]);
    await legacy.init();
    const originals = legacy
      .listRecords()
      .filter((item) => item.json.backgroundMode === "reasoning");
    const edited = await legacy.patch(
      originals[0].libraryId,
      originals[0].revision,
      { name: "User's saved mascot" },
    );
    await legacy.commit(edited.libraryId, edited.revision);
    await legacy.patch(originals[1].libraryId, originals[1].revision, {
      name: "User's draft mascot",
    });
    await legacy.delete(originals[2].libraryId, originals[2].revision);
    const preserved = [
      structuredClone(legacy.get(originals[0].libraryId)),
      structuredClone(legacy.get(originals[1].libraryId)),
    ];
    expect(preserved[0]!.status).toBe("ready");
    const before = JSON.parse(
      legacy.managedStore.readFile(MANAGED_FILES.index)!.toString(),
    );
    expect(before.checkpoints).toHaveLength(1);
    legacy.managedStore.close();
    const store = new LocalThemeStore(managed.root, [redesignedSource()]);
    await store.init();
    expect(store.listRecords()).toHaveLength(5);
    expect(store.get(originals[0].libraryId)).toEqual(preserved[0]);
    expect(store.get(originals[1].libraryId)).toEqual(preserved[1]);
    expect(
      store.listRecords().some((item) => item.themeId === originals[2].themeId),
    ).toBe(false);
    const after = JSON.parse(
      store.managedStore.readFile(MANAGED_FILES.index)!.toString(),
    );
    expect(after.checkpoints).toEqual(before.checkpoints);
    store.managedStore.close();
  }, 60_000);

  it("upgrades only Ultra from actual v10 while retaining all four identities, configuration and recovery references", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const legacy = new LocalThemeStore(managed.root, [redesignedSource()]);
    await legacy.init();
    const originals = legacy
      .listRecords()
      .filter((item) => item.json.backgroundMode === "reasoning")
      .map((item) => ({
        record: structuredClone(item),
        normal: legacy.getBackground(item.libraryId)!,
        reasoning: legacy.getReasoningBackgrounds(item.libraryId),
      }));
    expect(originals).toHaveLength(4);
    const selected = originals[0].record;
    await legacy.select(selected.libraryId, selected.revision);
    await legacy.markLastKnownGood(selected.libraryId, selected.fingerprint);
    await legacy.setPaused(true);
    legacy.managedStore.close();

    const pack = await divineUltraSource().load();
    expect(pack.replacesPackIds).toEqual([
      REDESIGNED_MASCOT_BUNDLED_PRESET_PACK_ID,
    ]);
    expect(pack.introducedThemeIds).toEqual([]);
    expect(pack.themes.map((theme) => theme.themeId).sort()).toEqual(
      originals.map(({ record }) => record.themeId).sort(),
    );
    for (const { record } of originals) {
      const expected = pack.themes.find(
        (theme) => theme.themeId === record.themeId,
      )!;
      // 普通图未变时，必须靠真实 v10 安装结果的完整指纹识别升级资格。
      expect(expected.imageSha256).toBe(record.backgroundSha256);
      expect(expected.previousImageSha256).toEqual([]);
      expect(expected.previousFingerprints).toEqual([record.fingerprint]);
    }
    const next = { packId: pack.packId, load: vi.fn(async () => pack) };
    const store = new LocalThemeStore(managed.root, [next]);
    await store.init();
    expect(store.listRecords()).toHaveLength(6);
    for (const { record, normal, reasoning } of originals) {
      const updated = store.get(record.libraryId)!;
      const expected = pack.themes.find(
        (theme) => theme.themeId === record.themeId,
      )!;
      expect(
        store.listRecords().filter((theme) => theme.themeId === record.themeId),
      ).toHaveLength(1);
      expect(updated).toMatchObject({
        libraryId: record.libraryId,
        themeId: record.themeId,
        name: record.name,
        description: record.description,
        css: record.css,
        backgroundScope: record.backgroundScope,
        sidebarOverlayOpacity: record.sidebarOverlayOpacity,
        backgroundSha256: record.backgroundSha256,
        backgroundBytes: record.backgroundBytes,
        status: "ready",
        revision: record.revision + 1,
        packageFormat: record.packageFormat,
        signed: record.signed,
      });
      expect(readThemeConfiguration(updated.json)).toEqual(
        readThemeConfiguration(record.json),
      );
      expect(store.getBackground(record.libraryId)!.equals(normal)).toBe(true);
      const updatedReasoning = store.getReasoningBackgrounds(record.libraryId);
      expect(Object.keys(updatedReasoning)).toEqual(efforts);
      for (const effort of efforts) {
        expect(
          updatedReasoning[effort]!.equals(expected.reasoningImages![effort]!),
        ).toBe(true);
        expect(updatedReasoning[effort]!.equals(reasoning[effort]!)).toBe(
          effort !== "ultra",
        );
      }
    }
    const after = store.managedStore.readFile(MANAGED_FILES.index)!;
    expect(JSON.parse(after.toString())).toMatchObject({
      selectedLibraryId: selected.libraryId,
      lastKnownGoodLibraryId: selected.libraryId,
      paused: true,
      checkpoints: [],
      installedPresetPacks: [
        REDESIGNED_MASCOT_BUNDLED_PRESET_PACK_ID,
        DIVINE_ULTRA_BUNDLED_PRESET_PACK_ID,
      ],
    });
    store.managedStore.close();
    next.load.mockClear();
    const reopened = new LocalThemeStore(managed.root, [next]);
    await reopened.init();
    expect(next.load).not.toHaveBeenCalled();
    expect(reopened.managedStore.readFile(MANAGED_FILES.index)).toEqual(after);
    expect(reopened.listRecords()).toHaveLength(6);
    for (const { record, normal } of originals) {
      const expected = pack.themes.find(
        (theme) => theme.themeId === record.themeId,
      )!;
      expect(reopened.getBackground(record.libraryId)!.equals(normal)).toBe(
        true,
      );
      for (const effort of efforts)
        expect(
          reopened
            .getReasoningBackgrounds(record.libraryId)
            [effort]!.equals(expected.reasoningImages![effort]!),
        ).toBe(true);
    }
    reopened.managedStore.close();
  }, 60_000);

  it("preserves edited ready, already replaced Ultra, draft checkpoints and deleted v10 themes", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const legacy = new LocalThemeStore(managed.root, [redesignedSource()]);
    await legacy.init();
    const originals = legacy
      .listRecords()
      .filter((item) => item.json.backgroundMode === "reasoning");
    expect(originals).toHaveLength(4);
    const pack = await divineUltraSource().load();
    const edited = await legacy.patch(
      originals[0].libraryId,
      originals[0].revision,
      { name: "User's saved v10 mascot" },
    );
    await legacy.commit(edited.libraryId, edited.revision);
    const replacement = pack.themes.find(
      (theme) => theme.themeId === originals[1].themeId,
    )!;
    // 复用 MCP 最终调用的保存入口；用户已换成同一新版 Ultra 也不能再次改 revision 或文件引用。
    const replaced = await legacy.replaceAndSaveBackgrounds(
      originals[1].libraryId,
      originals[1].revision,
      {
        ultra: {
          data: replacement.reasoningImages!.ultra!,
          fileName: "user-ultra.png",
        },
      },
    );
    expect(replaced.fingerprint).not.toBe(originals[1].fingerprint);
    expect(replacement.previousFingerprints).not.toContain(
      replaced.fingerprint,
    );
    await legacy.select(replaced.libraryId, replaced.revision);
    await legacy.markLastKnownGood(replaced.libraryId, replaced.fingerprint);
    await legacy.patch(originals[2].libraryId, originals[2].revision, {
      name: "User's draft v10 mascot",
    });
    await legacy.delete(originals[3].libraryId, originals[3].revision);
    const preserved = originals.slice(0, 3).map((original) => ({
      record: structuredClone(legacy.get(original.libraryId)!),
      normal: legacy.getBackground(original.libraryId)!,
      reasoning: legacy.getReasoningBackgrounds(original.libraryId),
    }));
    expect(preserved.map(({ record }) => record.status)).toEqual([
      "ready",
      "ready",
      "draft",
    ]);
    const before = JSON.parse(
      legacy.managedStore.readFile(MANAGED_FILES.index)!.toString(),
    );
    expect(before.checkpoints).toHaveLength(1);
    legacy.managedStore.close();
    const next = { packId: pack.packId, load: vi.fn(async () => pack) };
    const store = new LocalThemeStore(managed.root, [next]);
    await store.init();
    expect(store.listRecords()).toHaveLength(5);
    for (const { record, normal, reasoning } of preserved) {
      expect(store.get(record.libraryId)).toEqual(record);
      expect(store.getBackground(record.libraryId)!.equals(normal)).toBe(true);
      for (const effort of efforts)
        expect(
          store
            .getReasoningBackgrounds(record.libraryId)
            [effort]!.equals(reasoning[effort]!),
        ).toBe(true);
    }
    expect(
      store
        .listRecords()
        .some((theme) => theme.themeId === originals[3].themeId),
    ).toBe(false);
    const after = store.managedStore.readFile(MANAGED_FILES.index)!;
    expect(JSON.parse(after.toString())).toMatchObject({
      selectedLibraryId: before.selectedLibraryId,
      lastKnownGoodLibraryId: before.lastKnownGoodLibraryId,
      checkpoints: before.checkpoints,
    });
    store.managedStore.close();
    next.load.mockClear();
    const reopened = new LocalThemeStore(managed.root, [next]);
    await reopened.init();
    expect(next.load).not.toHaveBeenCalled();
    expect(reopened.managedStore.readFile(MANAGED_FILES.index)).toEqual(after);
    expect(reopened.listRecords()).toHaveLength(5);
    reopened.managedStore.close();
  }, 60_000);

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
