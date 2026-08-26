import { describe, expect, it, type Mock, vi } from "vitest";
import type {
  ErrorCode,
  Result,
  ThemeSnapshot,
  UpdateSnapshot,
} from "../../src/contracts";

type RegisteredHandler = (event: unknown, payload: unknown) => Promise<unknown>;

interface ControllerFixture {
  mainWindow: {
    isDestroyed: () => boolean;
    webContents: { id: number };
  };
  broadcast: Mock<(snapshot: ThemeSnapshot) => void>;
  launchSession: Mock<() => Promise<Result<ThemeSnapshot>>>;
  requestUpdate: Mock<() => Promise<Result<UpdateSnapshot>>>;
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
  it("rejects an untrusted sender before dispatching an update request", async () => {
    const controller = controllerFixture();
    registerFixture(controller);
    const handler = handlers.get("update.request")!;

    const result = await handler(trustedEvent({ senderId: 77 }), { v: 1 });

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
    const handler = handlers.get("update.request")!;

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 1 });

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

  it("publishes the changed session state when a launch is fail-closed", async () => {
    const controller = controllerFixture();
    const snapshot = externalBlockedSnapshot();
    controller.launchSession.mockImplementation(async () => {
      controller.broadcast(snapshot);
      return error("EXTERNAL_SESSION_RUNNING", "session.externalRunning");
    });
    registerFixture(controller);
    const handler = handlers.get("session.launch")!;

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 1 });

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

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 1 });

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

    const result = await handler(trustedEvent({ senderId: 17 }), { v: 1 });

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
    requestUpdate: vi
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
