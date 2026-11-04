import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreparedBundledPresetTheme } from "../../src/main/infra/bundled-presets";
import { validateImage } from "../../src/main/infra/image";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import {
  MANAGED_FILES,
  managedThemeFile,
} from "../../src/main/infra/secure-store";
import type { ThemeRecord } from "../../src/main/domain/theme";
import { createManagedRoot } from "../fixtures/managed-root";

const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
const oldPackId = "reasoning-upgrade-old";
const newPackId = "reasoning-upgrade-new";
const template = JSON.parse(
  readFileSync(resolve("resources/presets/catalog.json"), "utf8"),
).themes[0] as PreparedBundledPresetTheme;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
});

async function preset(generation: number): Promise<PreparedBundledPresetTheme> {
  const images = await Promise.all(
    efforts.map(async (_, index) => {
      const bytes = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: { r: generation * 50, g: index * 30, b: 100 },
        },
      })
        .png()
        .toBuffer();
      return { bytes, info: await validateImage(bytes, "stage.png") };
    }),
  );
  return {
    ...template,
    presetId: "reasoning-upgrade",
    themeId: "builtin-reasoning-upgrade-v1",
    name: "Six-stage migration",
    description: `Generation ${generation}`,
    backgroundMode: "reasoning",
    image: "low.png",
    imageSha256: images[0].info.sha256,
    imageInfo: images[0].info,
    imageBytes: images[0].bytes,
    previousImageSha256: [],
    previousFingerprints: [],
    reasoningImages: Object.fromEntries(
      efforts.map((effort, i) => [effort, images[i].bytes]),
    ),
    reasoningBackgrounds: Object.fromEntries(
      efforts.map((effort, i) => [
        effort,
        {
          image: `${effort}.png`,
          imageSha256: images[i].info.sha256,
        },
      ]),
    ),
  };
}

function source(
  packId: string,
  themes: PreparedBundledPresetTheme[],
  replacesPackIds: string[] = [],
) {
  return {
    packId,
    load: async () => ({
      packId,
      themes,
      replacesPackIds,
      introducedThemeIds: [],
    }),
  };
}

function files(record: ThemeRecord): string[] {
  return [
    record.backgroundFile!,
    ...Object.values(record.reasoningBackgrounds ?? {}).map(
      (asset) => asset.file,
    ),
  ];
}

async function fixture() {
  const managed = await createManagedRoot();
  cleanup.push(managed.cleanup);
  const predecessor = await preset(1);
  const legacy = new LocalThemeStore(managed.root, [
    source(oldPackId, [predecessor]),
  ]);
  await legacy.init();
  const original = structuredClone(
    legacy.listRecords().find((item) => item.themeId === predecessor.themeId)!,
  );
  await legacy.select(original.libraryId, original.revision);
  await legacy.markLastKnownGood(original.libraryId, original.fingerprint!);
  const before = legacy.managedStore.readFile(MANAGED_FILES.index)!;
  const oldFiles = await readdir(join(managed.root, "themes"));
  legacy.managedStore.close();
  const replacement = await preset(2);
  replacement.previousImageSha256 = [predecessor.imageSha256];
  replacement.previousFingerprints = [original.fingerprint!];
  return {
    managed,
    original,
    predecessor,
    replacement,
    before,
    oldFiles,
    next: source(newPackId, [replacement], [oldPackId]),
  };
}

function expectImages(
  store: LocalThemeStore,
  original: ThemeRecord,
  expected: PreparedBundledPresetTheme,
) {
  expect(store.getBackground(original.libraryId)).toEqual(expected.imageBytes);
  expect(store.getReasoningBackgrounds(original.libraryId)).toEqual(
    expected.reasoningImages,
  );
}

describe("bundled six-stage upgrade transaction", () => {
  it("commits the whole background set once, preserves references, and removes retired files", async () => {
    const f = await fixture();
    const store = new LocalThemeStore(f.managed.root, [f.next]);
    await store.init();
    const updated = store.get(f.original.libraryId)!;
    expect(updated).toMatchObject({
      libraryId: f.original.libraryId,
      revision: f.original.revision + 1,
      status: "ready",
    });
    expect(store.listRecords()).toHaveLength(3);
    expectImages(store, f.original, f.replacement);
    expect(files(updated)).toHaveLength(7);
    expect(new Set(files(updated)).size).toBe(7);
    for (const file of files(updated)) {
      expect(file).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/u,
      );
      expect(files(f.original)).not.toContain(file);
    }
    for (const file of files(f.original))
      expect(
        store.managedStore.readFile(managedThemeFile(file)),
      ).toBeUndefined();
    const stored = JSON.parse(
      store.managedStore.readFile(MANAGED_FILES.index)!.toString(),
    );
    expect(stored.selectedLibraryId).toBe(f.original.libraryId);
    expect(stored.lastKnownGoodLibraryId).toBe(f.original.libraryId);
    expect(stored.installedPresetPacks).toEqual([oldPackId, newPackId]);
    store.managedStore.close();
    const load = vi.spyOn(f.next, "load");
    const reopened = new LocalThemeStore(f.managed.root, [f.next]);
    await reopened.init();
    expect(load).not.toHaveBeenCalled();
    expect(reopened.get(f.original.libraryId)).toEqual(updated);
    expectImages(reopened, f.original, f.replacement);
    reopened.managedStore.close();
  });

  it.each([
    "normal-write",
    "reasoning-write",
    "before-index",
    "after-index",
    "reasoning-cleanup",
    "normal-cleanup",
  ] as const)(
    "restores old bytes, index and references after %s failure",
    async (failure) => {
      const f = await fixture();
      const store = new LocalThemeStore(f.managed.root, [f.next]);
      const write = store.managedStore.writeFileAtomic.bind(store.managedStore);
      const remove = store.managedStore.removeFile.bind(store.managedStore);
      let failed = false;
      let imageWrites = 0;
      const fail = () => {
        failed = true;
        throw new Error(`injected ${failure}`);
      };
      vi.spyOn(store.managedStore, "writeFileAtomic").mockImplementation(
        (file, bytes) => {
          if (file.directory === "themes") imageWrites += 1;
          if (!failed && failure === "normal-write" && imageWrites === 1)
            fail();
          if (
            !failed &&
            file === MANAGED_FILES.index &&
            failure === "before-index"
          )
            fail();
          write(file, bytes);
          if (
            !failed &&
            file.directory === "themes" &&
            failure === "reasoning-write" &&
            imageWrites === 4
          )
            fail();
          if (
            !failed &&
            file === MANAGED_FILES.index &&
            failure === "after-index"
          )
            fail();
        },
      );
      vi.spyOn(store.managedStore, "removeFile").mockImplementation((file) => {
        const result = remove(file);
        if (!failed && file.directory === "themes") {
          if (
            failure === "normal-cleanup" &&
            file.fileName === f.original.backgroundFile
          )
            fail();
          if (
            failure === "reasoning-cleanup" &&
            file.fileName === f.original.reasoningBackgrounds!.medium!.file
          )
            fail();
        }
        return result;
      });
      await expect(store.init()).rejects.toThrow(`injected ${failure}`);
      expect(failed).toBe(true);
      expect(store.get(f.original.libraryId)).toEqual(f.original);
      expectImages(store, f.original, f.predecessor);
      expect(store.managedStore.readFile(MANAGED_FILES.index)).toEqual(
        f.before,
      );
      expect((await readdir(join(f.managed.root, "themes"))).sort()).toEqual(
        f.oldFiles.sort(),
      );
      store.managedStore.close();
      const reopened = new LocalThemeStore(f.managed.root);
      await reopened.init();
      expect(reopened.get(f.original.libraryId)).toEqual(f.original);
      expectImages(reopened, f.original, f.predecessor);
      reopened.managedStore.close();
    },
  );
});
