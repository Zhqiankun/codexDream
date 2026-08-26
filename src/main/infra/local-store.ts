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
import type { ThemeIndex, ThemeRecord } from "../domain/theme";
import {
  createDefaultIndex,
  themeFingerprint,
  toDetail,
  toSummary,
} from "../domain/theme";
import { validateSafeCss } from "./safe-css";
import sharp from "sharp";
import { validateImage } from "./image";
import {
  MANAGED_FILES,
  SecureManagedStore,
  managedThemeFile,
} from "./secure-store";

interface DiskTheme {
  record: ThemeRecord;
  backgroundBase64?: string;
}

interface StoreJournal {
  version: 1;
  beforeSha256?: string;
  afterSha256: string;
  createdAt: string;
}

const DEFAULT_CSS = `[data-ds-part="root"] {\n  background-color: #111827;\n  color: #e5e7eb;\n}\n[data-ds-part="sidebar"] {\n  background-color: #0f172a;\n  border-color: #334155;\n}\n[data-ds-part="composer"]:hover {\n  background-color: #334155;\n}`;
const MAX_CSS_BYTES = 256 * 1024;

export class LocalThemeStore {
  readonly root: string;
  readonly managedStore: SecureManagedStore;
  private index: ThemeIndex = createDefaultIndex();
  private backgrounds = new Map<string, Buffer>();

  constructor(root: string) {
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
        ) as ThemeIndex;
        if (!isThemeIndex(parsed))
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
    if (this.index.themes.length === 0) {
      await this.createBuiltIns();
    }
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
    );
  }

  listRecords(): ThemeRecord[] {
    return this.index.themes;
  }

  getBackground(libraryId: string): Buffer | undefined {
    return this.backgrounds.get(libraryId);
  }

  async createDraft(name = "Untitled theme"): Promise<ThemeRecord> {
    const libraryId = randomUUID();
    const now = new Date().toISOString();
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
          image: "background.png",
          backgroundScope: DEFAULT_BACKGROUND_SCOPE,
          sidebarOverlayOpacity: DEFAULT_SIDEBAR_OVERLAY_OPACITY,
        },
        configuration,
      ),
      status: "draft",
      revision: 1,
      updatedAt: now,
      fingerprint: "",
      packageFormat: "simplified",
      signed: false,
      validation: {
        css: validation.valid && !validation.empty ? "valid" : "invalid",
        image: "missing",
        package: "draft",
        warnings: [],
      },
    };
    return this.mutate(() => {
      this.index.themes.unshift(record);
      return record;
    });
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
    return this.mutate(() => {
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
    const fileNameOnDisk = `${libraryId}.${extension}`;
    const previous = this.captureState();
    const previousImage = this.backgrounds.get(libraryId);
    const previousFile = theme.backgroundFile;
    try {
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
      await this.persist();
      return theme;
    } catch (error) {
      this.restoreState(previous);
      try {
        if (previousImage && previousFile)
          this.managedStore.writeFileAtomic(
            managedThemeFile(previousFile),
            previousImage,
          );
        if (fileNameOnDisk !== previousFile)
          this.managedStore.removeFile(managedThemeFile(fileNameOnDisk));
      } catch {
        // Preserve the original mutation failure after best-effort rollback.
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
    await this.validateThemePayload(theme);
    return this.mutate(() => {
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
    this.index.themes.splice(index, 1);
    this.backgrounds.delete(libraryId);
    try {
      await this.persist();
    } catch (error) {
      this.restoreState(before);
      throw error;
    }

    if (!theme.backgroundFile) return;
    try {
      this.managedStore.removeFile(managedThemeFile(theme.backgroundFile));
    } catch (error) {
      this.restoreState(before);
      try {
        if (image)
          this.managedStore.writeFileAtomic(
            managedThemeFile(theme.backgroundFile),
            image,
          );
        await this.persist();
      } catch {
        throw new Error("STORE_TAMPERED:delete-rollback");
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
    await this.validateImportedRecord(replacement, image);
    const before = this.captureState();
    const previous = this.index.themes[index];
    const previousImage = this.backgrounds.get(libraryId);
    try {
      this.managedStore.writeFileAtomic(
        managedThemeFile(replacement.backgroundFile!),
        image,
      );
      this.backgrounds.set(libraryId, Buffer.from(image));
      this.index.themes[index] = replacement;
      await this.persist();
    } catch (error) {
      this.restoreState(before);
      try {
        if (previousImage && previous.backgroundFile)
          this.managedStore.writeFileAtomic(
            managedThemeFile(previous.backgroundFile),
            previousImage,
          );
      } catch {
        // Preserve the original replacement failure after best-effort rollback.
      }
      throw error;
    }
  }

  async addImported(record: ThemeRecord, image: Buffer): Promise<void> {
    if (this.get(record.libraryId)) throw new Error("THEME_ID_CONFLICT");
    await this.validateImportedRecord(record, image);
    const before = this.captureState();
    try {
      this.managedStore.writeFileAtomic(
        managedThemeFile(record.backgroundFile!),
        image,
      );
      this.backgrounds.set(record.libraryId, Buffer.from(image));
      this.index.themes.unshift(record);
      await this.persist();
    } catch (error) {
      this.restoreState(before);
      try {
        this.managedStore.removeFile(managedThemeFile(record.backgroundFile!));
      } catch {
        // Preserve the original import failure after best-effort rollback.
      }
      throw error;
    }
  }

  private require(libraryId: string): ThemeRecord {
    const theme = this.get(libraryId);
    if (!theme) throw new Error("NOT_FOUND");
    return theme;
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

  private async mutate<T>(operation: () => T | Promise<T>): Promise<T> {
    const before = this.captureState();
    try {
      const result = await operation();
      await this.persist();
      return result;
    } catch (error) {
      this.restoreState(before);
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
      !isManagedBackgroundFile(theme.libraryId, theme.backgroundFile)
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

  private validateIndex(): void {
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

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function isManagedBackgroundFile(libraryId: string, fileName: string): boolean {
  return ["png", "jpg", "webp"].some(
    (extension) => fileName === `${libraryId}.${extension}`,
  );
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
      !isManagedBackgroundFile(theme.libraryId, theme.backgroundFile) ||
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

function isThemeIndex(value: unknown): value is ThemeIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const index = value as Partial<ThemeIndex>;
  return (
    index.version === 1 &&
    Array.isArray(index.themes) &&
    typeof index.paused === "boolean" &&
    (index.selectedLibraryId === undefined ||
      typeof index.selectedLibraryId === "string") &&
    (index.lastKnownGoodLibraryId === undefined ||
      typeof index.lastKnownGoodLibraryId === "string")
  );
}

function withPresentationDefaults(index: ThemeIndex): ThemeIndex {
  return {
    ...index,
    themes: index.themes.map((theme) => {
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
    }),
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
