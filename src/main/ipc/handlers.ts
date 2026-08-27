import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import {
  EmptyRequestSchema,
  ExportSchema,
  CreateDraftSchema,
  InstallUpdateSchema,
  LibraryIdSchema,
  PatchDraftSchema,
  ResolveImportSchema,
  RevisionSchema,
  type ErrorCode,
  type Result,
} from "../../contracts";
import type { AppController } from "../app/controller";

export function registerIpc(controller: AppController): void {
  const handle = <T, TRequest extends Record<string, unknown>>(
    channel: string,
    schema: z.ZodType<TRequest>,
    callback: (data: TRequest) => Promise<Result<T>> | Result<T>,
  ) => {
    ipcMain.handle(channel, async (event, payload) => {
      if (!authorized(event, controller))
        return error<T>("UNAUTHORIZED_RENDERER", "ipc.unauthorized");
      const parsed = schema.safeParse(payload);
      if (!parsed.success) return error<T>("IPC_INVALID", "ipc.invalid");
      try {
        return await callback(parsed.data);
      } catch {
        return error<T>("UNKNOWN", "error.unknown");
      }
    });
  };

  handle("studio.getSnapshot", EmptyRequestSchema, () =>
    controller.getStudioSnapshot(),
  );
  handle("theme.get", LibraryIdSchema, async ({ libraryId }) =>
    controller.getTheme(libraryId),
  );
  handle("theme.createDraft", CreateDraftSchema, async ({ name }) =>
    controller.createDraft(name),
  );
  handle(
    "theme.patchDraft",
    PatchDraftSchema,
    async ({ libraryId, expectedRevision, patch }) =>
      controller.patchDraft(libraryId, expectedRevision, patch),
  );
  handle(
    "theme.chooseBackground",
    RevisionSchema,
    async ({ libraryId, expectedRevision }) =>
      controller.chooseBackground(libraryId, expectedRevision),
  );
  handle(
    "theme.chooseSendIcon",
    RevisionSchema,
    async ({ libraryId, expectedRevision }) =>
      controller.chooseSendIcon(libraryId, expectedRevision),
  );
  handle(
    "theme.commit",
    RevisionSchema,
    async ({ libraryId, expectedRevision }) =>
      controller.commitTheme(libraryId, expectedRevision),
  );
  handle(
    "theme.delete",
    RevisionSchema,
    async ({ libraryId, expectedRevision }) =>
      controller.deleteTheme(libraryId, expectedRevision),
  );
  handle("theme.importZip", EmptyRequestSchema, async () =>
    controller.importTheme(),
  );
  handle("theme.resolveImport", ResolveImportSchema, async (request) =>
    controller.resolveThemeImport(
      request.transactionId,
      request.action,
      request.replaceLibraryId,
      request.expectedRevision,
    ),
  );
  handle(
    "theme.exportZip",
    ExportSchema,
    async ({ libraryId, expectedRevision, format }) =>
      controller.exportTheme(libraryId, expectedRevision, format),
  );
  handle(
    "theme.selectForNextLaunch",
    RevisionSchema,
    async ({ libraryId, expectedRevision }) =>
      controller.selectThemeForNextLaunch(libraryId, expectedRevision),
  );
  handle("theme.clearSelection", EmptyRequestSchema, async () =>
    controller.clearThemeSelection(),
  );
  handle("session.launch", EmptyRequestSchema, () =>
    controller.launchSession(),
  );
  handle("session.pause", EmptyRequestSchema, () => controller.pauseSession());
  handle("session.resume", EmptyRequestSchema, () =>
    controller.resumeSession(),
  );
  handle("session.endOwned", EmptyRequestSchema, () =>
    controller.endOwnedSession(),
  );
  handle("update.getStatus", EmptyRequestSchema, () =>
    controller.getUpdateStatus(),
  );
  handle("update.request", EmptyRequestSchema, () =>
    controller.requestUpdate(),
  );
  handle("update.cancel", EmptyRequestSchema, () => controller.cancelUpdate());
  handle("update.install", InstallUpdateSchema, ({ mode }) =>
    controller.installUpdate(mode),
  );
  handle("update.openRelease", EmptyRequestSchema, () =>
    controller.openUpdatePage(),
  );
}

function authorized(
  event: IpcMainInvokeEvent,
  controller: AppController,
): boolean {
  if (!controller.mainWindow || controller.mainWindow.isDestroyed())
    return false;
  if (controller.mainWindow.webContents.id !== event.sender.id) return false;
  const frame = event.senderFrame;
  return Boolean(
    frame &&
      frame === event.sender.mainFrame &&
      frame.url === "app://studio/index.html",
  );
}

function error<T>(code: ErrorCode, messageKey: string): Result<T> {
  return { ok: false, error: { code, messageKey } };
}
