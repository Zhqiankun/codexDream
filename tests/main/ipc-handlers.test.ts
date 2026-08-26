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
      v: 1,
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
      { v: 1 },
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
      v: 1,
      libraryId: "not-a-uuid",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "IPC_INVALID", messageKey: "ipc.invalid" },
    });
    expect(controller.getTheme).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range sidebar overlay before patching", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("theme.patchDraft")!(trustedEvent(), {
      v: 1,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      patch: {
        backgroundScope: "window",
        sidebarOverlayOpacity: 101,
      },
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "IPC_INVALID", messageKey: "ipc.invalid" },
    });
    expect(controller.patchDraft).not.toHaveBeenCalled();
  });

  it("returns the zero-network update placeholder from AppController", async () => {
    const controller = controllerFixture();
    controller.requestUpdate.mockReturnValue({
      ok: false,
      error: { code: "UPDATE_UNCONFIGURED", messageKey: "update.unconfigured" },
    });
    registerIpc(controller as never);

    const result = await handlers.get("update.request")!(trustedEvent(), {
      v: 1,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "UPDATE_UNCONFIGURED", messageKey: "update.unconfigured" },
    });
    expect(controller.requestUpdate).toHaveBeenCalledOnce();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });
});

function controllerFixture() {
  return {
    mainWindow: {
      isDestroyed: () => false,
      webContents: { id: 17 },
    },
    broadcast: vi.fn(),
    getStudioSnapshot: vi.fn(),
    getTheme: vi.fn(),
    createDraft: vi.fn(),
    patchDraft: vi.fn(),
    chooseBackground: vi.fn(),
    commitTheme: vi.fn(),
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
  };
}

function trustedEvent({ senderId = 17 }: { senderId?: number } = {}) {
  const frame = { url: "app://studio/index.html" };
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame: frame,
  };
}
