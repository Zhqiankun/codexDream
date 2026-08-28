import { createHash, randomUUID } from "node:crypto";
import {
  DEFAULT_ADVANCED_STYLE,
  DEFAULT_BACKGROUND_SCOPE,
  DEFAULT_CONFIGURED_STYLE,
  DEFAULT_SIDEBAR_OVERLAY_OPACITY,
  DEFAULT_THEME_ART,
  DEFAULT_THEME_COLORS,
  cloneThemeConfiguration,
  generateConfiguredCss,
  isCompleteThemeArt,
  isCompatibleThemeColors,
  isCompleteThemeStyleConfig,
  isThemeAppearance,
  isThemeColor,
  readThemeConfiguration,
  writeThemeConfiguration,
  type BackgroundScope,
  type ThemeConfiguration,
  type ThemePatch,
  type ThemeSnapshot,
} from "../../contracts";
import type { ThemeCheckpoint, ThemeIndex, ThemeRecord } from "../domain/theme";
import {
  createDefaultIndex,
  themeFingerprint,
  toDetail,
  toSummary,
} from "../domain/theme";
import { validateSafeCss } from "./safe-css";
import sharp from "sharp";
import { validateImage } from "./image";
import type {
  BundledPresetSource,
  PreparedBundledPresetPack,
  PreparedBundledPresetTheme,
} from "./bundled-presets";
import {
  MANAGED_FILES,
  SecureManagedStore,
  managedThemeCheckpointFile,
  managedThemeFile,
} from "./secure-store";

interface DiskTheme {
  record: ThemeRecord;
  backgroundBase64?: string;
}

interface StoredThemeIndex {
  version: 1 | 2;
  selectedLibraryId?: string;
  lastKnownGoodLibraryId?: string;
  paused: boolean;
  installedPresetPacks?: string[];
  themes: ThemeRecord[];
  checkpoints?: ThemeCheckpoint[];
}

interface StoreJournal {
  version: 1;
  beforeSha256?: string;
  afterSha256: string;
  createdAt: string;
}

interface PreparedBackground {
  fileName: string;
  data: Buffer;
  mime: string;
  sha256: string;
  bytes: number;
}

interface PreparedCheckpoint {
  checkpoint: ThemeCheckpoint;
  background?: Buffer;
}

const DEFAULT_CSS = `[data-ds-part="root"] {\n  background-color: #111827;\n  color: #e5e7eb;\n}\n[data-ds-part="sidebar"] {\n  background-color: #0f172a;\n  border-color: #334155;\n}\n[data-ds-part="composer"]:hover {\n  background-color: #334155;\n}`;
const MAX_CSS_BYTES = 256 * 1024;
const MAX_INSTALLED_PRESET_PACKS = 32;
const PRESET_PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/u;

export class LocalThemeStore {
  readonly root: string;
  readonly managedStore: SecureManagedStore;
  private index: ThemeIndex = createDefaultIndex();
  private backgrounds = new Map<string, Buffer>();

  constructor(
    root: string,
    private readonly bundledPresetSources: readonly BundledPresetSource[] = [],
  ) {
    this.root = root;
    this.managedStore = SecureManagedStore.open(root);
  }

  async init(): Promise<void> {
    await this.ensureLayout();
    await this.recoverJournal();
    try {
      const bytes = this.managedStore.readFile(MANAGED_FILES.index);
      if (!bytes) this.index = createDefaultIndex();
      else {
        const parsed = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        ) as unknown;
        if (!isStoredThemeIndex(parsed))
          throw new Error("STORE_TAMPERED:index-schema");
        this.index = withPresentationDefaults(parsed);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("STORE_TAMPERED")
      ) {
        throw error;
      } else {
        throw new Error("STORE_TAMPERED:index-read");
      }
    }
    this.validateIndex();
    for (const theme of this.index.themes) {
      try {
        if (theme.backgroundFile) await this.validateStoredImage(theme);
        if (
          theme.status === "ready" &&
          (!theme.backgroundFile ||
            theme.fingerprint !== this.fingerprint(theme))
        )
          throw new Error("ready record is incomplete");
      } catch {
        throw new Error("STORE_TAMPERED:theme");
      }
    }
    for (const checkpoint of this.index.checkpoints) {
      try {
        await this.validateCheckpoint(checkpoint);
      } catch {
        throw new Error("STORE_TAMPERED:checkpoint");
      }
    }
    if (this.index.themes.length === 0) {
      await this.createBuiltIns();
    }
    await this.installBundledPresetPacks();
  }

  snapshot(
    session: ThemeSnapshot["session"],
    update: ThemeSnapshot["update"],
  ): ThemeSnapshot {
    return {
      themes: this.index.themes.map((theme) =>
        toSummary(theme, this.index.selectedLibraryId),
      ),
      selectedLibraryId: this.index.selectedLibraryId,
      paused: this.index.paused,
      session,
      update,
    };
  }

  get(libraryId: string): ThemeRecord | undefined {
    return this.index.themes.find((theme) => theme.libraryId === libraryId);
  }

  getDetail(
    libraryId: string,
    assetBase: string,
  ): ReturnType<typeof toDetail> | undefined {
    const theme = this.get(libraryId);
    if (!theme) return undefined;
    return toDetail(
      theme,
      this.index.selectedLibraryId,
      theme.backgroundFile
        ? `${assetBase}/${theme.libraryId}?v=${theme.revision}`
        : undefined,
      Boolean(this.checkpointFor(libraryId)),
    );
  }

  listRecords(): ThemeRecord[] {
    return this.index.themes;
  }

  getBackground(libraryId: string): Buffer | undefined {
    return this.backgrounds.get(libraryId);
  }

  async createDraft(name = "Untitled theme"): Promise<ThemeRecord> {
    const libraryId = this.allocateLibraryId();
    const now = new Date().toISOString();
    const background = await createTransparentBackground(libraryId);
    const configuration = cloneThemeConfiguration({
      appearance: "auto",
      art: DEFAULT_THEME_ART,
      colors: { ...DEFAULT_THEME_COLORS, accent: "#7c3aed" },
      styleConfig: DEFAULT_CONFIGURED_STYLE,
    });
    const css = generateConfiguredCss(configuration.styleConfig);
    const validation = validateSafeCss(css);
    const record: ThemeRecord = {
      libraryId,
      themeId: `local-${libraryId.slice(0, 8)}`,
      name: name || "Untitled theme",
      description: "",
      css,
      backgroundScope: DEFAULT_BACKGROUND_SCOPE,
      sidebarOverlayOpacity: DEFAULT_SIDEBAR_OVERLAY_OPACITY,
      json: writeThemeConfiguration(
        {
          schemaVersion: 1,
          id: `local-${libraryId.slice(0, 8)}`,
          name: name || "Untitled theme",
          description: "",
          image: background.fileName,
          backgroundScope: DEFAULT_BACKGROUND_SCOPE,
          sidebarOverlayOpacity: DEFAULT_SIDEBAR_OVERLAY_OPACITY,
        },
        configuration,
      ),
      backgroundFile: background.fileName,
      backgroundMime: background.mime,
      backgroundSha256: background.sha256,
      backgroundBytes: background.bytes,
      status: "draft",
      revision: 1,
      updatedAt: now,
      fingerprint: "",
      packageFormat: "simplified",
      signed: false,
      validation: {
        css: validation.valid && !validation.empty ? "valid" : "invalid",
        image: "valid",
        package: "draft",
        warnings: [],
      },
    };

    const before = this.captureState();
    const backgroundFile = managedThemeFile(background.fileName);
    let backgroundWriteAttempted = false;
    let persistAttempted = false;
    try {
      if (this.managedStore.readFile(backgroundFile) !== undefined)
        throw new Error("STORE_TAMPERED:theme-file-conflict");
      backgroundWriteAttempted = true;
      this.managedStore.writeFileAtomic(backgroundFile, background.data);
      this.backgrounds.set(libraryId, Buffer.from(background.data));
      this.index.themes.unshift(record);
      persistAttempted = true;
      await this.persist();
      return record;
    } catch (error) {
      return this.rollbackBackgroundMutation(
        before,
        background.fileName,
        backgroundWriteAttempted,
        persistAttempted,
        error,
      );
    }
  }

  async patch(
    libraryId: string,
    expectedRevision: number,
    patch: ThemePatch,
  ): Promise<ThemeRecord> {
    const theme = this.require(libraryId);
    if (theme.revision !== expectedRevision) throw new Error("STALE_REVISION");
    if (
      patch.css !== undefined &&
      Buffer.byteLength(patch.css, "utf8") > MAX_CSS_BYTES
    )
      throw new Error("UNSAFE_CSS:css-too-large");
    if (
      patch.themeJson !== undefined &&
      Buffer.byteLength(patch.themeJson, "utf8") > 64 * 1024
    )
      throw new Error("UNSAFE_ARCHIVE:theme-json-too-large");
    return this.mutateWithCheckpoint(libraryId, () => {
      if (patch.themeJson !== undefined) {
        applyThemeJsonSource(theme, patch.themeJson);
      } else {
        if (patch.name !== undefined)
          theme.name = patch.name || "Untitled theme";
        if (patch.description !== undefined)
          theme.description = patch.description;
        if (patch.themeId !== undefined && patch.themeId.trim())
          theme.themeId = patch.themeId.trim();
        if (patch.backgroundScope !== undefined)
          theme.backgroundScope = patch.backgroundScope;
        if (patch.sidebarOverlayOpacity !== undefined)
          theme.sidebarOverlayOpacity = patch.sidebarOverlayOpacity;
        const configuration = readThemeConfiguration(theme.json);
        if (patch.appearance !== undefined)
          configuration.appearance = patch.appearance;
        if (patch.art !== undefined) configuration.art = { ...patch.art };
        if (patch.colors !== undefined)
          configuration.colors = { ...patch.colors };
        if (patch.styleConfig !== undefined)
          configuration.styleConfig = {
            ...patch.styleConfig,
            recipes: { ...patch.styleConfig.recipes },
          };
        theme.json = writeThemeConfiguration(
          {
            ...theme.json,
            name: theme.name,
            id: theme.themeId,
            description: theme.description,
            backgroundScope: theme.backgroundScope,
            sidebarOverlayOpacity: theme.sidebarOverlayOpacity,
          },
          configuration,
        );
        theme.css =
          configuration.styleConfig.mode === "configured"
            ? generateConfiguredCss(configuration.styleConfig)
            : (patch.css ?? theme.css);
      }
      const cssValidation = validateSafeCss(theme.css);
      theme.validation.css = cssValidation.empty
        ? "empty"
        : cssValidation.valid
          ? "valid"
          : "invalid";
      theme.validation.package = "draft";
      theme.validation.warnings = cssValidation.errors;
      theme.status = "draft";
      theme.revision += 1;
      theme.updatedAt = new Date().toISOString();
      theme.importedFormal = theme.importedFormal
        ? { ...theme.importedFormal, edited: true }
        : undefined;
      if (theme.importedFormal?.edited) theme.packageFormat = "simplified";
      if (this.index.lastKnownGoodLibraryId === libraryId)
        this.index.lastKnownGoodLibraryId = undefined;
      return theme;
    });
  }

  async setBackground(
    libraryId: string,
    expectedRevision: number,
    fileName: string,
    data: Buffer,
    mime: string,
    sha256: string,
  ): Promise<ThemeRecord> {
    const theme = this.require(libraryId);
    if (theme.revision !== expectedRevision) throw new Error("STALE_REVISION");
    const verified = await validateImage(data, fileName);
    if (verified.mime !== mime || verified.sha256 !== sha256)
      throw new Error("UNSAFE_IMAGE:image-changed");
    const extension = verified.extension;
    const fileNameOnDisk = this.allocateManagedImageFile(extension);
    const before = this.captureState();
    const previousImage = this.backgrounds.get(libraryId);
    const previousFile = theme.backgroundFile;
    let stagedCheckpointFile: string | undefined;
    let persistAttempted = false;
    try {
      const prepared = await this.prepareCheckpoint(theme);
      if (prepared) {
        stagedCheckpointFile = prepared.checkpoint.backgroundFile;
        this.writePreparedCheckpoint(prepared);
      }
      this.managedStore.writeFileAtomic(managedThemeFile(fileNameOnDisk), data);
      this.backgrounds.set(libraryId, Buffer.from(data));
      theme.backgroundFile = fileNameOnDisk;
      theme.backgroundMime = verified.mime;
      theme.backgroundSha256 = verified.sha256;
      theme.backgroundBytes = verified.bytes;
      theme.json = { ...theme.json, image: fileNameOnDisk };
      theme.validation.image = "valid";
      theme.validation.package = "draft";
      theme.status = "draft";
      if (theme.importedFormal) {
        theme.importedFormal = { ...theme.importedFormal, edited: true };
        theme.packageFormat = "simplified";
      }
      theme.revision += 1;
      theme.updatedAt = new Date().toISOString();
      if (this.index.lastKnownGoodLibraryId === libraryId)
        this.index.lastKnownGoodLibraryId = undefined;
      persistAttempted = true;
      await this.persist();
      if (previousFile && previousFile !== fileNameOnDisk) {
        const removed = this.managedStore.removeFile(
          managedThemeFile(previousFile),
        );
        if (!removed) throw new Error("STORE_TAMPERED:background-cleanup");
      }
      return theme;
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        if (previousImage && previousFile)
          this.managedStore.writeFileAtomic(
            managedThemeFile(previousFile),
            previousImage,
          );
        if (fileNameOnDisk !== previousFile)
          this.removeManagedFileIfPresent(managedThemeFile(fileNameOnDisk));
        if (stagedCheckpointFile)
          this.removeManagedFileIfPresent(
            managedThemeCheckpointFile(stagedCheckpointFile),
          );
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:background-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  async commit(
    libraryId: string,
    expectedRevision: number,
  ): Promise<ThemeRecord> {
    const theme = this.require(libraryId);
    if (theme.revision !== expectedRevision) throw new Error("STALE_REVISION");
    const cssValidation = validateSafeCss(theme.css);
    if (!cssValidation.valid || cssValidation.empty)
      throw new Error(cssValidation.empty ? "INCOMPLETE_THEME" : "UNSAFE_CSS");

    if (isLegacyBackgroundlessDraft(theme)) {
      const background = await createTransparentBackground(libraryId);
      const before = this.captureState();
      const checkpoint = this.checkpointFor(libraryId);
      if (checkpoint) await this.validateCheckpoint(checkpoint);
      const checkpointImage = checkpoint
        ? await this.readCheckpointBackground(checkpoint)
        : undefined;
      const backgroundFile = managedThemeFile(background.fileName);
      let backgroundWriteAttempted = false;
      let persistAttempted = false;
      try {
        if (this.managedStore.readFile(backgroundFile) !== undefined)
          throw new Error("STORE_TAMPERED:theme-file-conflict");
        backgroundWriteAttempted = true;
        this.managedStore.writeFileAtomic(backgroundFile, background.data);
        this.backgrounds.set(libraryId, Buffer.from(background.data));
        theme.backgroundFile = background.fileName;
        theme.backgroundMime = background.mime;
        theme.backgroundSha256 = background.sha256;
        theme.backgroundBytes = background.bytes;
        theme.json = { ...theme.json, image: background.fileName };
        theme.validation.image = "valid";
        await this.validateThemePayload(theme);
        theme.validation.css = "valid";
        theme.validation.package = "ready";
        theme.validation.warnings = [];
        theme.status = "ready";
        theme.fingerprint = this.fingerprint(theme);
        theme.revision += 1;
        theme.updatedAt = new Date().toISOString();
        this.removeCheckpointFromIndex(libraryId);
        persistAttempted = true;
        await this.persist();
        if (checkpoint?.backgroundFile)
          this.removeExpectedManagedFile(
            managedThemeCheckpointFile(checkpoint.backgroundFile),
          );
        return theme;
      } catch (error) {
        this.restoreState(before);
        try {
          if (persistAttempted) await this.restorePersistedIndex(before.index);
          if (checkpoint?.backgroundFile && checkpointImage)
            this.managedStore.writeFileAtomic(
              managedThemeCheckpointFile(checkpoint.backgroundFile),
              checkpointImage,
            );
          if (backgroundWriteAttempted)
            this.removeUncommittedBackground(background.fileName);
        } catch (rollbackError) {
          throw new Error("STORE_TAMPERED:commit-rollback", {
            cause: rollbackError,
          });
        }
        throw error;
      }
    }

    await this.validateThemePayload(theme);
    return this.mutateClearingCheckpoint(libraryId, () => {
      theme.validation.css = "valid";
      theme.validation.package = "ready";
      theme.validation.warnings = [];
      theme.status = "ready";
      theme.fingerprint = this.fingerprint(theme);
      theme.revision += 1;
      theme.updatedAt = new Date().toISOString();
      return theme;
    });
  }

  async discardChanges(
    libraryId: string,
    expectedRevision: number,
  ): Promise<ThemeRecord> {
    const current = this.require(libraryId);
    if (current.revision !== expectedRevision)
      throw new Error("STALE_REVISION");
    const checkpoint = this.checkpointFor(libraryId);
    // The renderer also uses this endpoint to discard edits that have not yet
    // crossed the IPC boundary. In that case there is deliberately no durable
    // checkpoint and the current record is already the desired state.
    if (!checkpoint) return current;

    await this.validateCheckpoint(checkpoint);
    const checkpointImage = await this.readCheckpointBackground(checkpoint);
    const currentImage = current.backgroundFile
      ? this.managedStore.readFile(managedThemeFile(current.backgroundFile))
      : undefined;
    if (current.backgroundFile && !currentImage)
      throw new Error("STORE_TAMPERED:file");

    const before = this.captureState();
    const currentFile = current.backgroundFile;
    let persistAttempted = false;
    try {
      const restored = cloneThemeRecord(checkpoint.record);
      if (checkpointImage && checkpoint.backgroundFile) {
        // Promote the immutable checkpoint copy instead of overwriting the
        // active image. The index rename is then the only commit point: before
        // it the old index/file pair is valid, afterwards the restored
        // index/checkpoint-file pair is valid.
        restored.backgroundFile = checkpoint.backgroundFile;
        restored.json = {
          ...restored.json,
          image: checkpoint.backgroundFile,
        };
      }
      restored.revision = current.revision + 1;
      restored.updatedAt = new Date().toISOString();
      const themeIndex = this.index.themes.findIndex(
        (candidate) => candidate.libraryId === libraryId,
      );
      if (themeIndex < 0) throw new Error("NOT_FOUND");
      this.index.themes[themeIndex] = restored;
      if (
        checkpoint.wasLastKnownGood &&
        (!this.index.lastKnownGoodLibraryId ||
          this.index.lastKnownGoodLibraryId === libraryId)
      )
        this.index.lastKnownGoodLibraryId = libraryId;
      else if (this.index.lastKnownGoodLibraryId === libraryId)
        this.index.lastKnownGoodLibraryId = undefined;
      this.removeCheckpointFromIndex(libraryId);
      if (checkpointImage) this.backgrounds.set(libraryId, checkpointImage);
      else this.backgrounds.delete(libraryId);

      persistAttempted = true;
      await this.persist();
      if (currentFile && currentFile !== restored.backgroundFile) {
        this.removeExpectedManagedFile(managedThemeFile(currentFile));
      }
      return restored;
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        if (currentFile && currentImage)
          this.managedStore.writeFileAtomic(
            managedThemeFile(currentFile),
            currentImage,
          );
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:discard-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  async select(libraryId: string, expectedRevision: number): Promise<void> {
    const theme = this.require(libraryId);
    if (theme.revision !== expectedRevision) throw new Error("STALE_REVISION");
    if (theme.status !== "ready") throw new Error("INCOMPLETE_THEME");
    await this.validateThemePayload(theme);
    if (theme.fingerprint !== this.fingerprint(theme))
      throw new Error("UNSAFE_ARCHIVE:theme-fingerprint");
    await this.mutate(() => {
      this.index.selectedLibraryId = libraryId;
    });
  }

  async clearSelection(): Promise<void> {
    await this.mutate(() => {
      this.index.selectedLibraryId = undefined;
    });
  }

  async delete(libraryId: string, expectedRevision: number): Promise<void> {
    const index = this.index.themes.findIndex(
      (theme) => theme.libraryId === libraryId,
    );
    if (index < 0) throw new Error("NOT_FOUND");
    const theme = this.index.themes[index];
    if (theme.revision !== expectedRevision) throw new Error("STALE_REVISION");
    if (
      this.index.selectedLibraryId === libraryId ||
      this.index.lastKnownGoodLibraryId === libraryId
    )
      throw new Error("THEME_IN_USE");

    const before = this.captureState();
    const image = this.backgrounds.get(libraryId);
    const checkpoint = this.checkpointFor(libraryId);
    if (checkpoint) await this.validateCheckpoint(checkpoint);
    const checkpointImage = checkpoint
      ? await this.readCheckpointBackground(checkpoint)
      : undefined;
    this.index.themes.splice(index, 1);
    this.removeCheckpointFromIndex(libraryId);
    this.backgrounds.delete(libraryId);
    let persistAttempted = false;
    try {
      persistAttempted = true;
      await this.persist();
      if (theme.backgroundFile)
        this.removeExpectedManagedFile(managedThemeFile(theme.backgroundFile));
      if (checkpoint?.backgroundFile)
        this.removeExpectedManagedFile(
          managedThemeCheckpointFile(checkpoint.backgroundFile),
        );
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        if (image && theme.backgroundFile)
          this.managedStore.writeFileAtomic(
            managedThemeFile(theme.backgroundFile),
            image,
          );
        if (checkpoint?.backgroundFile && checkpointImage)
          this.managedStore.writeFileAtomic(
            managedThemeCheckpointFile(checkpoint.backgroundFile),
            checkpointImage,
          );
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:delete-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.mutate(() => {
      this.index.paused = paused;
    });
  }

  selected(): ThemeRecord | undefined {
    return this.index.selectedLibraryId
      ? this.get(this.index.selectedLibraryId)
      : undefined;
  }

  async selectedReadyForInjection(): Promise<ThemeRecord | undefined> {
    const theme = this.selected();
    if (!theme) return undefined;
    if (theme.status !== "ready") throw new Error("INCOMPLETE_THEME");
    await this.validateThemePayload(theme);
    if (theme.fingerprint !== this.fingerprint(theme))
      throw new Error("UNSAFE_ARCHIVE:theme-fingerprint");
    return theme;
  }

  async markLastKnownGood(
    libraryId: string,
    fingerprint: string,
  ): Promise<void> {
    const theme = this.require(libraryId);
    if (
      theme.status !== "ready" ||
      theme.fingerprint !== fingerprint ||
      fingerprint !== this.fingerprint(theme)
    )
      throw new Error("INCOMPLETE_THEME:last-known-good");
    await this.mutate(() => {
      this.index.lastKnownGoodLibraryId = libraryId;
    });
  }

  async replaceRecord(
    libraryId: string,
    expectedRevision: number,
    replacement: ThemeRecord,
    image: Buffer,
  ): Promise<void> {
    const index = this.index.themes.findIndex(
      (theme) => theme.libraryId === libraryId,
    );
    if (index < 0) throw new Error("NOT_FOUND");
    if (this.index.themes[index].revision !== expectedRevision)
      throw new Error("STALE_REVISION");
    if (this.index.selectedLibraryId === libraryId)
      throw new Error("THEME_ID_CONFLICT");
    if (this.index.lastKnownGoodLibraryId === libraryId)
      throw new Error("THEME_ID_CONFLICT:last-known-good");
    if (replacement.libraryId !== libraryId)
      throw new Error("THEME_ID_CONFLICT:replacement-library-id");
    const nextReplacement = cloneThemeRecord(replacement);
    nextReplacement.revision = expectedRevision + 1;
    nextReplacement.updatedAt = new Date().toISOString();
    await this.validateImportedRecord(nextReplacement, image);
    const replacementFile = this.allocateManagedImageFile(
      extensionOf(nextReplacement.backgroundFile!),
    );
    nextReplacement.backgroundFile = replacementFile;
    nextReplacement.json = {
      ...nextReplacement.json,
      image: replacementFile,
    };
    await this.validateImportedRecord(nextReplacement, image);
    const before = this.captureState();
    const previous = this.index.themes[index];
    const previousImage = this.backgrounds.get(libraryId);
    const checkpoint = this.checkpointFor(libraryId);
    if (checkpoint) await this.validateCheckpoint(checkpoint);
    const checkpointImage = checkpoint
      ? await this.readCheckpointBackground(checkpoint)
      : undefined;
    const replacementFileBefore =
      previous.backgroundFile !== replacementFile
        ? this.managedStore.readFile(managedThemeFile(replacementFile))
        : previousImage;
    let persistAttempted = false;
    try {
      this.managedStore.writeFileAtomic(
        managedThemeFile(replacementFile),
        image,
      );
      this.backgrounds.set(libraryId, Buffer.from(image));
      this.index.themes[index] = nextReplacement;
      this.removeCheckpointFromIndex(libraryId);
      persistAttempted = true;
      await this.persist();
      if (
        previous.backgroundFile &&
        previous.backgroundFile !== replacementFile
      )
        this.removeExpectedManagedFile(
          managedThemeFile(previous.backgroundFile),
        );
      if (checkpoint?.backgroundFile)
        this.removeExpectedManagedFile(
          managedThemeCheckpointFile(checkpoint.backgroundFile),
        );
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        if (previousImage && previous.backgroundFile)
          this.managedStore.writeFileAtomic(
            managedThemeFile(previous.backgroundFile),
            previousImage,
          );
        if (replacementFile !== previous.backgroundFile) {
          if (replacementFileBefore)
            this.managedStore.writeFileAtomic(
              managedThemeFile(replacementFile),
              replacementFileBefore,
            );
          else
            this.removeManagedFileIfPresent(managedThemeFile(replacementFile));
        }
        if (checkpoint?.backgroundFile && checkpointImage)
          this.managedStore.writeFileAtomic(
            managedThemeCheckpointFile(checkpoint.backgroundFile),
            checkpointImage,
          );
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:replace-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  async addImported(record: ThemeRecord, image: Buffer): Promise<void> {
    if (
      this.get(record.libraryId) ||
      this.managedImageIds().has(record.libraryId)
    )
      throw new Error("THEME_ID_CONFLICT");
    await this.validateImportedRecord(record, image);
    const importedImageId = managedImageId(record.backgroundFile!);
    if (
      ["png", "jpg", "webp"].some(
        (extension) =>
          this.managedStore.readFile(
            managedThemeFile(`${importedImageId}.${extension}`),
          ) !== undefined,
      )
    )
      throw new Error("STORE_TAMPERED:theme-file-conflict");
    const importedFile = managedThemeFile(record.backgroundFile!);
    const before = this.captureState();
    let imageWriteAttempted = false;
    let persistAttempted = false;
    try {
      imageWriteAttempted = true;
      this.managedStore.writeFileAtomic(importedFile, image);
      this.backgrounds.set(record.libraryId, Buffer.from(image));
      this.index.themes.unshift(record);
      persistAttempted = true;
      await this.persist();
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        if (imageWriteAttempted) this.removeManagedFileIfPresent(importedFile);
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:import-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  private require(libraryId: string): ThemeRecord {
    const theme = this.get(libraryId);
    if (!theme) throw new Error("NOT_FOUND");
    return theme;
  }

  private checkpointFor(libraryId: string): ThemeCheckpoint | undefined {
    return this.index.checkpoints.find(
      (checkpoint) => checkpoint.libraryId === libraryId,
    );
  }

  private removeCheckpointFromIndex(libraryId: string): void {
    const index = this.index.checkpoints.findIndex(
      (checkpoint) => checkpoint.libraryId === libraryId,
    );
    if (index >= 0) this.index.checkpoints.splice(index, 1);
  }

  private async prepareCheckpoint(
    theme: ThemeRecord,
  ): Promise<PreparedCheckpoint | undefined> {
    if (this.checkpointFor(theme.libraryId)) return undefined;
    let background: Buffer | undefined;
    let backgroundFile: string | undefined;
    if (theme.backgroundFile) {
      await this.validateStoredImage(theme);
      background = Buffer.from(this.backgrounds.get(theme.libraryId)!);
      const extension = theme.backgroundFile.slice(
        theme.backgroundFile.lastIndexOf(".") + 1,
      );
      backgroundFile = this.allocateManagedImageFile(extension);
      if (!backgroundFile)
        throw new Error("STORE_TAMPERED:checkpoint-file-conflict");
    }
    return {
      checkpoint: {
        libraryId: theme.libraryId,
        record: cloneThemeRecord(theme),
        backgroundFile,
        wasLastKnownGood: this.index.lastKnownGoodLibraryId === theme.libraryId,
        createdAt: new Date().toISOString(),
      },
      background,
    };
  }

  private writePreparedCheckpoint(prepared: PreparedCheckpoint): void {
    const { checkpoint, background } = prepared;
    if (checkpoint.backgroundFile) {
      if (!background) throw new Error("STORE_TAMPERED:checkpoint-image");
      const file = managedThemeCheckpointFile(checkpoint.backgroundFile);
      if (this.managedStore.readFile(file) !== undefined)
        throw new Error("STORE_TAMPERED:checkpoint-file-conflict");
      this.managedStore.writeFileAtomic(file, background);
      const written = this.managedStore.readFile(file);
      if (!written || !written.equals(background))
        throw new Error("STORE_TAMPERED:checkpoint-write");
    }
    this.index.checkpoints.push(checkpoint);
  }

  private allocateLibraryId(): string {
    const usedImageIds = this.managedImageIds();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = randomUUID();
      if (
        !this.get(candidate) &&
        !usedImageIds.has(candidate) &&
        ["png", "jpg", "webp"].every(
          (extension) =>
            this.managedStore.readFile(
              managedThemeFile(`${candidate}.${extension}`),
            ) === undefined,
        )
      )
        return candidate;
    }
    throw new Error("STORE_TAMPERED:library-id-conflict");
  }

  private allocateManagedImageFile(extension: string): string {
    const usedImageIds = this.managedImageIds();
    const themeIds = new Set(this.index.themes.map((theme) => theme.libraryId));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidateId = randomUUID();
      if (usedImageIds.has(candidateId) || themeIds.has(candidateId)) continue;
      const candidate = `${candidateId}.${extension}`;
      if (
        ["png", "jpg", "webp"].every(
          (entry) =>
            this.managedStore.readFile(
              managedThemeFile(`${candidateId}.${entry}`),
            ) === undefined,
        )
      )
        return candidate;
    }
    throw new Error("STORE_TAMPERED:image-id-conflict");
  }

  private managedImageIds(): Set<string> {
    return new Set(
      [
        ...this.index.themes.map((theme) => theme.backgroundFile),
        ...this.index.checkpoints.map(
          (checkpoint) => checkpoint.backgroundFile,
        ),
      ]
        .filter((file): file is string => Boolean(file))
        .map(managedImageId),
    );
  }

  private async mutateWithCheckpoint<T>(
    libraryId: string,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    const before = this.captureState();
    let stagedCheckpointFile: string | undefined;
    let persistAttempted = false;
    try {
      const prepared = await this.prepareCheckpoint(this.require(libraryId));
      if (prepared) {
        stagedCheckpointFile = prepared.checkpoint.backgroundFile;
        this.writePreparedCheckpoint(prepared);
      }
      const result = await operation();
      persistAttempted = true;
      await this.persist();
      return result;
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        if (stagedCheckpointFile)
          this.removeManagedFileIfPresent(
            managedThemeCheckpointFile(stagedCheckpointFile),
          );
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:checkpoint-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  private async mutateClearingCheckpoint<T>(
    libraryId: string,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    const checkpoint = this.checkpointFor(libraryId);
    if (checkpoint) await this.validateCheckpoint(checkpoint);
    const checkpointImage = checkpoint
      ? await this.readCheckpointBackground(checkpoint)
      : undefined;
    const before = this.captureState();
    let persistAttempted = false;
    try {
      const result = await operation();
      this.removeCheckpointFromIndex(libraryId);
      persistAttempted = true;
      await this.persist();
      if (checkpoint?.backgroundFile)
        this.removeExpectedManagedFile(
          managedThemeCheckpointFile(checkpoint.backgroundFile),
        );
      return result;
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        if (checkpoint?.backgroundFile && checkpointImage)
          this.managedStore.writeFileAtomic(
            managedThemeCheckpointFile(checkpoint.backgroundFile),
            checkpointImage,
          );
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:checkpoint-clear-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  private captureState(): {
    index: ThemeIndex;
    backgrounds: Map<string, Buffer>;
  } {
    return {
      index: JSON.parse(JSON.stringify(this.index)) as ThemeIndex,
      backgrounds: new Map(
        [...this.backgrounds].map(([id, image]) => [id, Buffer.from(image)]),
      ),
    };
  }

  private restoreState(state: {
    index: ThemeIndex;
    backgrounds: Map<string, Buffer>;
  }): void {
    this.index = state.index;
    this.backgrounds = state.backgrounds;
  }

  private async rollbackBackgroundMutation(
    before: { index: ThemeIndex; backgrounds: Map<string, Buffer> },
    fileName: string,
    backgroundWriteAttempted: boolean,
    persistAttempted: boolean,
    originalError: unknown,
  ): Promise<never> {
    this.restoreState(before);
    try {
      if (persistAttempted) await this.restorePersistedIndex(before.index);
      if (backgroundWriteAttempted) this.removeUncommittedBackground(fileName);
    } catch (rollbackError) {
      throw new Error("STORE_TAMPERED:background-rollback", {
        cause: rollbackError,
      });
    }
    throw originalError;
  }

  private async restorePersistedIndex(index: ThemeIndex): Promise<void> {
    const current = this.managedStore.readFile(MANAGED_FILES.index);
    if (!current || !indexPayloadMatches(current, index)) {
      try {
        await this.persist();
      } catch (error) {
        const restored = this.managedStore.readFile(MANAGED_FILES.index);
        if (!restored || !indexPayloadMatches(restored, index)) throw error;
      }
    }
    await this.removeTransactionArtifacts(index);
    const restored = this.managedStore.readFile(MANAGED_FILES.index);
    if (!restored || !indexPayloadMatches(restored, index))
      throw new Error("STORE_TAMPERED:index-rollback");
  }

  private async removeTransactionArtifacts(index: ThemeIndex): Promise<void> {
    if (
      this.managedStore.readFile(MANAGED_FILES.journal) === undefined &&
      this.managedStore.readFile(MANAGED_FILES.backup) === undefined
    )
      return;
    const release = await this.acquireLock();
    try {
      const current = this.managedStore.readFile(MANAGED_FILES.index);
      if (!current || !indexPayloadMatches(current, index))
        throw new Error("STORE_TAMPERED:index-rollback");
      for (const file of [MANAGED_FILES.journal, MANAGED_FILES.backup]) {
        if (this.managedStore.readFile(file) === undefined) continue;
        this.managedStore.removeFile(file);
        if (this.managedStore.readFile(file) !== undefined)
          throw new Error("STORE_TAMPERED:transaction-rollback");
      }
    } finally {
      await release();
    }
  }

  private removeUncommittedBackground(fileName: string): void {
    this.removeManagedFileIfPresent(managedThemeFile(fileName));
  }

  private removeManagedFileIfPresent(
    file: ReturnType<typeof managedThemeFile>,
  ): void {
    if (this.managedStore.readFile(file) === undefined) return;
    this.managedStore.removeFile(file);
    if (this.managedStore.readFile(file) !== undefined)
      throw new Error("STORE_TAMPERED:file-cleanup");
  }

  private removeExpectedManagedFile(
    file: ReturnType<typeof managedThemeFile>,
  ): void {
    if (this.managedStore.readFile(file) === undefined)
      throw new Error("STORE_TAMPERED:file-missing");
    if (!this.managedStore.removeFile(file))
      throw new Error("STORE_TAMPERED:file-cleanup");
    if (this.managedStore.readFile(file) !== undefined)
      throw new Error("STORE_TAMPERED:file-cleanup");
  }

  private async mutate<T>(operation: () => T | Promise<T>): Promise<T> {
    const before = this.captureState();
    let persistAttempted = false;
    try {
      const result = await operation();
      persistAttempted = true;
      await this.persist();
      return result;
    } catch (error) {
      this.restoreState(before);
      if (persistAttempted) {
        try {
          await this.restorePersistedIndex(before.index);
        } catch (rollbackError) {
          throw new Error("STORE_TAMPERED:index-rollback", {
            cause: rollbackError,
          });
        }
      }
      throw error;
    }
  }

  private fingerprint(theme: ThemeRecord): string {
    return themeFingerprint(theme);
  }

  private async validateThemePayload(theme: ThemeRecord): Promise<void> {
    const css = validateSafeCss(theme.css);
    if (!css.valid || css.empty) throw new Error("UNSAFE_CSS");
    const configuration = readThemeConfiguration(theme.json);
    if (
      configuration.styleConfig.mode === "configured" &&
      theme.css !== generateConfiguredCss(configuration.styleConfig)
    )
      throw new Error("UNSAFE_CSS:configured-css-mismatch");
    if (!theme.backgroundFile) throw new Error("INCOMPLETE_THEME");
    await this.validateStoredImage(theme);
  }

  private async validateImportedRecord(
    record: ThemeRecord,
    image: Buffer,
  ): Promise<void> {
    if (
      !isThemeRecord(record) ||
      record.status !== "ready" ||
      !record.backgroundFile ||
      record.fingerprint !== this.fingerprint(record)
    )
      throw new Error("UNSAFE_ARCHIVE:import-record");
    const verified = await validateImage(image, record.backgroundFile);
    if (
      verified.mime !== record.backgroundMime ||
      verified.sha256 !== record.backgroundSha256 ||
      verified.bytes !== record.backgroundBytes
    )
      throw new Error("UNSAFE_IMAGE:import-image");
  }

  private async validateStoredImage(theme: ThemeRecord): Promise<void> {
    if (
      !theme.backgroundFile ||
      !theme.backgroundMime ||
      !theme.backgroundSha256 ||
      !Number.isSafeInteger(theme.backgroundBytes) ||
      !isManagedBackgroundFileName(theme.backgroundFile)
    )
      throw new Error("UNSAFE_IMAGE:image-metadata");
    const data = this.managedStore.readFile(
      managedThemeFile(theme.backgroundFile),
    );
    if (!data) throw new Error("STORE_TAMPERED:file");
    const image = await validateImage(data, theme.backgroundFile);
    if (
      image.mime !== theme.backgroundMime ||
      image.sha256 !== theme.backgroundSha256 ||
      image.bytes !== theme.backgroundBytes
    )
      throw new Error("UNSAFE_IMAGE:image-fingerprint");
    const cached = this.backgrounds.get(theme.libraryId);
    if (cached && !cached.equals(data))
      throw new Error("UNSAFE_IMAGE:image-changed");
    this.backgrounds.set(theme.libraryId, data);
  }

  private async validateCheckpoint(checkpoint: ThemeCheckpoint): Promise<void> {
    const current = this.get(checkpoint.libraryId);
    if (
      !isThemeCheckpoint(checkpoint) ||
      !current ||
      current.status !== "draft" ||
      checkpoint.record.libraryId !== checkpoint.libraryId ||
      checkpoint.record.revision >= current.revision ||
      (checkpoint.record.status === "ready" &&
        (!checkpoint.record.backgroundFile ||
          checkpoint.record.fingerprint !==
            this.fingerprint(checkpoint.record))) ||
      (checkpoint.wasLastKnownGood && checkpoint.record.status !== "ready")
    )
      throw new Error("STORE_TAMPERED:checkpoint");
    await this.readCheckpointBackground(checkpoint);
  }

  private async readCheckpointBackground(
    checkpoint: ThemeCheckpoint,
  ): Promise<Buffer | undefined> {
    const record = checkpoint.record;
    const hasBackground = record.backgroundFile !== undefined;
    if (hasBackground !== (checkpoint.backgroundFile !== undefined))
      throw new Error("STORE_TAMPERED:checkpoint-image");
    if (!hasBackground) return undefined;
    const file = managedThemeCheckpointFile(checkpoint.backgroundFile!);
    const data = this.managedStore.readFile(file);
    if (!data) throw new Error("STORE_TAMPERED:checkpoint-file");
    const verified = await validateImage(data, checkpoint.backgroundFile!);
    if (
      verified.mime !== record.backgroundMime ||
      verified.sha256 !== record.backgroundSha256 ||
      verified.bytes !== record.backgroundBytes ||
      extensionOf(checkpoint.backgroundFile!) !==
        extensionOf(record.backgroundFile!)
    )
      throw new Error("STORE_TAMPERED:checkpoint-image");
    return data;
  }

  private validateIndex(): void {
    if (
      this.index.installedPresetPacks.length > MAX_INSTALLED_PRESET_PACKS ||
      new Set(this.index.installedPresetPacks).size !==
        this.index.installedPresetPacks.length ||
      this.index.installedPresetPacks.some(
        (packId) => !PRESET_PACK_ID_PATTERN.test(packId),
      )
    )
      throw new Error("STORE_TAMPERED:index-preset-packs");
    const ids = new Set<string>();
    for (const theme of this.index.themes) {
      if (!isThemeRecord(theme) || ids.has(theme.libraryId))
        throw new Error("STORE_TAMPERED:index-record");
      ids.add(theme.libraryId);
    }
    if (
      this.index.selectedLibraryId &&
      !this.index.themes.some(
        (theme) => theme.libraryId === this.index.selectedLibraryId,
      )
    )
      throw new Error("STORE_TAMPERED:index-selection");
    if (
      this.index.lastKnownGoodLibraryId &&
      !this.index.themes.some(
        (theme) => theme.libraryId === this.index.lastKnownGoodLibraryId,
      )
    )
      throw new Error("STORE_TAMPERED:index-last-known-good");
    const checkpointIds = new Set<string>();
    const checkpointFiles = new Set<string>();
    const activeFiles = new Set<string>();
    const managedImageIds = new Set<string>();
    for (const theme of this.index.themes) {
      if (!theme.backgroundFile) continue;
      const imageId = managedImageId(theme.backgroundFile);
      if (
        activeFiles.has(theme.backgroundFile) ||
        managedImageIds.has(imageId) ||
        (ids.has(imageId) && imageId !== theme.libraryId)
      )
        throw new Error("STORE_TAMPERED:index-background");
      activeFiles.add(theme.backgroundFile);
      managedImageIds.add(imageId);
    }
    for (const checkpoint of this.index.checkpoints) {
      if (
        !isThemeCheckpoint(checkpoint) ||
        checkpointIds.has(checkpoint.libraryId) ||
        !ids.has(checkpoint.libraryId)
      )
        throw new Error("STORE_TAMPERED:index-checkpoint");
      const checkpointImageId = checkpoint.backgroundFile
        ? managedImageId(checkpoint.backgroundFile)
        : undefined;
      if (
        checkpoint.backgroundFile !== undefined &&
        (checkpointFiles.has(checkpoint.backgroundFile) ||
          activeFiles.has(checkpoint.backgroundFile) ||
          managedImageIds.has(checkpointImageId!) ||
          ids.has(checkpointImageId!))
      )
        throw new Error("STORE_TAMPERED:index-checkpoint");
      checkpointIds.add(checkpoint.libraryId);
      if (checkpoint.backgroundFile) {
        checkpointFiles.add(checkpoint.backgroundFile);
        managedImageIds.add(checkpointImageId!);
      }
    }
  }

  private async installBundledPresetPacks(): Promise<void> {
    for (const source of this.bundledPresetSources) {
      if (this.index.installedPresetPacks.includes(source.packId)) continue;
      if (!PRESET_PACK_ID_PATTERN.test(source.packId))
        throw new Error("BUNDLED_PRESET_PACK_INVALID:pack-id");
      const pack = await source.load();
      if (pack.packId !== source.packId)
        throw new Error("BUNDLED_PRESET_PACK_INVALID:pack-id");
      await this.installBundledPresetPack(pack);
    }
  }

  private async installBundledPresetPack(
    pack: PreparedBundledPresetPack,
  ): Promise<void> {
    if (this.index.installedPresetPacks.includes(pack.packId)) return;
    if (this.index.installedPresetPacks.length >= MAX_INSTALLED_PRESET_PACKS)
      throw new Error("BUNDLED_PRESET_PACK_INVALID:pack-limit");

    const before = this.captureState();
    const stagedFiles: string[] = [];
    let persistAttempted = false;
    try {
      for (const preset of pack.themes) {
        const record = this.createBundledPresetRecord(preset);
        const duplicate = this.index.themes.find(
          (theme) =>
            theme.status === "ready" &&
            theme.fingerprint === record.fingerprint &&
            this.fingerprint(theme) === record.fingerprint,
        );
        if (duplicate) continue;
        if (this.index.themes.some((theme) => theme.themeId === preset.themeId))
          throw new Error("BUNDLED_PRESET_PACK_INVALID:theme-id-conflict");
        if (!isThemeRecord(record))
          throw new Error("BUNDLED_PRESET_PACK_INVALID:theme-record");

        const file = managedThemeFile(record.backgroundFile!);
        if (this.managedStore.readFile(file) !== undefined)
          throw new Error("STORE_TAMPERED:preset-file-conflict");
        stagedFiles.push(record.backgroundFile!);
        this.managedStore.writeFileAtomic(file, preset.imageBytes);
        const written = this.managedStore.readFile(file);
        if (!written || !written.equals(preset.imageBytes))
          throw new Error("STORE_TAMPERED:preset-file-write");
        this.backgrounds.set(record.libraryId, Buffer.from(written));
        this.index.themes.push(record);
      }

      this.index.installedPresetPacks.push(pack.packId);
      persistAttempted = true;
      await this.persist();
    } catch (error) {
      this.restoreState(before);
      try {
        if (persistAttempted) await this.restorePersistedIndex(before.index);
        for (const fileName of stagedFiles)
          this.removeManagedFileIfPresent(managedThemeFile(fileName));
      } catch (rollbackError) {
        throw new Error("STORE_TAMPERED:preset-pack-rollback", {
          cause: rollbackError,
        });
      }
      throw error;
    }
  }

  private createBundledPresetRecord(
    preset: PreparedBundledPresetTheme,
  ): ThemeRecord {
    const libraryId = this.allocateLibraryId();
    const backgroundFile = this.allocateManagedImageFile(
      preset.imageInfo.extension,
    );
    const configuration: ThemeConfiguration = {
      appearance: preset.appearance,
      art: { ...preset.art },
      colors: { ...preset.colors },
      styleConfig: {
        ...preset.style,
        recipes: { ...preset.style.recipes },
      },
    };
    const css = generateConfiguredCss(configuration.styleConfig);
    const validation = validateSafeCss(css);
    if (!validation.valid || validation.empty)
      throw new Error("BUNDLED_PRESET_PACK_INVALID:css");
    const now = new Date().toISOString();
    const record: ThemeRecord = {
      libraryId,
      themeId: preset.themeId,
      name: preset.name,
      description: preset.description,
      css,
      backgroundScope: preset.backgroundScope,
      sidebarOverlayOpacity: preset.sidebarOverlayOpacity,
      backgroundFile,
      backgroundMime: preset.imageInfo.mime,
      backgroundSha256: preset.imageInfo.sha256,
      backgroundBytes: preset.imageInfo.bytes,
      json: writeThemeConfiguration(
        {
          schemaVersion: 1,
          id: preset.themeId,
          name: preset.name,
          description: preset.description,
          image: backgroundFile,
          backgroundScope: preset.backgroundScope,
          sidebarOverlayOpacity: preset.sidebarOverlayOpacity,
        },
        configuration,
      ),
      status: "ready",
      revision: 1,
      updatedAt: now,
      fingerprint: "",
      packageFormat: "simplified",
      signed: false,
      validation: {
        css: "valid",
        image: "valid",
        package: "ready",
        warnings: [],
      },
    };
    record.fingerprint = this.fingerprint(record);
    return record;
  }

  private async createBuiltIns(): Promise<void> {
    const draft = await this.createDraft("Midnight Copper");
    const theme = this.get(draft.libraryId)!;
    theme.css = DEFAULT_CSS;
    theme.validation.css = "valid";
    theme.validation.warnings = [];
    theme.json = writeThemeConfiguration(theme.json, {
      ...readThemeConfiguration(theme.json),
      appearance: "dark",
      colors: {
        ...readThemeConfiguration(theme.json).colors,
        background: "#111827",
        panel: "#0f172a",
        panelAlt: "#1f2937",
        assistantMessageText: "#f8fafc",
        changeCardBackground: "rgba(31, 41, 55, 0.9)",
        changeCardText: "#f8fafc",
        accent: "#f59e0b",
        text: "#f8fafc",
        muted: "#94a3b8",
        line: "#334155",
      },
      styleConfig: {
        ...DEFAULT_ADVANCED_STYLE,
        recipes: { ...DEFAULT_ADVANCED_STYLE.recipes },
      },
    });
    theme.revision += 1;
    theme.status = "draft";
    await this.persist();
    await this.finishBuiltIn(theme.libraryId, "#111827", "#f59e0b");
    const light = await this.createDraft("Paper Light");
    const lightTheme = this.get(light.libraryId)!;
    lightTheme.css = `[data-ds-part="root"] { background-color: #f8fafc; color: #1f2937; }\n[data-ds-part="sidebar"] { background-color: #e2e8f0; border-color: #cbd5e1; }\n[data-ds-part="composer"]:hover { background-color: #cbd5e1; }`;
    lightTheme.json = writeThemeConfiguration(lightTheme.json, {
      ...readThemeConfiguration(lightTheme.json),
      appearance: "light",
      colors: {
        ...readThemeConfiguration(lightTheme.json).colors,
        background: "#f8fafc",
        panel: "#e2e8f0",
        panelAlt: "#f1f5f9",
        assistantMessageText: "#1f2937",
        changeCardBackground: "rgba(241, 245, 249, 0.92)",
        changeCardText: "#1f2937",
        accent: "#2563eb",
        accentAlt: "#1d4ed8",
        secondary: "#64748b",
        highlight: "#dbeafe",
        text: "#1f2937",
        muted: "#64748b",
        line: "#cbd5e1",
      },
      styleConfig: {
        ...DEFAULT_ADVANCED_STYLE,
        recipes: { ...DEFAULT_ADVANCED_STYLE.recipes },
      },
    });
    lightTheme.validation.css = "valid";
    lightTheme.validation.warnings = [];
    lightTheme.revision += 1;
    await this.persist();
    await this.finishBuiltIn(lightTheme.libraryId, "#f8fafc", "#2563eb");
  }

  private async finishBuiltIn(
    libraryId: string,
    background: string,
    accent: string,
  ): Promise<void> {
    const theme = this.get(libraryId)!;
    const buffer = await sharp({
      create: { width: 960, height: 540, channels: 4, background },
    })
      .png()
      .toBuffer();
    const info = await validateImage(buffer, "background.png");
    const withImage = await this.setBackground(
      libraryId,
      theme.revision,
      "background.png",
      buffer,
      info.mime,
      info.sha256,
    );
    const configuration = readThemeConfiguration(withImage.json);
    configuration.colors.accent = accent;
    withImage.json = writeThemeConfiguration(withImage.json, configuration);
    await this.persist();
    await this.commit(libraryId, withImage.revision);
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(this.index, null, 2);
    const payloadBuffer = Buffer.from(payload, "utf8");
    const release = await this.acquireLock();
    try {
      const previous = this.managedStore.readFile(MANAGED_FILES.index);
      if (previous)
        this.managedStore.writeFileAtomic(MANAGED_FILES.backup, previous);
      else this.managedStore.removeFile(MANAGED_FILES.backup);
      const journal: StoreJournal = {
        version: 1,
        beforeSha256: previous ? sha256(previous) : undefined,
        afterSha256: sha256(payloadBuffer),
        createdAt: new Date().toISOString(),
      };
      this.managedStore.writeFileAtomic(
        MANAGED_FILES.journal,
        Buffer.from(JSON.stringify(journal), "utf8"),
      );
      this.managedStore.writeFileAtomic(MANAGED_FILES.index, payloadBuffer);
      const written = this.managedStore.readFile(MANAGED_FILES.index);
      if (!written) throw new Error("STORE_TAMPERED:index-write");
      if (sha256(written) !== journal.afterSha256)
        throw new Error("STORE_TAMPERED:index-write");
      // A stale journal is recoverable because the committed hash was read
      // back successfully. Never report this as a failed mutation.
      try {
        this.managedStore.removeFile(MANAGED_FILES.journal);
        this.managedStore.removeFile(MANAGED_FILES.backup);
      } catch {
        // A stale journal is safe after the committed index hash was read back.
      }
    } finally {
      await release();
    }
  }

  private async recoverJournal(): Promise<void> {
    const journalBytes = this.managedStore.readFile(MANAGED_FILES.journal);
    if (!journalBytes) return;
    let journal: StoreJournal;
    try {
      journal = JSON.parse(journalBytes.toString("utf8")) as StoreJournal;
    } catch {
      throw new Error("STORE_TAMPERED:journal-json");
    }
    if (
      journal.version !== 1 ||
      !/^[a-f0-9]{64}$/u.test(journal.afterSha256) ||
      (journal.beforeSha256 !== undefined &&
        !/^[a-f0-9]{64}$/u.test(journal.beforeSha256))
    )
      throw new Error("STORE_TAMPERED:journal-schema");
    const current = this.managedStore.readFile(MANAGED_FILES.index);
    if (current && sha256(current) === journal.afterSha256) {
      this.managedStore.removeFile(MANAGED_FILES.journal);
      this.managedStore.removeFile(MANAGED_FILES.backup);
      return;
    }
    const backup = this.managedStore.readFile(MANAGED_FILES.backup);
    if (
      backup &&
      journal.beforeSha256 &&
      sha256(backup) === journal.beforeSha256
    ) {
      this.managedStore.writeFileAtomic(MANAGED_FILES.index, backup);
      this.managedStore.removeFile(MANAGED_FILES.journal);
      this.managedStore.removeFile(MANAGED_FILES.backup);
      return;
    }
    if (!current && !backup && !journal.beforeSha256) {
      this.managedStore.removeFile(MANAGED_FILES.journal);
      return;
    }
    throw new Error("STORE_TAMPERED:journal-recovery");
  }

  private async acquireLock(): Promise<() => Promise<void>> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (
        this.managedStore.createFileExclusive(
          MANAGED_FILES.lock,
          Buffer.from(
            JSON.stringify({
              pid: process.pid,
              createdAt: new Date().toISOString(),
            }),
            "utf8",
          ),
        )
      ) {
        return async () => {
          this.managedStore.removeFile(MANAGED_FILES.lock);
        };
      }
      if (await this.reclaimStaleLock()) continue;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("OPERATION_BUSY");
  }

  private async ensureLayout(): Promise<void> {
    this.managedStore.ensureLayout();
  }

  private async reclaimStaleLock(): Promise<boolean> {
    try {
      const bytes = this.managedStore.readFile(MANAGED_FILES.lock);
      if (!bytes) return false;
      const value = JSON.parse(bytes.toString("utf8")) as {
        pid?: unknown;
      };
      if (!Number.isInteger(value.pid) || Number(value.pid) < 1) return false;
      try {
        process.kill(Number(value.pid), 0);
        return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
        this.managedStore.removeFile(MANAGED_FILES.lock);
        return true;
      }
    } catch {
      return false;
    }
  }
}

export function diskTheme(record: ThemeRecord): DiskTheme {
  return { record };
}

async function createTransparentBackground(
  libraryId: string,
): Promise<PreparedBackground> {
  const fileName = `${libraryId}.png`;
  const data = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const verified = await validateImage(data, fileName);
  return {
    fileName,
    data,
    mime: verified.mime,
    sha256: verified.sha256,
    bytes: verified.bytes,
  };
}

function isLegacyBackgroundlessDraft(theme: ThemeRecord): boolean {
  return (
    theme.status === "draft" &&
    theme.packageFormat === "simplified" &&
    theme.importedFormal === undefined &&
    theme.fingerprint === "" &&
    theme.validation.image === "missing" &&
    theme.validation.package === "draft" &&
    theme.backgroundFile === undefined &&
    theme.backgroundMime === undefined &&
    theme.backgroundSha256 === undefined &&
    theme.backgroundBytes === undefined &&
    theme.json.image === "background.png"
  );
}

function indexPayloadMatches(data: Buffer, index: ThemeIndex): boolean {
  try {
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(data),
    ) as unknown;
    return JSON.stringify(parsed) === JSON.stringify(index);
  } catch {
    return false;
  }
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function extensionOf(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
}

function cloneThemeRecord(record: ThemeRecord): ThemeRecord {
  return JSON.parse(JSON.stringify(record)) as ThemeRecord;
}

function isThemeCheckpoint(value: unknown): value is ThemeCheckpoint {
  if (!isRecord(value)) return false;
  const checkpoint = value as Partial<ThemeCheckpoint>;
  return (
    typeof checkpoint.libraryId === "string" &&
    isUuid(checkpoint.libraryId) &&
    isThemeRecord(checkpoint.record) &&
    checkpoint.record.libraryId === checkpoint.libraryId &&
    (checkpoint.backgroundFile === undefined ||
      (typeof checkpoint.backgroundFile === "string" &&
        isManagedBackgroundFileName(checkpoint.backgroundFile))) &&
    typeof checkpoint.wasLastKnownGood === "boolean" &&
    typeof checkpoint.createdAt === "string" &&
    Number.isFinite(Date.parse(checkpoint.createdAt))
  );
}

function isManagedBackgroundFileName(fileName: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/iu.test(
    fileName,
  );
}

function managedImageId(fileName: string): string {
  return fileName.slice(0, 36).toLowerCase();
}

function isThemeRecord(value: unknown): value is ThemeRecord {
  if (!isRecord(value)) return false;
  const theme = value as Partial<ThemeRecord>;
  const revision = theme.revision;
  const backgroundBytes = theme.backgroundBytes;
  if (
    typeof theme.libraryId !== "string" ||
    !isUuid(theme.libraryId) ||
    typeof theme.themeId !== "string" ||
    !theme.themeId ||
    theme.themeId.length > 80 ||
    typeof theme.name !== "string" ||
    !theme.name ||
    theme.name.length > 80 ||
    typeof theme.description !== "string" ||
    theme.description.length > 2000 ||
    typeof theme.css !== "string" ||
    Buffer.byteLength(theme.css, "utf8") > MAX_CSS_BYTES ||
    (theme.backgroundScope !== "content" &&
      theme.backgroundScope !== "window") ||
    typeof theme.sidebarOverlayOpacity !== "number" ||
    !Number.isSafeInteger(theme.sidebarOverlayOpacity) ||
    theme.sidebarOverlayOpacity < 0 ||
    theme.sidebarOverlayOpacity > 100 ||
    !isRecord(theme.json) ||
    (theme.status !== "draft" && theme.status !== "ready") ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof theme.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(theme.updatedAt)) ||
    typeof theme.fingerprint !== "string" ||
    (theme.status === "ready" && !/^[a-f0-9]{64}$/u.test(theme.fingerprint)) ||
    (theme.packageFormat !== "simplified" &&
      theme.packageFormat !== "formal") ||
    typeof theme.signed !== "boolean" ||
    !isValidationSummary(theme.validation)
  )
    return false;
  const configuration = readThemeConfiguration(theme.json);
  if (
    configuration.styleConfig.mode === "configured" &&
    theme.css !== generateConfiguredCss(configuration.styleConfig)
  )
    return false;
  if (
    (theme.json.appearance !== undefined &&
      !isThemeAppearance(theme.json.appearance)) ||
    (theme.json.art !== undefined && !isCompleteThemeArt(theme.json.art)) ||
    (theme.json.colors !== undefined &&
      !isCompatibleThemeColors(theme.json.colors)) ||
    (theme.json.style !== undefined &&
      !isCompleteThemeStyleConfig(theme.json.style))
  )
    return false;
  if (
    (theme.json.backgroundScope !== undefined &&
      theme.json.backgroundScope !== theme.backgroundScope) ||
    (theme.json.backgroundScope === undefined &&
      theme.backgroundScope !== DEFAULT_BACKGROUND_SCOPE) ||
    (theme.json.sidebarOverlayOpacity !== undefined &&
      theme.json.sidebarOverlayOpacity !== theme.sidebarOverlayOpacity) ||
    (theme.json.sidebarOverlayOpacity === undefined &&
      theme.sidebarOverlayOpacity !== DEFAULT_SIDEBAR_OVERLAY_OPACITY)
  )
    return false;
  const hasBackground = theme.backgroundFile !== undefined;
  if (
    hasBackground !== (theme.backgroundMime !== undefined) ||
    hasBackground !== (theme.backgroundSha256 !== undefined) ||
    hasBackground !== (theme.backgroundBytes !== undefined)
  )
    return false;
  if (
    hasBackground &&
    (typeof theme.backgroundFile !== "string" ||
      !isManagedBackgroundFileName(theme.backgroundFile) ||
      !["image/png", "image/jpeg", "image/webp"].includes(
        theme.backgroundMime as string,
      ) ||
      typeof theme.backgroundSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(theme.backgroundSha256) ||
      typeof backgroundBytes !== "number" ||
      !Number.isSafeInteger(backgroundBytes) ||
      backgroundBytes < 1 ||
      backgroundBytes > 10 * 1024 * 1024)
  )
    return false;
  return !theme.importedFormal || isImportedFormal(theme.importedFormal);
}

function isImportedFormal(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.manifest) &&
    typeof value.signaturePresent === "boolean" &&
    typeof value.edited === "boolean" &&
    (value.originalThemeJson === undefined ||
      isRecord(value.originalThemeJson)) &&
    isBase64(value.originalThemeJsonBase64) &&
    isBase64(value.originalCssBase64) &&
    isBase64(value.originalManifestBase64) &&
    typeof value.originalImageName === "string" &&
    /^background\.(?:jpg|png|webp)$/u.test(value.originalImageName) &&
    (value.licenseBase64 === undefined || isBase64(value.licenseBase64)) &&
    (value.signatureBase64 === undefined || isBase64(value.signatureBase64))
  );
}

function isValidationSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    ["valid", "invalid", "empty"].includes(value.css as string) &&
    ["valid", "missing", "invalid"].includes(value.image as string) &&
    ["ready", "draft", "invalid"].includes(value.package as string) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(
      (warning) => typeof warning === "string" && warning.length <= 256,
    )
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function isBase64(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStoredThemeIndex(value: unknown): value is StoredThemeIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const index = value as Partial<StoredThemeIndex>;
  return (
    (index.version === 1 || index.version === 2) &&
    Array.isArray(index.themes) &&
    typeof index.paused === "boolean" &&
    (index.version === 1
      ? index.checkpoints === undefined || Array.isArray(index.checkpoints)
      : Array.isArray(index.checkpoints)) &&
    (index.selectedLibraryId === undefined ||
      typeof index.selectedLibraryId === "string") &&
    (index.lastKnownGoodLibraryId === undefined ||
      typeof index.lastKnownGoodLibraryId === "string") &&
    (index.installedPresetPacks === undefined ||
      (Array.isArray(index.installedPresetPacks) &&
        index.installedPresetPacks.length <= MAX_INSTALLED_PRESET_PACKS &&
        index.installedPresetPacks.every(
          (packId) =>
            typeof packId === "string" && PRESET_PACK_ID_PATTERN.test(packId),
        ) &&
        new Set(index.installedPresetPacks).size ===
          index.installedPresetPacks.length))
  );
}

function withPresentationDefaults(index: StoredThemeIndex): ThemeIndex {
  const withRecordDefaults = (theme: ThemeRecord): ThemeRecord => {
    const legacy = theme as ThemeRecord & {
      backgroundScope?: BackgroundScope;
      sidebarOverlayOpacity?: number;
    };
    const json = isRecord(legacy.json) ? legacy.json : {};
    return {
      ...legacy,
      backgroundScope:
        legacy.backgroundScope ??
        (json.backgroundScope as BackgroundScope | undefined) ??
        DEFAULT_BACKGROUND_SCOPE,
      sidebarOverlayOpacity:
        legacy.sidebarOverlayOpacity ??
        (json.sidebarOverlayOpacity as number | undefined) ??
        DEFAULT_SIDEBAR_OVERLAY_OPACITY,
    };
  };
  return {
    ...index,
    version: 2,
    installedPresetPacks: [...(index.installedPresetPacks ?? [])],
    themes: index.themes.map(withRecordDefaults),
    checkpoints: (index.checkpoints ?? []).map((checkpoint) => ({
      ...checkpoint,
      record: withRecordDefaults(checkpoint.record),
    })),
  };
}

const EDITABLE_THEME_KEYS = new Set([
  "schemaVersion",
  "id",
  "name",
  "description",
  "image",
  "appearance",
  "art",
  "colors",
  "style",
  "backgroundScope",
  "sidebarOverlayOpacity",
  "accent",
  "brandSubtitle",
  "tagline",
  "projectPrefix",
  "projectLabel",
  "statusText",
  "quote",
  "promoTitle",
  "promoSub",
  "promoUrl",
]);

function applyThemeJsonSource(theme: ThemeRecord, source: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("UNSAFE_ARCHIVE:theme-json-syntax");
  }
  if (!isRecord(parsed)) throw new Error("UNSAFE_ARCHIVE:theme-json-fields");
  if (Object.keys(parsed).some((key) => !EDITABLE_THEME_KEYS.has(key)))
    throw new Error("UNSAFE_ARCHIVE:theme-json-fields");
  if (
    parsed.schemaVersion !== 1 ||
    !boundedString(parsed.id, 1, 80) ||
    !boundedString(parsed.name, 1, 80) ||
    typeof parsed.image !== "string" ||
    parsed.image !== theme.json.image ||
    (parsed.description !== undefined &&
      (typeof parsed.description !== "string" ||
        parsed.description.length > 2000)) ||
    (parsed.backgroundScope !== "content" &&
      parsed.backgroundScope !== "window") ||
    typeof parsed.sidebarOverlayOpacity !== "number" ||
    !Number.isSafeInteger(parsed.sidebarOverlayOpacity) ||
    parsed.sidebarOverlayOpacity < 0 ||
    parsed.sidebarOverlayOpacity > 100 ||
    !isThemeAppearance(parsed.appearance) ||
    !isCompleteThemeArt(parsed.art) ||
    !isCompatibleThemeColors(parsed.colors) ||
    !isCompleteThemeStyleConfig(parsed.style) ||
    (parsed.accent !== undefined && !isThemeColor(parsed.accent))
  )
    throw new Error("UNSAFE_ARCHIVE:theme-json-fields");
  for (const key of [
    "brandSubtitle",
    "tagline",
    "projectPrefix",
    "projectLabel",
    "statusText",
    "quote",
    "promoTitle",
    "promoSub",
  ]) {
    if (parsed[key] !== undefined && !boundedString(parsed[key], 0, 120))
      throw new Error("UNSAFE_ARCHIVE:theme-json-fields");
  }
  if (parsed.promoUrl !== undefined && !boundedString(parsed.promoUrl, 0, 512))
    throw new Error("UNSAFE_ARCHIVE:theme-json-fields");

  const configuration: ThemeConfiguration = {
    appearance: parsed.appearance,
    art: { ...parsed.art },
    colors: readThemeConfiguration(parsed).colors,
    styleConfig: {
      ...parsed.style,
      recipes: { ...parsed.style.recipes },
    },
  };
  theme.themeId = parsed.id.trim();
  theme.name = parsed.name.trim();
  theme.description =
    typeof parsed.description === "string"
      ? parsed.description
      : theme.description;
  theme.backgroundScope = parsed.backgroundScope;
  theme.sidebarOverlayOpacity = parsed.sidebarOverlayOpacity;
  theme.json = writeThemeConfiguration(
    {
      ...parsed,
      id: theme.themeId,
      name: theme.name,
      description: theme.description,
      image: theme.json.image,
      accent: configuration.colors.accent,
      backgroundScope: theme.backgroundScope,
      sidebarOverlayOpacity: theme.sidebarOverlayOpacity,
    },
    configuration,
  );
  if (configuration.styleConfig.mode === "configured")
    theme.css = generateConfiguredCss(configuration.styleConfig);
}

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minimum &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}
