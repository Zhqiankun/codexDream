import { describe, expect, it, type Mock, vi } from "vitest";
import type {
  ErrorCode,
  Result,
  ThemeSnapshot,
  UpdateSnapshot,
} from "../../src/contracts";

type RegisteredHandler = (event: unknown, payload: unknown) => Promise<unknown>;
const confirmationId = "12345678-1234-4234-8234-123456789abc";

interface ControllerFixture {
  mainWindow: {
    isDestroyed: () => boolean;
    webContents: { id: number };
  };
  broadcast: Mock<(snapshot: ThemeSnapshot) => void>;
  launchSession: Mock<() => Promise<Result<ThemeSnapshot>>>;
  checkUpdate: Mock<() => Promise<Result<UpdateSnapshot>>>;
  requestUpdate: Mock<
    (request: { confirmationId: string }) => Promise<Result<UpdateSnapshot>>
  >;
  cancelUpdate: Mock<() => Result<UpdateSnapshot>>;
  installUpdate: Mock<
    (mode: "now" | "on-quit") => Promise<Result<UpdateSnapshot>>
  >;
  openUpdatePage: Mock<() => Promise<Result<UpdateSnapshot>>>;
}

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

describe("IPC public boundary", () => {
  it("rejects unknown effort, caller image paths and stale protocol before background dispatch", async () => {
    const controller = controllerFixture();
    registerFixture(controller);
    const request = {
      v: 9,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      reasoningEffort: "ultra",
    };
    for (const channel of [
      "theme.chooseBackground",
      "theme.clearReasoningBackground",
    ]) {
      const handler = handlers.get(channel)!;
      for (const invalid of [
        { ...request, reasoningEffort: "unknown" },
        { ...request, filePath: "C:/private/image.png" },
        { ...request, v: 7 },
      ]) {
        expect(
          await handler(trustedEvent({ senderId: 17 }), invalid),
        ).toMatchObject({ ok: false });
      }
      expect(
        await handler(trustedEvent({ senderId: 77 }), request),
      ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_RENDERER" } });
    }
    expect(controller.broadcast).not.toHaveBeenCalled();
  });
  it("rejects an untrusted sender before dispatching an update request", async () => {
    const controller = controllerFixture();
    registerFixture(controller);
    const handler = handlers.get("update.request")!;

    const result = await handler(trustedEvent({ senderId: 77 }), {
      v: 9,
      confirmationId,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED_RENDERER", messageKey: "ipc.unauthorized" },
    });
    expect(controller.requestUpdate).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("returns a manual update check result to the trusted frame", async () => {
    const controller = controllerFixture();
    registerFixture(controller);
    const handler = handlers.get("update.check")!;

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 9 });

    expect(result).toEqual({
      ok: true,
      data: {
        configured: true,
        status: "current",
        currentVersion: "1.0.0",
        latestVersion: "1.0.0",
      },
    });
    expect(controller.checkUpdate).toHaveBeenCalledExactlyOnceWith();
    expect(controller.requestUpdate).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("requires the server-issued confirmation ID without allowing renderer-chosen update targets", async () => {
    const controller = controllerFixture();
    const available: UpdateSnapshot = {
      configured: true,
      status: "available",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      confirmationId,
      releaseNotes: "显示本次更新内容。",
      releaseDate: "2026-11-02T00:00:00.000Z",
    };
    controller.checkUpdate.mockResolvedValue({ ok: true, data: available });
    controller.requestUpdate.mockResolvedValue({
      ok: true,
      data: { ...available, status: "downloaded" },
    });
    registerFixture(controller);
    const check = handlers.get("update.check")!;
    const download = handlers.get("update.request")!;

    expect(await check(trustedEvent({ senderId: 17 }), { v: 9 })).toEqual({
      ok: true,
      data: available,
    });
    expect(controller.requestUpdate).not.toHaveBeenCalled();
    for (const request of [
      { v: 9 },
      { v: 9, confirmationId: "not-a-uuid" },
      { v: 9, confirmationId, version: "9.9.9" },
      { v: 9, confirmationId, url: "https://example.com/update.exe" },
    ]) {
      expect(
        await download(trustedEvent({ senderId: 17 }), request),
      ).toMatchObject({
        ok: false,
        error: { code: "IPC_INVALID" },
      });
    }
    expect(controller.requestUpdate).not.toHaveBeenCalled();
    expect(
      await download(trustedEvent({ senderId: 17 }), { v: 8, confirmationId }),
    ).toMatchObject({ ok: false, error: { code: "IPC_VERSION_MISMATCH" } });
    expect(
      await download(trustedEvent({ senderId: 17 }), { v: 9, confirmationId }),
    ).toEqual({ ok: true, data: { ...available, status: "downloaded" } });
    expect(controller.requestUpdate).toHaveBeenCalledExactlyOnceWith({
      confirmationId,
    });
  });

  it("rejects an install command from an untrusted frame", async () => {
    const controller = controllerFixture();
    registerFixture(controller);

    const result = await handlers.get("update.install")!(
      trustedEvent({ senderId: 77 }),
      { v: 9, mode: "now" },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED_RENDERER", messageKey: "ipc.unauthorized" },
    });
    expect(controller.installUpdate).not.toHaveBeenCalled();
  });

  it("publishes the changed session state when a launch is fail-closed", async () => {
    const controller = controllerFixture();
    const snapshot = externalBlockedSnapshot();
    controller.launchSession.mockImplementation(async () => {
      controller.broadcast(snapshot);
      return error("EXTERNAL_SESSION_RUNNING", "session.externalRunning");
    });
    registerFixture(controller);
    const handler = handlers.get("session.launch")!;

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 9 });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EXTERNAL_SESSION_RUNNING",
        messageKey: "session.externalRunning",
      },
    });
    expect(controller.launchSession).toHaveBeenCalledOnce();
    expect(controller.broadcast).toHaveBeenCalledOnce();
    expect(controller.broadcast).toHaveBeenCalledWith(snapshot);
  });

  it("does not broadcast when a trusted launch command reports an unknown failure", async () => {
    const controller = controllerFixture();
    controller.launchSession.mockResolvedValue(
      error("UNKNOWN", "error.unknown"),
    );
    registerFixture(controller);
    const handler = handlers.get("session.launch")!;

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 9 });

    expect(result).toEqual(error("UNKNOWN", "error.unknown"));
    expect(controller.launchSession).toHaveBeenCalledOnce();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("does not broadcast when a trusted launch command is busy", async () => {
    const controller = controllerFixture();
    controller.launchSession.mockResolvedValue(
      error("OPERATION_BUSY", "ipc.busy"),
    );
    registerFixture(controller);
    const handler = handlers.get("session.launch")!;

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 9 });

    expect(result).toEqual(error("OPERATION_BUSY", "ipc.busy"));
    expect(controller.launchSession).toHaveBeenCalledOnce();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });
});

function controllerFixture(): ControllerFixture {
  return {
    mainWindow: {
      isDestroyed: () => false,
      webContents: { id: 17 },
    },
    broadcast: vi.fn<(snapshot: ThemeSnapshot) => void>(),
    launchSession: vi.fn<() => Promise<Result<ThemeSnapshot>>>(),
    checkUpdate: vi
      .fn<() => Promise<Result<UpdateSnapshot>>>()
      .mockResolvedValue({
        ok: true,
        data: {
          configured: true,
          status: "current",
          currentVersion: "1.0.0",
          latestVersion: "1.0.0",
        },
      }),
    requestUpdate:
      vi.fn<
        (request: { confirmationId: string }) => Promise<Result<UpdateSnapshot>>
      >(),
    cancelUpdate: vi.fn<() => Result<UpdateSnapshot>>(),
    installUpdate:
      vi.fn<(mode: "now" | "on-quit") => Promise<Result<UpdateSnapshot>>>(),
    openUpdatePage: vi.fn(),
  };
}

function registerFixture(controller: ControllerFixture): void {
  registerIpc(controller as unknown as Parameters<typeof registerIpc>[0]);
}

function trustedEvent({ senderId }: { senderId: number }) {
  const frame = { url: "app://studio/index.html" };
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame: frame,
  };
}

function error<T>(code: ErrorCode, messageKey: string): Result<T> {
  return { ok: false, error: { code, messageKey } };
}

function externalBlockedSnapshot(): ThemeSnapshot {
  return {
    themes: [],
    paused: false,
    session: {
      state: "EXTERNAL_BLOCKED",
      messageKey: "session.externalRunning",
      canEnd: false,
      launchedByTool: false,
    },
    update: {
      configured: true,
      status: "idle",
      currentVersion: "1.0.0",
    },
  };
}
