import { createHash, randomUUID } from "node:crypto";
import { dialog, type BrowserWindow } from "electron";
import sharp from "sharp";
import type {
  ExportResult,
  ImportResult,
  Result,
  ThemeDetail,
  ThemePatch,
  ThemeSnapshot,
} from "../../contracts";
import { isThemeIconDataUrl, readThemeConfiguration } from "../../contracts";
import type { ThemeRecord } from "../domain/theme";
import { LocalThemeStore } from "../infra/local-store";
import { readImageFileBounded, validateImage } from "../infra/image";
import {
  importSummary,
  readThemeZip,
  writeFormalZip,
  writeSimplifiedZip,
} from "../infra/theme-zip";

interface PendingImport {
  record: ThemeRecord;
  image: Buffer;
  signaturePresent: boolean;
  conflictLibraryId: string;
  conflictRevision: number;
}

export class ThemeService {
  private readonly pendingImports = new Map<string, PendingImport>();

  constructor(
    private readonly store: LocalThemeStore,
    private readonly mainWindow: () => BrowserWindow | undefined,
    private readonly snapshotProvider: () => ThemeSnapshot,
  ) {}

  snapshot(): ThemeSnapshot {
    return this.snapshotProvider();
  }

  get(libraryId: string): Result<ThemeDetail> {
    const detail = this.store.getDetail(libraryId, "app://theme-asset");
    return detail
      ? { ok: true, data: detail }
      : this.error("NOT_FOUND", "theme.notFound");
  }

  async createDraft(name?: string): Promise<Result<ThemeDetail>> {
    const record = await this.store.createDraft(name);
    return {
      ok: true,
      data: this.store.getDetail(record.libraryId, "app://theme-asset")!,
    };
  }

  async patch(
    libraryId: string,
    expectedRevision: number,
    patch: ThemePatch,
  ): Promise<Result<ThemeDetail>> {
    try {
      const record = await this.store.patch(libraryId, expectedRevision, patch);
      return {
        ok: true,
        data: this.store.getDetail(record.libraryId, "app://theme-asset")!,
      };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async chooseBackground(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeDetail>> {
    const window = this.mainWindow();
    if (!window) return this.error("UNKNOWN", "window.unavailable");
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (selected.canceled || !selected.filePaths[0])
      return this.error("CANCELLED", "dialog.cancelled");
    try {
      const data = await readImageFileBounded(selected.filePaths[0]);
      const image = await validateImage(data, selected.filePaths[0]);
      const record = await this.store.setBackground(
        libraryId,
        expectedRevision,
        selected.filePaths[0],
        data,
        image.mime,
        image.sha256,
      );
      return {
        ok: true,
        data: this.store.getDetail(record.libraryId, "app://theme-asset")!,
      };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async chooseSendIcon(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeDetail>> {
    const window = this.mainWindow();
    if (!window) return this.error("UNKNOWN", "window.unavailable");
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "透明 PNG 图标", extensions: ["png"] }],
    });
    if (selected.canceled || !selected.filePaths[0])
      return this.error("CANCELLED", "dialog.cancelled");
    try {
      const source = await readImageFileBounded(selected.filePaths[0]);
      await validateImage(source, selected.filePaths[0]);
      const icon = await sharp(source, {
        failOn: "error",
        limitInputPixels: 50_000_000,
        animated: false,
      })
        .ensureAlpha()
        .resize(64, 64, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const dataUrl = "data:image/png;base64," + icon.toString("base64");
      if (!isThemeIconDataUrl(dataUrl))
        throw new Error("UNSAFE_IMAGE:icon-size");
      const current = this.store.get(libraryId);
      if (!current) return this.error("NOT_FOUND", "theme.notFound");
      const configuration = readThemeConfiguration(current.json);
      const record = await this.store.patch(libraryId, expectedRevision, {
        styleConfig: {
          ...configuration.styleConfig,
          sendIcon: "custom",
          sendIconDataUrl: dataUrl,
        },
      });
      return {
        ok: true,
        data: this.store.getDetail(record.libraryId, "app://theme-asset")!,
      };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async commit(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeDetail>> {
    try {
      const record = await this.store.commit(libraryId, expectedRevision);
      return {
        ok: true,
        data: this.store.getDetail(record.libraryId, "app://theme-asset")!,
      };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async importZip(): Promise<Result<ImportResult>> {
    const window = this.mainWindow();
    if (!window) return this.error("UNKNOWN", "window.unavailable");
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Theme ZIP", extensions: ["zip"] }],
    });
    if (selected.canceled || !selected.filePaths[0])
      return this.error("CANCELLED", "dialog.cancelled");
    try {
      const parsed = await readThemeZip(selected.filePaths[0]);
      const existingRecords = this.store.listRecords();
      const nameCollision = existingRecords.some(
        (record) => record.name === parsed.record.name,
      );
      const duplicate = existingRecords.some(
        (record) =>
          record.fingerprint &&
          record.fingerprint === parsed.record.fingerprint,
      );
      if (duplicate)
        return {
          ok: true,
          data: importSummary(parsed, true, nameCollision),
        };
      const idConflict = existingRecords.find(
        (record) => record.themeId === parsed.record.themeId,
      );
      if (idConflict) {
        const transactionId = randomUUID();
        this.pendingImports.set(transactionId, {
          record: parsed.record,
          image: parsed.image,
          signaturePresent: parsed.signaturePresent,
          conflictLibraryId: idConflict.libraryId,
          conflictRevision: idConflict.revision,
        });
        return {
          ok: true,
          data: {
            status: "conflict",
            transactionId,
            name: parsed.record.name,
            conflictLibraryId: idConflict.libraryId,
            conflictRevision: idConflict.revision,
            packageFormat: parsed.record.packageFormat,
            signatureIgnored: parsed.signaturePresent,
            nameCollision,
          },
        };
      }
      await this.store.addImported(parsed.record, parsed.image);
      return {
        ok: true,
        data: importSummary(parsed, false, nameCollision),
      };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async resolveImport(
    transactionId: string,
    action: "keep-both" | "replace" | "cancel",
    replaceLibraryId?: string,
    expectedRevision?: number,
  ): Promise<Result<ImportResult>> {
    const pending = this.pendingImports.get(transactionId);
    if (!pending) return this.error("NOT_FOUND", "import.transactionNotFound");
    if (action === "cancel") {
      this.pendingImports.delete(transactionId);
      return { ok: true, data: { status: "conflict", transactionId } };
    }
    try {
      if (action === "keep-both") {
        pending.record.libraryId = randomUUID();
        pending.record.backgroundFile = `${pending.record.libraryId}.${pending.record.backgroundMime?.split("/")[1] ?? "png"}`;
        pending.record.json = {
          ...pending.record.json,
          image: pending.record.backgroundFile,
        };
        await this.store.addImported(pending.record, pending.image);
      } else {
        if (!replaceLibraryId || expectedRevision === undefined)
          return this.error("IPC_INVALID", "import.replaceArguments");
        if (
          replaceLibraryId !== pending.conflictLibraryId ||
          expectedRevision !== pending.conflictRevision
        )
          return this.error("STALE_REVISION", "theme.staleRevision");
        const target = this.store.get(pending.conflictLibraryId);
        if (
          !target ||
          target.revision !== pending.conflictRevision ||
          target.revision !== expectedRevision
        )
          return this.error("STALE_REVISION", "theme.staleRevision");
        pending.record.libraryId = replaceLibraryId;
        pending.record.backgroundFile = `${replaceLibraryId}.${pending.record.backgroundMime?.split("/")[1] ?? "png"}`;
        pending.record.json = {
          ...pending.record.json,
          image: pending.record.backgroundFile,
        };
        await this.store.replaceRecord(
          replaceLibraryId,
          expectedRevision,
          pending.record,
          pending.image,
        );
      }
      this.pendingImports.delete(transactionId);
      return {
        ok: true,
        data: {
          status: "imported",
          libraryId: pending.record.libraryId,
          name: pending.record.name,
          packageFormat: pending.record.packageFormat,
          signatureIgnored: pending.signaturePresent,
        },
      };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async exportZip(
    libraryId: string,
    expectedRevision: number,
    format: "simplified" | "formal",
  ): Promise<Result<ExportResult>> {
    const window = this.mainWindow();
    const record = this.store.get(libraryId);
    if (!record) return this.error("NOT_FOUND", "theme.notFound");
    if (record.revision !== expectedRevision)
      return this.error("STALE_REVISION", "theme.staleRevision");
    const image = this.store.getBackground(libraryId);
    if (!image) return this.error("INCOMPLETE_THEME", "theme.imageMissing");
    if (!window) return this.error("UNKNOWN", "window.unavailable");
    const selected = await dialog.showSaveDialog(window, {
      defaultPath: `${record.name.replace(/[^a-z0-9 _-]/giu, "_")}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (selected.canceled || !selected.filePath)
      return this.error("CANCELLED", "dialog.cancelled");
    if (
      format === "formal" &&
      !(record.importedFormal && !record.importedFormal.edited)
    )
      return this.error("INCOMPLETE_THEME", "theme.formalExportUnavailable");
    try {
      if (format === "formal")
        await writeFormalZip(selected.filePath, record, image);
      else await writeSimplifiedZip(selected.filePath, record, image);
      return { ok: true, data: { cancelled: false, format } };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async select(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeSnapshot>> {
    try {
      await this.store.select(libraryId, expectedRevision);
      return { ok: true, data: this.snapshot() };
    } catch (error) {
      return this.fromError(error);
    }
  }

  async clearSelection(): Promise<Result<ThemeSnapshot>> {
    await this.store.clearSelection();
    return { ok: true, data: this.snapshot() };
  }

  async setPaused(paused: boolean): Promise<Result<ThemeSnapshot>> {
    await this.store.setPaused(paused);
    return { ok: true, data: this.snapshot() };
  }

  asset(libraryId: string): Buffer | undefined {
    return this.store.getBackground(libraryId);
  }

  assetMime(libraryId: string): string | undefined {
    return this.store.get(libraryId)?.backgroundMime;
  }

  private fromError(error: unknown): Result<never> {
    const raw = error instanceof Error ? error.message : String(error);
    const [code, detail] = raw.split(":", 2);
    const allowed = new Set([
      "IPC_INVALID",
      "STALE_REVISION",
      "NOT_FOUND",
      "INCOMPLETE_THEME",
      "UNSAFE_ARCHIVE",
      "UNSAFE_CSS",
      "UNSAFE_IMAGE",
      "DUPLICATE_CONTENT",
      "CANCELLED",
      "THEME_ID_CONFLICT",
      "STORE_TAMPERED",
    ]);
    const mapped = allowed.has(code)
      ? (code as import("../../contracts").ErrorCode)
      : "UNKNOWN";
    return {
      ok: false,
      error: {
        code: mapped,
        messageKey: `error.${mapped.toLowerCase()}`,
        details: detail ? [{ key: detail }] : undefined,
      },
    };
  }

  private error<T>(
    code: import("../../contracts").ErrorCode,
    messageKey: string,
  ): Result<T> {
    return { ok: false, error: { code, messageKey } };
  }
}
