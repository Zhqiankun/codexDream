import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppController } from "../../src/main/app/controller";
import { MainOperationGate } from "../../src/main/app/operation-gate";

type RegisteredHandler = (event: unknown, payload: unknown) => Promise<unknown>;

const { appQuit, dialogs, handlers } = vi.hoisted(() => ({
  appQuit: vi.fn(),
  dialogs: vi.fn(),
  handlers: new Map<string, RegisteredHandler>(),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "C:\\Temp"), quit: appQuit },
  BrowserWindow: class BrowserWindow {},
  dialog: { showMessageBox: dialogs },
  ipcMain: {
    handle: (channel: string, handler: RegisteredHandler) => {
      handlers.set(channel, handler);
    },
  },
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromDataURL: vi.fn() },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  session: { defaultSession: { clearCache: vi.fn() } },
  Tray: class Tray {},
}));

import { registerIpc } from "../../src/main/ipc/handlers";

describe("AppController operation gate", () => {
  beforeEach(() => {
    appQuit.mockReset();
    dialogs.mockReset();
    handlers.clear();
  });

  it("shares one gate between IPC and tray launch without a duplicate Store launch", async () => {
    const fixture = controllerFixture();
    let releaseLaunch!: () => void;
    const launchBlocked = new Promise<void>((resolve) => {
      releaseLaunch = resolve;
    });
    fixture.session.launch.mockImplementation(async () => {
      fixture.platform.launchStore();
      await launchBlocked;
      fixture.state.state = "THEMED_SESSION";
    });
    registerIpc(fixture.controller);

    const ipcLaunch = handlers.get("session.launch")!(trustedEvent(), { v: 1 });
    await Promise.resolve();
    const trayLaunch = fixture.controller.launch();
    await Promise.resolve();

    expect(fixture.session.launch).toHaveBeenCalledOnce();
    expect(fixture.platform.launchStore).toHaveBeenCalledOnce();
    expect(fixture.broadcast).not.toHaveBeenCalled();

    releaseLaunch();
    await ipcLaunch;
    await trayLaunch;

    expect(fixture.broadcast).toHaveBeenCalledOnce();
  });

  it("rejects tray pause, IPC end, and tray quit while an IPC launch is active", async () => {
    const fixture = controllerFixture();
    let releaseLaunch!: () => void;
    const launchBlocked = new Promise<void>((resolve) => {
      releaseLaunch = resolve;
    });
    fixture.session.launch.mockImplementation(async () => {
      fixture.platform.launchStore();
      await launchBlocked;
    });
    registerIpc(fixture.controller);

    const launch = handlers.get("session.launch")!(trustedEvent(), { v: 1 });
    await Promise.resolve();
    const pause = fixture.controller.pause();
    const end = handlers.get("session.endOwned")!(trustedEvent(), { v: 1 });
    const quit = fixture.controller.requestQuit();

    await Promise.all([pause, end, quit]);

    expect(fixture.session.launch).toHaveBeenCalledOnce();
    expect(fixture.platform.launchStore).toHaveBeenCalledOnce();
    expect(fixture.session.pause).not.toHaveBeenCalled();
    expect(fixture.session.endOwned).not.toHaveBeenCalled();
    expect(appQuit).not.toHaveBeenCalled();
    expect(fixture.broadcast).not.toHaveBeenCalled();

    releaseLaunch();
    await launch;
  });

  it("broadcasts exactly once when launch fails closed for an external session", async () => {
    const fixture = controllerFixture();
    fixture.session.launch.mockImplementation(async () => {
      fixture.state.state = "EXTERNAL_BLOCKED";
      fixture.state.messageKey = "session.externalRunning";
      throw new Error("EXTERNAL_SESSION_RUNNING");
    });
    registerIpc(fixture.controller);

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
    expect(fixture.broadcast).toHaveBeenCalledOnce();
  });

  it("allows requestQuit to compose owned-session cleanup without opening a second operation", async () => {
    const fixture = controllerFixture({
      canEnd: true,
      state: "THEMED_SESSION",
    });
    dialogs.mockResolvedValue({ response: 1 });
    fixture.session.endOwned.mockImplementation(async () => {
      fixture.state.state = "NO_SESSION";
      fixture.state.canEnd = false;
    });

    await fixture.controller.requestQuit();

    expect(fixture.session.endOwned).toHaveBeenCalledOnce();
    expect(appQuit).toHaveBeenCalledOnce();
    expect(fixture.broadcast).toHaveBeenCalledOnce();
  });
});

function controllerFixture(
  initial: Partial<{ state: string; canEnd: boolean }> = {},
) {
  const state = {
    state: initial.state ?? "NO_SESSION",
    messageKey: "session.ready",
    canEnd: initial.canEnd ?? false,
    launchedByTool: initial.canEnd ?? false,
  };
  const platform = { launchStore: vi.fn() };
  const session = {
    launch: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    endOwned: vi.fn(),
    snapshot: vi.fn(() => state),
  };
  const snapshot = vi.fn(() => ({
    themes: [],
    paused: false,
    session: { ...state },
    update: {
      configured: true as const,
      status: "idle" as const,
      currentVersion: "1.0.0",
    },
  }));
  const broadcast = vi.fn();
  const controller = Object.create(AppController.prototype) as AppController;
  Object.assign(controller as object, {
    operationGate: new MainOperationGate(),
    mainWindow: {
      isDestroyed: () => false,
      webContents: { id: 17, send: vi.fn() },
    },
    platform,
    session,
    store: { setPaused: vi.fn().mockResolvedValue(undefined) },
    themeService: { setPaused: vi.fn().mockResolvedValue({ ok: true }) },
    snapshot,
    broadcast,
    tray: { destroy: vi.fn() },
  });
  return { controller, session, platform, state, broadcast };
}

function trustedEvent() {
  const frame = { url: "app://studio/index.html" };
  return {
    sender: { id: 17, mainFrame: frame },
    senderFrame: frame,
  };
}
