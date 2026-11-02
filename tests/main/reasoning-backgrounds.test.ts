import { createWriteStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import yazl from "yazl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import {
  MANAGED_FILES,
  managedThemeFile,
} from "../../src/main/infra/secure-store";
import {
  readThemeZip,
  writeSimplifiedZip,
} from "../../src/main/infra/theme-zip";
import { createManagedRoot } from "../fixtures/managed-root";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const managed = await createManagedRoot();
  cleanups.push(managed.cleanup);
  const store = new LocalThemeStore(managed.root);
  await store.init();
  const red = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "#0000ff" },
  })
    .png()
    .toBuffer();
  let record = await store.createDraft("Reasoning background test");
  record = await store.setReasoningBackground(
    record.libraryId,
    record.revision,
    "max",
    red,
    "red.png",
  );
  record = await store.setReasoningBackground(
    record.libraryId,
    record.revision,
    "ultra",
    blue,
    "blue.png",
  );
  record = await store.patch(record.libraryId, record.revision, {
    backgroundMode: "reasoning",
  });
  record = await store.commit(record.libraryId, record.revision);
  return { managed, store, record, red, blue };
}

describe("reasoning background durable lifecycle", () => {
  it("restores cleared/replaced slots, reloads them and derives independent image files", async () => {
    const { managed, store, record, red, blue } = await fixture();
    let edited = await store.setReasoningBackground(
      record.libraryId,
      record.revision,
      "max",
      blue,
      "blue.png",
    );
    edited = await store.setReasoningBackground(
      record.libraryId,
      edited.revision,
      "ultra",
    );
    expect(store.getReasoningBackgrounds(record.libraryId)).toEqual({
      max: blue,
    });
    const restored = await store.discardChanges(
      record.libraryId,
      edited.revision,
    );
    expect(restored.json.backgroundMode).toBe("reasoning");
    expect(store.getReasoningBackgrounds(record.libraryId)).toEqual({
      max: red,
      ultra: blue,
    });
    expect(restored.revision).toBeGreaterThan(edited.revision);
    const reloaded = new LocalThemeStore(managed.root);
    await reloaded.init();
    expect(reloaded.getReasoningBackgrounds(record.libraryId)).toEqual({
      max: red,
      ultra: blue,
    });
    const derived = await reloaded.createDraftFrom(record.libraryId, "Derived");
    expect(derived.reasoningBackgrounds?.max?.file).not.toBe(
      restored.reasoningBackgrounds?.max?.file,
    );
    expect(reloaded.getReasoningBackgrounds(derived.libraryId)).toEqual({
      max: red,
      ultra: blue,
    });
    await reloaded.delete(derived.libraryId, derived.revision);
    expect(
      reloaded.managedStore.readFile(
        managedThemeFile(derived.reasoningBackgrounds!.max!.file),
      ),
    ).toBeUndefined();
    expect(reloaded.getReasoningBackgrounds(record.libraryId)).toEqual({
      max: red,
      ultra: blue,
    });
  });

  it.each(["image", "index", "cleanup"] as const)(
    "rolls back slot replacement on %s failure and reloads the original image set",
    async (phase) => {
      const { managed, store, record, red, blue } = await fixture();
      const before = store.managedStore.readFile(MANAGED_FILES.index);
      const originalRevision = record.revision;
      const originalSlotFile = record.reasoningBackgrounds!.max!.file;
      const files = (await readdir(join(managed.root, "themes"))).sort();
      const originalWrite = store.managedStore.writeFileAtomic.bind(
        store.managedStore,
      );
      let failed = false;
      const write = vi
        .spyOn(store.managedStore, "writeFileAtomic")
        .mockImplementation((file, bytes) => {
          if (
            !failed &&
            ((phase === "image" && file.directory === "themes") ||
              (phase === "index" && file.directory === "state"))
          ) {
            failed = true;
            throw new Error("simulated reasoning persistence failure");
          }
          originalWrite(file, bytes);
        });
      const originalRemove = store.managedStore.removeFile.bind(
        store.managedStore,
      );
      const remove = vi
        .spyOn(store.managedStore, "removeFile")
        .mockImplementation((file) => {
          if (
            !failed &&
            phase === "cleanup" &&
            file.fileName === originalSlotFile
          ) {
            failed = true;
            throw new Error("simulated reasoning cleanup failure");
          }
          return originalRemove(file);
        });
      await expect(
        store.setReasoningBackground(
          record.libraryId,
          record.revision,
          "max",
          blue,
          "replacement.png",
        ),
      ).rejects.toThrow("simulated reasoning");
      write.mockRestore();
      remove.mockRestore();
      expect(failed).toBe(true);
      expect(store.managedStore.readFile(MANAGED_FILES.index)).toEqual(before);
      expect((await readdir(join(managed.root, "themes"))).sort()).toEqual(
        files,
      );
      expect(store.getReasoningBackgrounds(record.libraryId)).toEqual({
        max: red,
        ultra: blue,
      });
      const reloaded = new LocalThemeStore(managed.root);
      await reloaded.init();
      expect(reloaded.get(record.libraryId)?.revision).toBe(originalRevision);
      expect(reloaded.getReasoningBackgrounds(record.libraryId)).toEqual({
        max: red,
        ultra: blue,
      });
    },
  );

  it("rejects a changed slot file before ready injection", async () => {
    const { store, record, blue } = await fixture();
    store.managedStore.writeFileAtomic(
      managedThemeFile(record.reasoningBackgrounds!.max!.file),
      blue,
    );
    await expect(store.readyForInjection(record.libraryId)).rejects.toThrow();
  });

  it("round-trips mode and all declared image bytes through ZIP and managed import", async () => {
    const { managed, store, record, red, blue } = await fixture();
    const zip = join(managed.localAppData, "reasoning.zip");
    await writeSimplifiedZip(
      zip,
      record,
      store.getBackground(record.libraryId)!,
      store.getReasoningBackgrounds(record.libraryId),
    );
    const parsed = await readThemeZip(zip);
    expect(parsed.record.json.backgroundMode).toBe("reasoning");
    expect(parsed.reasoningImages).toEqual({ max: red, ultra: blue });
    await store.addImported(
      parsed.record,
      parsed.image,
      parsed.reasoningImages,
    );
    const imported = store.get(parsed.record.libraryId)!;
    expect(store.getReasoningBackgrounds(imported.libraryId)).toEqual({
      max: red,
      ultra: blue,
    });
    expect(imported.reasoningBackgrounds!.max!.file).not.toBe(
      record.reasoningBackgrounds!.max!.file,
    );
  });

  it.each(["unknown", "missing", "extra", "traversal"])(
    "rejects %s reasoning image references in a ZIP",
    async (kind) => {
      const { managed, store, record, red } = await fixture();
      const json = {
        ...record.json,
        image: "background.png",
        reasoningBackgrounds:
          kind === "unknown"
            ? { invalid: "slot.png" }
            : { max: kind === "traversal" ? "../slot.png" : "slot.png" },
      };
      const entries: Record<string, Buffer> = {
        "theme.json": Buffer.from(JSON.stringify(json)),
        "theme.css": Buffer.from(record.css),
        "background.png": store.getBackground(record.libraryId)!,
      };
      if (kind !== "missing") entries["slot.png"] = red;
      if (kind === "extra") entries["undeclared.png"] = red;
      const zip = join(managed.localAppData, "bad.zip");
      await writeZip(zip, entries);
      await expect(readThemeZip(zip)).rejects.toThrow();
    },
  );
});

async function writeZip(path: string, entries: Record<string, Buffer>) {
  const zip = new yazl.ZipFile();
  for (const [name, bytes] of Object.entries(entries))
    zip.addBuffer(bytes, name);
  const finished = new Promise<void>((resolve, reject) => {
    zip.outputStream
      .on("error", reject)
      .pipe(createWriteStream(path))
      .on("close", resolve)
      .on("error", reject);
  });
  zip.end();
  await finished;
}
