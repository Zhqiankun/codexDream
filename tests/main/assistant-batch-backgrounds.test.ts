import { link, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS,
  readThemeConfiguration,
} from "../../src/contracts";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import {
  MANAGED_FILES,
  managedThemeFile,
} from "../../src/main/infra/secure-store";
import * as image from "../../src/main/infra/image";
import { createManagedRoot } from "../fixtures/managed-root";

vi.mock("electron", () => ({
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
}));
import { ThemeService } from "../../src/main/app/theme-service";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const managed = await createManagedRoot();
  cleanups.push(managed.cleanup);
  const store = new LocalThemeStore(managed.root);
  cleanups.push(async () => store.managedStore.close());
  await store.init();
  const red = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "#dd2211" },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "#1144dd" },
  })
    .png()
    .toBuffer();
  let record = await store.createDraft("Original custom name");
  record = await store.setReasoningBackground(
    record.libraryId,
    record.revision,
    "persistent",
    red,
    "old.png",
  );
  record = await store.setReasoningBackground(
    record.libraryId,
    record.revision,
    "low",
    red,
    "old.png",
  );
  record = await store.patch(record.libraryId, record.revision, {
    backgroundMode: "reasoning",
    description: "Keep description and configuration",
  });
  record = await store.commit(record.libraryId, record.revision);
  await store.select(record.libraryId, record.revision);
  await store.markLastKnownGood(record.libraryId, record.fingerprint!);
  const path = join(managed.localAppData, "replacement.png");
  await writeFile(path, blue);
  const service = new ThemeService(
    store,
    () => undefined,
    () => ({}) as never,
  );
  return {
    managed,
    store,
    service,
    record: structuredClone(record),
    red,
    blue,
    path,
  };
}

async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    index: f.store.managedStore.readFile(MANAGED_FILES.index),
    files: (await readdir(join(f.managed.root, "themes"))).sort(),
    normal: f.store.getBackground(f.record.libraryId),
    reasoning: f.store.getReasoningBackgrounds(f.record.libraryId),
  };
}

async function expectUnchanged(
  f: Awaited<ReturnType<typeof fixture>>,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  expect(await snapshot(f)).toEqual(before);
  expect(f.store.get(f.record.libraryId)).toEqual(f.record);
}

describe("assistant background batch save", () => {
  it("saves all seven inputs once and preserves original identity, configuration, selection and omitted images", async () => {
    const f = await fixture();
    const write = vi.spyOn(f.store.managedStore, "writeFileAtomic");
    const images = Object.fromEntries(
      ["normal", ...CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS].map((slot) => [
        slot,
        f.path,
      ]),
    );
    const result = await f.service.replaceAndSaveBackgrounds({
      libraryId: f.record.libraryId,
      expectedRevision: f.record.revision,
      images,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(
      write.mock.calls.filter(([file]) => file === MANAGED_FILES.index),
    ).toHaveLength(1);
    expect(Object.keys(result.data.replacedImages)).toHaveLength(7);
    const saved = f.store.get(f.record.libraryId)!;
    expect(saved).toMatchObject({
      libraryId: f.record.libraryId,
      themeId: f.record.themeId,
      name: f.record.name,
      description: f.record.description,
      css: f.record.css,
      status: "ready",
      revision: f.record.revision + 1,
    });
    expect(readThemeConfiguration(saved.json)).toEqual(
      readThemeConfiguration(f.record.json),
    );
    expect(saved.reasoningBackgrounds!.persistent).toEqual(
      f.record.reasoningBackgrounds!.persistent,
    );
    expect(f.store.getReasoningBackgrounds(saved.libraryId).persistent).toEqual(
      f.red,
    );
    expect(f.store.getBackground(saved.libraryId)).toEqual(f.blue);
    for (const effort of CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS) {
      expect(f.store.getReasoningBackgrounds(saved.libraryId)[effort]).toEqual(
        f.blue,
      );
      expect(result.data.replacedImages[effort]).toEqual({
        sha256: saved.reasoningBackgrounds![effort]!.sha256,
        bytes: f.blue.length,
      });
    }
    const index = JSON.parse(
      f.store.managedStore.readFile(MANAGED_FILES.index)!.toString(),
    );
    expect(index.selectedLibraryId).toBe(saved.libraryId);
    expect(index.lastKnownGoodLibraryId).toBeUndefined();
    expect(index.checkpoints).toEqual([]);
    expect(
      f.store.managedStore.readFile(managedThemeFile(f.record.backgroundFile!)),
    ).toBeUndefined();
    expect(
      f.store.managedStore.readFile(
        managedThemeFile(f.record.reasoningBackgrounds!.low!.file),
      ),
    ).toBeUndefined();
    const reopened = new LocalThemeStore(f.managed.root);
    cleanups.push(async () => reopened.managedStore.close());
    await reopened.init();
    expect(reopened.get(saved.libraryId)).toEqual(saved);
  });

  it("keeps the ordinary background untouched when only one reasoning slot is supplied", async () => {
    const f = await fixture();
    const normal = f.store.getBackground(f.record.libraryId);
    expect(
      await f.service.replaceAndSaveBackgrounds({
        libraryId: f.record.libraryId,
        expectedRevision: f.record.revision,
        images: { max: f.path },
      }),
    ).toMatchObject({ ok: true });
    const saved = f.store.get(f.record.libraryId)!;
    expect(saved.backgroundFile).toBe(f.record.backgroundFile);
    expect(saved.backgroundSha256).toBe(f.record.backgroundSha256);
    expect(f.store.getBackground(saved.libraryId)).toEqual(normal);
    expect(saved.reasoningBackgrounds!.low).toEqual(
      f.record.reasoningBackgrounds!.low,
    );
    expect(saved.reasoningBackgrounds!.persistent).toEqual(
      f.record.reasoningBackgrounds!.persistent,
    );
  });

  it.each(["stale", "draft", "checkpoint"] as const)(
    "rejects %s before reading an input file",
    async (condition) => {
      const f = await fixture();
      let revision = f.record.revision;
      if (condition === "stale") revision -= 1;
      else {
        const edited = await f.store.patch(f.record.libraryId, revision, {
          name: "Unsaved edit",
        });
        revision = edited.revision;
        if (condition === "checkpoint") edited.status = "ready";
      }
      const read = vi.spyOn(image, "readAssistantImageFileBounded");
      const before = await snapshot(f);
      const result = await f.service.replaceAndSaveBackgrounds({
        libraryId: f.record.libraryId,
        expectedRevision: revision,
        images: { normal: f.path },
      });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: condition === "stale" ? "STALE_REVISION" : "INCOMPLETE_THEME",
        },
      });
      expect(read).not.toHaveBeenCalled();
      expect(await snapshot(f)).toEqual(before);
    },
  );

  it.each(["magic", "decode"] as const)(
    "rejects a corrupt later image at %s validation without partially saving an earlier image",
    async (failure) => {
      const f = await fixture();
      const bad = join(f.managed.localAppData, "bad.png");
      await writeFile(
        bad,
        failure === "magic"
          ? Buffer.from("not an image")
          : f.blue.subarray(0, 40),
      );
      const before = await snapshot(f);
      expect(
        await f.service.replaceAndSaveBackgrounds({
          libraryId: f.record.libraryId,
          expectedRevision: f.record.revision,
          images: { normal: f.path, high: bad },
        }),
      ).toMatchObject({ ok: false, error: { code: "UNSAFE_IMAGE" } });
      await expectUnchanged(f, before);
    },
  );

  it("rejects a final image set over 32 MiB using fully decodable individual images", async () => {
    const f = await fixture();
    const large = await sharp({
      create: { width: 1800, height: 1700, channels: 3, background: "#557799" },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(large.length).toBeLessThan(image.MAX_IMAGE_BYTES);
    expect(large.length * 4).toBeGreaterThan(32 * 1024 * 1024);
    const path = join(f.managed.localAppData, "large.png");
    await writeFile(path, large);
    const before = await snapshot(f);
    expect(
      await f.service.replaceAndSaveBackgrounds({
        libraryId: f.record.libraryId,
        expectedRevision: f.record.revision,
        images: { normal: path, low: path, high: path, max: path },
      }),
    ).toMatchObject({ ok: false, error: { code: "UNSAFE_IMAGE" } });
    await expectUnchanged(f, before);
  });

  it("rejects a file larger than 10 MiB before decoding", async () => {
    const f = await fixture();
    const path = join(f.managed.localAppData, "oversize.png");
    await writeFile(path, Buffer.alloc(image.MAX_IMAGE_BYTES + 1));
    const decode = vi.spyOn(image, "validateImage");
    const before = await snapshot(f);
    expect(
      await f.service.replaceAndSaveBackgrounds({
        libraryId: f.record.libraryId,
        expectedRevision: f.record.revision,
        images: { normal: path },
      }),
    ).toMatchObject({ ok: false, error: { code: "UNSAFE_IMAGE" } });
    expect(decode).not.toHaveBeenCalled();
    await expectUnchanged(f, before);
  });

  it.each(["direct", "junction", "hardlink"] as const)(
    "rejects a managed image through a %s path",
    async (kind) => {
      const f = await fixture();
      let path = join(f.managed.root, "themes", f.record.backgroundFile!);
      if (kind === "junction") {
        const alias = join(f.managed.localAppData, "alias");
        await symlink(f.managed.root, alias, "junction");
        path = join(alias, "themes", f.record.backgroundFile!);
      } else if (kind === "hardlink") {
        const alias = join(f.managed.localAppData, "alias.png");
        await link(path, alias);
        path = alias;
      }
      const before = await snapshot(f);
      expect(
        await f.service.replaceAndSaveBackgrounds({
          libraryId: f.record.libraryId,
          expectedRevision: f.record.revision,
          images: { normal: path },
        }),
      ).toMatchObject({ ok: false, error: { code: "UNSAFE_IMAGE" } });
      await expectUnchanged(f, before);
    },
  );

  it.each([
    "normal-write",
    "reasoning-write",
    "before-index",
    "after-index",
    "reasoning-cleanup",
    "normal-cleanup",
  ] as const)(
    "restores the complete original state after %s failure",
    async (failure) => {
      const f = await fixture();
      const before = await snapshot(f);
      const write = f.store.managedStore.writeFileAtomic.bind(
        f.store.managedStore,
      );
      const remove = f.store.managedStore.removeFile.bind(f.store.managedStore);
      let failed = false;
      let imageWrites = 0;
      const fail = () => {
        failed = true;
        throw new Error("STORE_TAMPERED:injected");
      };
      vi.spyOn(f.store.managedStore, "writeFileAtomic").mockImplementation(
        (file, data) => {
          if (file.directory === "themes") imageWrites += 1;
          if (
            !failed &&
            failure === "normal-write" &&
            file.directory === "themes"
          )
            fail();
          if (
            !failed &&
            failure === "before-index" &&
            file === MANAGED_FILES.index
          )
            fail();
          write(file, data);
          if (
            !failed &&
            failure === "reasoning-write" &&
            imageWrites === 2 &&
            file.directory === "themes"
          )
            fail();
          if (
            !failed &&
            failure === "after-index" &&
            file === MANAGED_FILES.index
          )
            fail();
        },
      );
      vi.spyOn(f.store.managedStore, "removeFile").mockImplementation(
        (file) => {
          const removed = remove(file);
          if (!failed && file.directory === "themes") {
            if (
              failure === "normal-cleanup" &&
              file.fileName === f.record.backgroundFile
            )
              fail();
            if (
              failure === "reasoning-cleanup" &&
              file.fileName === f.record.reasoningBackgrounds!.low!.file
            )
              fail();
          }
          return removed;
        },
      );
      expect(
        await f.service.replaceAndSaveBackgrounds({
          libraryId: f.record.libraryId,
          expectedRevision: f.record.revision,
          images: { normal: f.path, low: f.path },
        }),
      ).toMatchObject({ ok: false });
      expect(failed).toBe(true);
      await expectUnchanged(f, before);
      const reopened = new LocalThemeStore(f.managed.root);
      cleanups.push(async () => reopened.managedStore.close());
      await reopened.init();
      expect(reopened.get(f.record.libraryId)).toEqual(f.record);
    },
  );

  it("cancels during full decoding without staging or changing the theme", async () => {
    const f = await fixture();
    const before = await snapshot(f);
    const abort = new AbortController();
    const original = image.validateImage;
    let finish!: () => void;
    const blocked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const decode = vi
      .spyOn(image, "validateImage")
      .mockImplementation(async (bytes, name) => {
        if (name === "replacement.png") await blocked;
        return original(bytes, name);
      });
    const pending = f.service.replaceAndSaveBackgrounds(
      {
        libraryId: f.record.libraryId,
        expectedRevision: f.record.revision,
        images: { normal: f.path },
      },
      abort.signal,
    );
    await vi.waitFor(() =>
      expect(
        decode.mock.calls.some(([, name]) => name === "replacement.png"),
      ).toBe(true),
    );
    abort.abort();
    finish();
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: "CANCELLED" },
    });
    await expectUnchanged(f, before);
  });
});
