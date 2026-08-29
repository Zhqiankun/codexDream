import { beforeEach, describe, expect, it, vi } from "vitest";

type RegisteredHandler = (event: unknown, payload: unknown) => Promise<unknown>;

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, RegisteredHandler>(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: RegisteredHandler) => {
      handlers.set(channel, handler);
    },
  },
}));

import { registerIpc } from "../../src/main/ipc/handlers";

describe("IPC handler command boundary", () => {
  beforeEach(() => handlers.clear());

  it("delegates a fail-closed launch result to AppController without a second broadcast", async () => {
    const controller = controllerFixture();
    controller.launchSession.mockResolvedValue({
      ok: false,
      error: {
        code: "EXTERNAL_SESSION_RUNNING",
        messageKey: "session.externalRunning",
      },
    });
    registerIpc(controller as never);

    const result = await handlers.get("session.launch")!(trustedEvent(), {
      v: 4,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EXTERNAL_SESSION_RUNNING",
        messageKey: "session.externalRunning",
      },
    });
    expect(controller.launchSession).toHaveBeenCalledOnce();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("rejects an untrusted sender before it reaches AppController", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("update.request")!(
      trustedEvent({ senderId: 99 }),
      { v: 4 },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED_RENDERER", messageKey: "ipc.unauthorized" },
    });
    expect(controller.requestUpdate).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("rejects an invalid request before it reaches AppController", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("theme.get")!(trustedEvent(), {
      v: 4,
      libraryId: "not-a-uuid",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "libraryId" }],
      },
    });
    expect(controller.getTheme).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range sidebar overlay before patching", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("theme.patchDraft")!(trustedEvent(), {
      v: 4,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      patch: {
        backgroundScope: "window",
        sidebarOverlayOpacity: 101,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "patch.sidebarOverlayOpacity" }],
      },
    });
    expect(controller.patchDraft).not.toHaveBeenCalled();
  });

  it("rejects the removed legacy-compatible export format", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("theme.exportZip")!(trustedEvent(), {
      v: 4,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      format: "compatibility",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "format" }],
      },
    });
    expect(controller.exportTheme).not.toHaveBeenCalled();
  });

  it("logs only safe validation paths and issue codes", async () => {
    const controller = controllerFixture();
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    registerIpc(controller as never, logger as never);

    await handlers.get("theme.patchDraft")!(trustedEvent(), {
      v: 4,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      patch: {
        colors: { background: "sensitive-invalid-value" },
      },
    });

    expect(logger.warn).toHaveBeenCalledWith("ipc.request.invalid", {
      channel: "theme.patchDraft",
      issueCodes: expect.stringContaining("invalid_type"),
      issuePaths: expect.stringContaining("patch.colors"),
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      "sensitive-invalid-value",
    );
  });

  it("validates and delegates a custom send icon selection", async () => {
    const controller = controllerFixture();
    controller.chooseSendIcon.mockResolvedValue({ ok: true, data: "updated" });
    registerIpc(controller as never);

    const request = {
      v: 4,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 3,
    };
    const result = await handlers.get("theme.chooseSendIcon")!(
      trustedEvent(),
      request,
    );

    expect(result).toEqual({ ok: true, data: "updated" });
    expect(controller.chooseSendIcon).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
    );
  });

  it("validates and delegates an independent home card image selection", async () => {
    const controller = controllerFixture();
    controller.chooseHomeCardImage.mockResolvedValue({
      ok: true,
      data: "updated",
    });
    registerIpc(controller as never);
    const request = {
      v: 4,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 3,
      cardIndex: 2,
    };

    const result = await handlers.get("theme.chooseHomeCardImage")!(
      trustedEvent(),
      request,
    );

    expect(result).toEqual({ ok: true, data: "updated" });
    expect(controller.chooseHomeCardImage).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
      request.cardIndex,
    );
  });

  it("rejects stale protocol requests but accepts the bootstrap handshake", async () => {
    const controller = controllerFixture();
    controller.rendererReady.mockReturnValue({
      ok: true,
      data: { appVersion: "1.3.3", protocolVersion: 4 },
    });
    registerIpc(controller as never);

    const stale = await handlers.get("studio.getSnapshot")!(trustedEvent(), {
      v: 1,
    });
    const bootstrap = await handlers.get("studio.rendererReady")!(
      trustedEvent(),
      { v: 1 },
    );

    expect(stale).toEqual({
      ok: false,
      error: {
        code: "IPC_VERSION_MISMATCH",
        messageKey: "ipc.versionMismatch",
      },
    });
    expect(controller.getStudioSnapshot).not.toHaveBeenCalled();
    expect(bootstrap).toMatchObject({
      ok: true,
      data: { protocolVersion: 4 },
    });
    expect(controller.rendererReady).toHaveBeenCalledOnce();
  });

  it("validates and delegates theme deletion", async () => {
    const controller = controllerFixture();
    controller.deleteTheme.mockResolvedValue({
      ok: true,
      data: { themes: [] },
    });
    registerIpc(controller as never);
    const request = {
      v: 4,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 3,
    };

    const result = await handlers.get("theme.delete")!(trustedEvent(), request);

    expect(controller.deleteTheme).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
    );
    expect(result).toEqual({ ok: true, data: { themes: [] } });
  });

  it("validates and delegates discarding the current theme changes", async () => {
    const controller = controllerFixture();
    controller.discardThemeChanges.mockResolvedValue({
      ok: true,
      data: { revision: 5, status: "ready" },
    });
    registerIpc(controller as never);
    const request = {
      v: 4,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 4,
    };

    const result = await handlers.get("theme.discardChanges")!(
      trustedEvent(),
      request,
    );

    expect(controller.discardThemeChanges).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
    );
    expect(result).toEqual({
      ok: true,
      data: { revision: 5, status: "ready" },
    });
  });

  it("returns the manual update check result from AppController", async () => {
    const controller = controllerFixture();
    controller.requestUpdate.mockResolvedValue({
      ok: true,
      data: {
        configured: true,
        status: "current",
        currentVersion: "1.0.0",
        latestVersion: "1.0.0",
      },
    });
    registerIpc(controller as never);

    const result = await handlers.get("update.request")!(trustedEvent(), {
      v: 4,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        configured: true,
        status: "current",
        currentVersion: "1.0.0",
        latestVersion: "1.0.0",
      },
    });
    expect(controller.requestUpdate).toHaveBeenCalledOnce();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("validates the fixed update installation mode", async () => {
    const controller = controllerFixture();
    controller.installUpdate.mockResolvedValue({
      ok: true,
      data: {
        configured: true,
        status: "installing",
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
      },
    });
    registerIpc(controller as never);

    const valid = await handlers.get("update.install")!(trustedEvent(), {
      v: 4,
      mode: "now",
    });
    const invalid = await handlers.get("update.install")!(trustedEvent(), {
      v: 4,
      mode: "silent-with-path",
      path: "C:\\untrusted.exe",
    });

    expect(controller.installUpdate).toHaveBeenCalledWith("now");
    expect(valid).toMatchObject({ ok: true });
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "mode" }, { key: "request" }],
      },
    });
  });
});

function controllerFixture() {
  return {
    mainWindow: {
      isDestroyed: () => false,
      webContents: { id: 17 },
    },
    broadcast: vi.fn(),
    rendererReady: vi.fn(),
    openLogDirectory: vi.fn(),
    getStudioSnapshot: vi.fn(),
    getTheme: vi.fn(),
    createDraft: vi.fn(),
    patchDraft: vi.fn(),
    discardThemeChanges: vi.fn(),
    chooseBackground: vi.fn(),
    chooseSendIcon: vi.fn(),
    chooseHomeCardImage: vi.fn(),
    commitTheme: vi.fn(),
    deleteTheme: vi.fn(),
    importTheme: vi.fn(),
    resolveThemeImport: vi.fn(),
    exportTheme: vi.fn(),
    selectThemeForNextLaunch: vi.fn(),
    clearThemeSelection: vi.fn(),
    launchSession: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    endOwnedSession: vi.fn(),
    getUpdateStatus: vi.fn(),
    requestUpdate: vi.fn(),
    cancelUpdate: vi.fn(),
    installUpdate: vi.fn(),
    openUpdatePage: vi.fn(),
  };
}

function trustedEvent({ senderId = 17 }: { senderId?: number } = {}) {
  const frame = { url: "app://studio/index.html" };
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame: frame,
  };
}
