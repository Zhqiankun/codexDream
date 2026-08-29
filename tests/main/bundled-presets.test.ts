import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBundledPresetSource,
  DEFAULT_BUNDLED_PRESET_PACK_ID,
  FIRST_BUNDLED_PRESET_PACK_ID,
  PREVIOUS_BUNDLED_PRESET_PACK_ID,
  type PreparedBundledPresetTheme,
} from "../../src/main/infra/bundled-presets";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import { MANAGED_FILES } from "../../src/main/infra/secure-store";
import { readThemeConfiguration } from "../../src/contracts";
import {
  themeFingerprint,
  type ThemeRecord,
} from "../../src/main/domain/theme";
import { createManagedRoot } from "../fixtures/managed-root";

const presetRoot = resolve(process.cwd(), "resources", "presets");
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
  vi.restoreAllMocks();
});

const PREVIOUS_PRESET_SURFACES: Record<
  string,
  {
    sidebarOverlayOpacity: number;
    background: string;
    panel: string;
    line: string;
  }
> = {
  "red-belief": {
    sidebarOverlayOpacity: 74,
    background: "#6f120d",
    panel: "#881812",
    line: "rgba(255, 212, 56, 0.28)",
  },
  "silver-profile": {
    sidebarOverlayOpacity: 72,
    background: "#070707",
    panel: "#151515",
    line: "rgba(255, 255, 255, 0.16)",
  },
  "forest-slow-life": {
    sidebarOverlayOpacity: 76,
    background: "#579864",
    panel: "#dcecd3",
    line: "#b4d0aa",
  },
  "ink-swordsman": {
    sidebarOverlayOpacity: 82,
    background: "#d9dadc",
    panel: "#ecedef",
    line: "#c1c3c6",
  },
  "sakura-cat": {
    sidebarOverlayOpacity: 74,
    background: "#f2b7ca",
    panel: "#fadce6",
    line: "#e6bac9",
  },
  "white-bear": {
    sidebarOverlayOpacity: 82,
    background: "#eeeee8",
    panel: "#f8f6ee",
    line: "#dad7cf",
  },
  "thunder-swordsman": {
    sidebarOverlayOpacity: 70,
    background: "#040404",
    panel: "#16110a",
    line: "rgba(255, 166, 22, 0.24)",
  },
  "cloud-swordsman": {
    sidebarOverlayOpacity: 78,
    background: "#7897a9",
    panel: "#d7e4ea",
    line: "#b6cbd5",
  },
  "lucky-cats": {
    sidebarOverlayOpacity: 82,
    background: "#f3ddaa",
    panel: "#f7eacc",
    line: "#e3c997",
  },
  "grow-strong": {
    sidebarOverlayOpacity: 78,
    background: "#63aa72",
    panel: "#d8ebd9",
    line: "#abd0b3",
  },
  "warm-tuntun": {
    sidebarOverlayOpacity: 80,
    background: "#e7c7b8",
    panel: "#f5e3d5",
    line: "#d8b8aa",
  },
  "hundred-yuan": {
    sidebarOverlayOpacity: 80,
    background: "#e7aaba",
    panel: "#f5d9e0",
    line: "#dda8b6",
  },
  "line-dogs": {
    sidebarOverlayOpacity: 78,
    background: "#68ad76",
    panel: "#d8ecd9",
    line: "#a9ceb0",
  },
};

function withoutV3Colors(
  colors: PreparedBundledPresetTheme["colors"],
): PreparedBundledPresetTheme["colors"] {
  const {
    threadTabBackground: _threadTabBackground,
    threadTabText: _threadTabText,
    homeTitleText: _homeTitleText,
    homeCardBackground: _homeCardBackground,
    homeCardText: _homeCardText,
    activityBackground: _activityBackground,
    activityText: _activityText,
    activityMuted: _activityMuted,
    ...legacyColors
  } = colors;
  return legacyColors as PreparedBundledPresetTheme["colors"];
}

function predecessorPreset(
  current: PreparedBundledPresetTheme,
  generation: 1 | 2,
): PreparedBundledPresetTheme {
  const legacyColors = withoutV3Colors(current.colors);
  if (generation === 2)
    return {
      ...current,
      colors: legacyColors,
    };
  const previous = PREVIOUS_PRESET_SURFACES[current.presetId];
  if (!previous) throw new Error(`missing predecessor: ${current.presetId}`);
  return {
    ...current,
    sidebarOverlayOpacity: previous.sidebarOverlayOpacity,
    colors: {
      ...legacyColors,
      background: previous.background,
      panel: previous.panel,
      line: previous.line,
    } as PreparedBundledPresetTheme["colors"],
  };
}

function predecessorPackSource(
  packId: string,
  themes: PreparedBundledPresetTheme[],
) {
  return {
    packId,
    async load() {
      return {
        packId,
        replacesPackIds: [],
        themes,
      };
    },
  };
}

function restorePreHomeCardFingerprint(records: ThemeRecord[]): void {
  for (const record of records) {
    if (!record.themeId.startsWith("builtin-")) continue;
    delete record.json.homeCards;
    record.fingerprint = themeFingerprint(record);
  }
}

describe("bundled image theme presets", () => {
  it("strictly loads all 13 catalog themes and verifies every image hash", async () => {
    const pack = await createBundledPresetSource(presetRoot).load();

    expect(pack.packId).toBe(DEFAULT_BUNDLED_PRESET_PACK_ID);
    expect(pack.replacesPackIds).toEqual([
      FIRST_BUNDLED_PRESET_PACK_ID,
      PREVIOUS_BUNDLED_PRESET_PACK_ID,
    ]);
    expect(pack.themes).toHaveLength(13);
    expect(new Set(pack.themes.map((theme) => theme.themeId)).size).toBe(13);
    expect(new Set(pack.themes.map((theme) => theme.image)).size).toBe(13);
    expect(
      pack.themes.every(
        (theme) =>
          theme.imageBytes.byteLength === theme.imageInfo.bytes &&
          theme.imageSha256 === theme.imageInfo.sha256 &&
          theme.style.mode === "configured" &&
          theme.sidebarOverlayOpacity === 20 &&
          theme.colors.background.endsWith(", 0.2)") &&
          theme.colors.panel.endsWith(", 0.2)") &&
          theme.colors.line.endsWith(", 0.1)") &&
          theme.colors.threadTabBackground === theme.colors.panel &&
          theme.colors.homeCardBackground === theme.colors.panel &&
          theme.colors.activityBackground === theme.colors.panel &&
          theme.previousFingerprints.length === 2,
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

  it.each([
    ["v1", FIRST_BUNDLED_PRESET_PACK_ID, 1, 0],
    ["v2", PREVIOUS_BUNDLED_PRESET_PACK_ID, 2, 1],
  ] as const)(
    "upgrades all untouched %s presets in place",
    async (_label, predecessorPackId, generation, fingerprintIndex) => {
      const managed = await createManagedRoot();
      cleanup.push(managed.cleanup);
      const currentSource = createBundledPresetSource(presetRoot);
      const currentPack = await currentSource.load();
      const previousThemes = currentPack.themes.map((theme) =>
        predecessorPreset(theme, generation),
      );
      const previous = previousThemes[0];
      const legacy = new LocalThemeStore(managed.root, [
        predecessorPackSource(predecessorPackId, previousThemes),
      ]);
      await legacy.init();
      restorePreHomeCardFingerprint(legacy.listRecords());
      const originals = new Map(
        legacy
          .listRecords()
          .filter((theme) => theme.themeId.startsWith("builtin-"))
          .map((theme) => [theme.themeId, theme]),
      );
      expect(originals.size).toBe(13);
      for (const preset of previousThemes)
        expect(originals.get(preset.themeId)?.fingerprint).toBe(
          preset.previousFingerprints[fingerprintIndex],
        );
      const original = legacy
        .listRecords()
        .find((theme) => theme.themeId === previous.themeId)!;
      await legacy.select(original.libraryId, original.revision);
      legacy.managedStore.close();

      const upgraded = new LocalThemeStore(managed.root, [currentSource]);
      await upgraded.init();
      const migratedThemes = upgraded
        .listRecords()
        .filter((theme) => theme.themeId.startsWith("builtin-"));
      expect(migratedThemes).toHaveLength(13);
      for (const migratedTheme of migratedThemes) {
        const predecessor = originals.get(migratedTheme.themeId)!;
        const migratedConfiguration = readThemeConfiguration(
          migratedTheme.json,
        );
        expect(migratedTheme).toMatchObject({
          libraryId: predecessor.libraryId,
          revision: predecessor.revision + 1,
          backgroundFile: predecessor.backgroundFile,
          sidebarOverlayOpacity: 20,
          status: "ready",
        });
        expect(migratedConfiguration.colors.background).toMatch(/, 0\.2\)$/u);
        expect(migratedConfiguration.colors.panel).toMatch(/, 0\.2\)$/u);
        expect(migratedConfiguration.colors.line).toMatch(/, 0\.1\)$/u);
      }
      const migrated = migratedThemes.find(
        (theme) => theme.themeId === previous.themeId,
      )!;
      const configuration = readThemeConfiguration(migrated.json);
      expect(migrated).toMatchObject({
        libraryId: original.libraryId,
        revision: original.revision + 1,
        sidebarOverlayOpacity: 20,
        status: "ready",
      });
      expect(configuration.colors).toMatchObject({
        background: "rgba(111, 18, 13, 0.2)",
        panel: "rgba(136, 24, 18, 0.2)",
        line: "rgba(255, 212, 56, 0.1)",
      });
      expect(upgraded.selected()?.libraryId).toBe(original.libraryId);
      const stored = JSON.parse(
        upgraded.managedStore.readFile(MANAGED_FILES.index)!.toString("utf8"),
      ) as { installedPresetPacks: string[] };
      expect(stored.installedPresetPacks).toEqual([
        predecessorPackId,
        DEFAULT_BUNDLED_PRESET_PACK_ID,
      ]);
    },
  );

  it("preserves a user-edited predecessor preset while completing the pack migration", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const currentSource = createBundledPresetSource(presetRoot);
    const currentPack = await currentSource.load();
    const previous = predecessorPreset(currentPack.themes[0], 2);
    const legacy = new LocalThemeStore(managed.root, [
      predecessorPackSource(PREVIOUS_BUNDLED_PRESET_PACK_ID, [previous]),
    ]);
    await legacy.init();
    const original = legacy
      .listRecords()
      .find((theme) => theme.themeId === previous.themeId)!;
    const edited = await legacy.patch(original.libraryId, original.revision, {
      name: "我的赤金主题",
    });
    legacy.managedStore.close();

    const upgraded = new LocalThemeStore(managed.root, [currentSource]);
    await upgraded.init();
    const preserved = upgraded.get(original.libraryId)!;
    expect(preserved).toMatchObject({
      name: "我的赤金主题",
      revision: edited.revision,
      fingerprint: edited.fingerprint,
      status: "draft",
    });
    expect(upgraded.listRecords()).toHaveLength(3);
  });

  it("does not revive a predecessor preset deleted before the migration", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const currentSource = createBundledPresetSource(presetRoot);
    const currentPack = await currentSource.load();
    const previous = predecessorPreset(currentPack.themes[0], 2);
    const legacy = new LocalThemeStore(managed.root, [
      predecessorPackSource(PREVIOUS_BUNDLED_PRESET_PACK_ID, [previous]),
    ]);
    await legacy.init();
    const original = legacy
      .listRecords()
      .find((theme) => theme.themeId === previous.themeId)!;
    await legacy.delete(original.libraryId, original.revision);
    legacy.managedStore.close();

    const upgraded = new LocalThemeStore(managed.root, [currentSource]);
    await upgraded.init();
    expect(
      upgraded
        .listRecords()
        .some((theme) => theme.themeId === previous.themeId),
    ).toBe(false);
    expect(upgraded.listRecords()).toHaveLength(2);
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
        replacesPackIds: [],
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
