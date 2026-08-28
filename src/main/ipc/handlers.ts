import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import {
  EmptyRequestSchema,
  ExportSchema,
  CreateDraftSchema,
  InstallUpdateSchema,
  LibraryIdSchema,
  PatchDraftSchema,
  PROTOCOL_VERSION,
  RendererReadySchema,
  ResolveImportSchema,
  RevisionSchema,
  type ErrorCode,
  type Result,
  type SafeDetail,
} from "../../contracts";
import type { AppController } from "../app/controller";
import type { MainLogger } from "../infra/main-logger";

export function registerIpc(
  controller: AppController,
  logger?: MainLogger,
): void {
  const handle = <T, TRequest extends Record<string, unknown>>(
    channel: string,
    schema: z.ZodType<TRequest>,
    callback: (data: TRequest) => Promise<Result<T>> | Result<T>,
    options: { bootstrap?: boolean } = {},
  ) => {
    ipcMain.handle(channel, async (event, payload) => {
      if (!authorized(event, controller))
        return error<T>("UNAUTHORIZED_RENDERER", "ipc.unauthorized");
      if (!options.bootstrap && requestVersion(payload) !== PROTOCOL_VERSION) {
        logger?.warn("ipc.request.versionMismatch", { channel });
        return error<T>("IPC_VERSION_MISMATCH", "ipc.versionMismatch");
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const details = safeValidationDetails(parsed.error.issues);
        logger?.warn("ipc.request.invalid", {
          channel,
          issueCodes: details.map((detail) => detail.value).join(","),
          issuePaths: details.map((detail) => detail.key).join(","),
        });
        return error<T>("IPC_INVALID", "ipc.invalid", details);
      }
      try {
        const result = await callback(parsed.data);
        if (!result.ok)
          logger?.warn("ipc.operation.failed", {
            channel,
            errorCode: result.error.code,
          });
        return result;
      } catch (caught) {
        logger?.error("ipc.operation.unhandled", caught, { channel });
        return error<T>("UNKNOWN", "error.unknown");
      }
    });
  };

  handle(
    "studio.rendererReady",
    RendererReadySchema,
    () => controller.rendererReady(),
    { bootstrap: true },
  );
  handle("diagnostics.openLogs", EmptyRequestSchema, () =>
    controller.openLogDirectory(),
  );
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
    "theme.discardChanges",
    RevisionSchema,
    async ({ libraryId, expectedRevision }) =>
      controller.discardThemeChanges(libraryId, expectedRevision),
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

function error<T>(
  code: ErrorCode,
  messageKey: string,
  details?: SafeDetail[],
): Result<T> {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...(details?.length ? { details } : {}),
    },
  };
}

function requestVersion(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return undefined;
  return (payload as Record<string, unknown>).v;
}

function safeValidationDetails(issues: z.core.$ZodIssue[]): SafeDetail[] {
  return issues.slice(0, 8).map((issue) => ({
    key: issue.path.length ? issue.path.join(".") : "request",
    value: issue.code,
  }));
}
