import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import { themeFingerprint } from "../../src/main/domain/theme";
import { validateImage } from "../../src/main/infra/image";
import { MANAGED_FILES } from "../../src/main/infra/secure-store";
import { createManagedRoot } from "../fixtures/managed-root";
import {
  DEFAULT_CONFIGURED_STYLE,
  readThemeConfiguration,
} from "../../src/contracts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
});

describe("local theme store", () => {
  it("creates ready built-ins and persists selection across reload", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const { root } = managed;
    const store = new LocalThemeStore(root);
    await store.init();
    const themes = store.listRecords();
    expect(themes).toHaveLength(2);
    expect(themes.every((theme) => theme.status === "ready")).toBe(true);
    const chosen = themes[0];
    await store.select(chosen.libraryId, chosen.revision);
    const reloaded = new LocalThemeStore(root);
    await reloaded.init();
    expect(reloaded.selected()?.libraryId).toBe(chosen.libraryId);
    expect(
      reloaded.getBackground(chosen.libraryId)?.byteLength,
    ).toBeGreaterThan(0);
  });

  it("rejects stale edits and does not silently replace selected themes", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const { root } = managed;
    const store = new LocalThemeStore(root);
    await store.init();
    const draft = await store.createDraft("Draft");
    await expect(
      store.patch(draft.libraryId, 0, {
        css: '[data-ds-part="app"] { color: #fff; }',
      }),
    ).rejects.toThrow("STALE_REVISION");
  });

  it("persists background scope and sidebar overlay as revisioned theme data", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const theme = store.listRecords()[0];

    const updated = await store.patch(theme.libraryId, theme.revision, {
      backgroundScope: "content",
      sidebarOverlayOpacity: 42,
    });

    expect(updated).toMatchObject({
      backgroundScope: "content",
      sidebarOverlayOpacity: 42,
      status: "draft",
      revision: theme.revision,
    });
    expect(updated.json).toMatchObject({
      backgroundScope: "content",
      sidebarOverlayOpacity: 42,
    });

    const reloaded = new LocalThemeStore(managed.root);
    await reloaded.init();
    expect(reloaded.get(theme.libraryId)).toMatchObject({
      backgroundScope: "content",
      sidebarOverlayOpacity: 42,
    });
  });

  it("versions preview asset URLs so a replaced image cannot reuse cache", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const theme = store.listRecords()[0];

    expect(
      store.getDetail(theme.libraryId, "app://theme-asset")?.backgroundUrl,
    ).toBe(`app://theme-asset/${theme.libraryId}?v=${theme.revision}`);
  });

  it("creates configured drafts and regenerates Safe CSS from settings", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const draft = await store.createDraft("Configured draft");

    expect(readThemeConfiguration(draft.json).styleConfig.mode).toBe(
      "configured",
    );
    expect(draft.validation.css).toBe("valid");

    const configuration = readThemeConfiguration(draft.json);
    const updated = await store.patch(draft.libraryId, draft.revision, {
      appearance: "dark",
      art: { ...configuration.art, focusX: 0.22, focusY: 0.78 },
      colors: { ...configuration.colors, accent: "#336699" },
      styleConfig: {
        ...DEFAULT_CONFIGURED_STYLE,
        recipes: {
          ...DEFAULT_CONFIGURED_STYLE.recipes,
          message: false,
        },
        blur: 25,
        radius: 20,
      },
    });

    expect(readThemeConfiguration(updated.json)).toMatchObject({
      appearance: "dark",
      art: { focusX: 0.22, focusY: 0.78 },
      colors: { accent: "#336699" },
      styleConfig: {
        mode: "configured",
        blur: 25,
        radius: 20,
        recipes: { message: false },
      },
    });
    expect(updated.css).toContain('[data-ds-part="composer"]');
    expect(updated.css).not.toContain('[data-ds-part="message"]');
    expect(updated.validation.css).toBe("valid");
  });

  it("applies theme.json atomically only after complete validation", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const draft = await store.createDraft("JSON draft");
    const invalidSource = JSON.stringify({
      ...draft.json,
      style: {
        ...readThemeConfiguration(draft.json).styleConfig,
        radius: 200,
      },
    });

    await expect(
      store.patch(draft.libraryId, draft.revision, {
        themeJson: invalidSource,
      }),
    ).rejects.toThrow("UNSAFE_ARCHIVE");
    expect(store.get(draft.libraryId)?.revision).toBe(draft.revision);
    expect(store.get(draft.libraryId)?.name).toBe("JSON draft");

    const validSource = JSON.stringify({
      ...draft.json,
      id: "json-configured",
      name: "JSON configured",
      appearance: "light",
      art: {
        ...readThemeConfiguration(draft.json).art,
        focusX: 0.18,
      },
    });
    const updated = await store.patch(draft.libraryId, draft.revision, {
      themeJson: validSource,
    });

    expect(updated).toMatchObject({
      themeId: "json-configured",
      name: "JSON configured",
      revision: draft.revision + 1,
    });
    expect(readThemeConfiguration(updated.json)).toMatchObject({
      appearance: "light",
      art: { focusX: 0.18 },
      styleConfig: { mode: "configured" },
    });
    expect(updated.validation.css).toBe("valid");
  });

  it("normalizes legacy records without presentation fields to window and 75", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const indexBytes = store.managedStore.readFile(MANAGED_FILES.index)!;
    const index = JSON.parse(indexBytes.toString("utf8")) as {
      themes: Array<Record<string, unknown>>;
    };
    for (const theme of index.themes) {
      const json = theme.json as Record<string, unknown>;
      delete theme.backgroundScope;
      delete theme.sidebarOverlayOpacity;
      delete json.backgroundScope;
      delete json.sidebarOverlayOpacity;
      theme.fingerprint = themeFingerprint(theme as never);
    }
    store.managedStore.writeFileAtomic(
      MANAGED_FILES.index,
      Buffer.from(JSON.stringify(index), "utf8"),
    );

    const reloaded = new LocalThemeStore(managed.root);
    await reloaded.init();

    expect(
      reloaded
        .listRecords()
        .every(
          (theme) =>
            theme.backgroundScope === "window" &&
            theme.sidebarOverlayOpacity === 75,
        ),
    ).toBe(true);
  });

  it("revalidates the on-disk image before injection", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const { root } = managed;
    const store = new LocalThemeStore(root);
    await store.init();
    const chosen = store.listRecords()[0];
    await store.select(chosen.libraryId, chosen.revision);
    await writeFile(
      join(root, "themes", chosen.backgroundFile!),
      Buffer.from("not an image"),
    );
    await expect(store.selectedReadyForInjection()).rejects.toThrow(
      "UNSAFE_IMAGE",
    );
  });

  it("rejects selecting a ready theme whose content fingerprint changed", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const { root } = managed;
    const store = new LocalThemeStore(root);
    await store.init();
    const theme = store.listRecords()[0];
    theme.fingerprint = "0".repeat(64);

    await expect(store.select(theme.libraryId, theme.revision)).rejects.toThrow(
      "UNSAFE_ARCHIVE:theme-fingerprint",
    );
    expect(store.selected()).toBeUndefined();
  });

  it("marks a formal import as edited when its background changes", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const theme = store.listRecords()[0];
    theme.packageFormat = "formal";
    theme.importedFormal = {
      manifest: {},
      signaturePresent: true,
      edited: false,
      originalThemeJsonBase64: "e30=",
      originalCssBase64: "",
      originalManifestBase64: "e30=",
      originalImageName: "background.png",
    };
    const image = store.getBackground(theme.libraryId)!;
    const imageInfo = await validateImage(image, theme.backgroundFile);

    const updated = await store.setBackground(
      theme.libraryId,
      theme.revision,
      "replacement.png",
      image,
      imageInfo.mime,
      imageInfo.sha256,
    );

    expect(updated.packageFormat).toBe("simplified");
    expect(updated.importedFormal?.edited).toBe(true);
  });

  it("marks a formal import as edited when its presentation changes", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const theme = store.listRecords()[0];
    theme.packageFormat = "formal";
    theme.importedFormal = {
      manifest: {},
      signaturePresent: true,
      edited: false,
      originalThemeJsonBase64: "e30=",
      originalCssBase64: "",
      originalManifestBase64: "e30=",
      originalImageName: "background.png",
    };

    const updated = await store.patch(theme.libraryId, theme.revision, {
      backgroundScope: "content",
    });

    expect(updated.packageFormat).toBe("simplified");
    expect(updated.importedFormal?.edited).toBe(true);
  });

  it("fails closed when a journal parent is replaced before recovery", async () => {
    const managed = await createManagedRoot();
    const external = await mkdtemp(
      join(process.cwd(), ".codexstyle-journal-sentinel-"),
    );
    cleanup.push(managed.cleanup);
    cleanup.push(() => rm(external, { recursive: true, force: true }));
    const store = new LocalThemeStore(managed.root);
    await store.init();
    store.managedStore.writeFileAtomic(
      MANAGED_FILES.journal,
      Buffer.from(
        JSON.stringify({
          version: 1,
          afterSha256: "0".repeat(64),
          createdAt: "2026-08-08T00:00:00.000Z",
        }),
        "utf8",
      ),
    );
    const sentinel = join(external, "sentinel.txt");
    await writeFile(sentinel, "unchanged", "utf8");
    await rm(join(managed.root, "transactions"), {
      recursive: true,
      force: true,
    });
    await symlink(external, join(managed.root, "transactions"), "junction");

    const reloaded = new LocalThemeStore(managed.root);
    await expect(reloaded.init()).rejects.toThrow("STORE_TAMPERED");
    expect(await readFile(sentinel, "utf8")).toBe("unchanged");
  });

  it("fails closed when a lock parent is replaced during a mutation", async () => {
    const managed = await createManagedRoot();
    const external = await mkdtemp(
      join(process.cwd(), ".codexstyle-lock-sentinel-"),
    );
    cleanup.push(managed.cleanup);
    cleanup.push(() => rm(external, { recursive: true, force: true }));
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const sentinel = join(external, "sentinel.txt");
    await writeFile(sentinel, "unchanged", "utf8");
    await rm(join(managed.root, "lock"), { recursive: true, force: true });
    await symlink(external, join(managed.root, "lock"), "junction");

    await expect(store.createDraft("No persistence")).rejects.toThrow(
      "STORE_TAMPERED",
    );
    expect(store.listRecords()).toHaveLength(2);
    expect(await readFile(sentinel, "utf8")).toBe("unchanged");
  });
});
