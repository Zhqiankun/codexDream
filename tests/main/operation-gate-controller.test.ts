import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppController } from "../../src/main/app/controller";
import { MainOperationGate } from "../../src/main/app/operation-gate";
import type { ThemeLiveApplyResult, UpdateSnapshot } from "../../src/contracts";

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

    const ipcLaunch = handlers.get("session.launch")!(trustedEvent(), { v: 8 });
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

  it("blocks launch and other side effects during a read-only recheck, then broadcasts its result", async () => {
    const fixture = controllerFixture();
    let release!: () => void;
    fixture.session.recheck.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      fixture.state.state = "NO_SESSION";
      fixture.state.messageKey = "session.preflightReady";
    });
    const recheck = fixture.controller.recheckSession();
    await Promise.resolve();
    expect(await fixture.controller.launchSession()).toMatchObject({
      ok: false,
      error: { code: "OPERATION_BUSY" },
    });
    expect(fixture.session.launch).not.toHaveBeenCalled();
    release();
    expect(await recheck).toMatchObject({
      ok: true,
      data: { session: { messageKey: "session.preflightReady" } },
    });
    expect(fixture.broadcast).toHaveBeenCalledOnce();
    expect(fixture.platform.launchStore).not.toHaveBeenCalled();
  });

  it("broadcasts a failed recheck so the UI receives the current reason", async () => {
    const fixture = controllerFixture();
    fixture.session.recheck.mockImplementation(async () => {
      fixture.state.state = "EXTERNAL_BLOCKED";
      fixture.state.messageKey = "session.externalRunning";
      throw new Error("EXTERNAL_SESSION_RUNNING");
    });
    expect(await fixture.controller.recheckSession()).toMatchObject({
      ok: false,
      error: { code: "EXTERNAL_SESSION_RUNNING" },
    });
    expect(fixture.broadcast).toHaveBeenCalledOnce();
    expect(fixture.session.launch).not.toHaveBeenCalled();
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

    const launch = handlers.get("session.launch")!(trustedEvent(), { v: 8 });
    await Promise.resolve();
    const pause = fixture.controller.pause();
    const end = handlers.get("session.endOwned")!(trustedEvent(), { v: 8 });
    const quit = fixture.controller.requestQuit();
    const install = fixture.controller.installUpdate("now");

    const [, , , installResult] = await Promise.all([
      pause,
      end,
      quit,
      install,
    ]);

    expect(fixture.session.launch).toHaveBeenCalledOnce();
    expect(fixture.platform.launchStore).toHaveBeenCalledOnce();
    expect(fixture.session.pause).not.toHaveBeenCalled();
    expect(fixture.session.endOwned).not.toHaveBeenCalled();
    expect(appQuit).not.toHaveBeenCalled();
    expect(installResult).toEqual({
      ok: false,
      error: { code: "OPERATION_BUSY", messageKey: "ipc.busy" },
    });
    expect(fixture.updateService.installNow).not.toHaveBeenCalled();
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
      v: 8,
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

  it("refuses theme deletion while an owned Codex session is active", async () => {
    const fixture = controllerFixture({
      canEnd: true,
      state: "THEMED_SESSION",
    });

    const result = await fixture.controller.deleteTheme(
      "11111111-1111-4111-8111-111111111111",
      2,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "THEME_IN_USE", messageKey: "theme.inUse" },
    });
    expect(fixture.themeService.delete).not.toHaveBeenCalled();
  });

  it("commits first and reads the saved theme for live application independently of selection", async () => {
    const fixture = controllerFixture();
    const libraryId = "11111111-1111-4111-8111-111111111111";
    const savedTheme = { libraryId, revision: 4, status: "ready" };
    const record = { libraryId, fingerprint: "saved-fingerprint" };
    const image = Buffer.from([0]);
    fixture.themeService.commit.mockResolvedValue({
      ok: true,
      data: savedTheme,
    });
    fixture.store.readyForInjection.mockResolvedValue(record);
    fixture.store.getBackground.mockReturnValue(image);
    fixture.session.applySavedTheme.mockImplementation(
      async (_id: string, loadTheme: () => Promise<unknown>) => {
        expect(await loadTheme()).toEqual({ record, image });
        return { status: "applied" };
      },
    );

    expect(await fixture.controller.commitTheme(libraryId, 3)).toEqual({
      ok: true,
      data: { theme: savedTheme, liveApply: { status: "applied" } },
    });
    expect(fixture.themeService.commit).toHaveBeenCalledWith(libraryId, 3);
    expect(fixture.store.readyForInjection).toHaveBeenCalledWith(libraryId);
    expect(fixture.store.getBackground).toHaveBeenCalledWith(libraryId);
    expect(
      fixture.themeService.commit.mock.invocationCallOrder[0],
    ).toBeLessThan(fixture.session.applySavedTheme.mock.invocationCallOrder[0]);
  });

  it("never applies when the persistent commit fails", async () => {
    const fixture = controllerFixture();
    const failure = {
      ok: false,
      error: { code: "STALE_REVISION", messageKey: "theme.staleRevision" },
    };
    fixture.themeService.commit.mockResolvedValue(failure);
    expect(await fixture.controller.commitTheme("theme-id", 3)).toEqual(
      failure,
    );
    expect(fixture.session.applySavedTheme).not.toHaveBeenCalled();
    expect(fixture.store.readyForInjection).not.toHaveBeenCalled();
  });

  it("passes verified slot images to live application and preserves the committed result if an asset disappears", async () => {
    const fixture = controllerFixture();
    const libraryId = "11111111-1111-4111-8111-111111111111";
    const savedTheme = { libraryId, revision: 4, status: "ready" };
    const record = {
      libraryId,
      reasoningBackgrounds: { ultra: { mime: "image/png" } },
    };
    fixture.themeService.commit.mockResolvedValue({
      ok: true,
      data: savedTheme,
    });
    fixture.store.readyForInjection.mockResolvedValue(record);
    fixture.store.getBackground.mockReturnValue(Buffer.from("normal"));
    fixture.store.getReasoningBackgrounds.mockReturnValue({
      ultra: Buffer.from("ultra"),
    });
    fixture.session.applySavedTheme.mockImplementation(
      async (_id: string, loadTheme: () => Promise<unknown>) => {
        expect(await loadTheme()).toMatchObject({
          reasoningBackgroundDataUrls: {
            ultra: "data:image/png;base64,dWx0cmE=",
          },
        });
        return { status: "applied" };
      },
    );
    expect(await fixture.controller.commitTheme(libraryId, 3)).toMatchObject({
      ok: true,
      data: { liveApply: { status: "applied" } },
    });
    fixture.store.getReasoningBackgrounds.mockReturnValue({});
    expect(await fixture.controller.commitTheme(libraryId, 3)).toMatchObject({
      ok: true,
      data: { theme: savedTheme, liveApply: { status: "failed" } },
    });
  });

  it.each([
    { status: "skipped", reason: "no-session" },
    { status: "skipped", reason: "different-theme" },
    { status: "skipped", reason: "paused" },
    { status: "failed", reason: "verification" },
    { status: "failed", reason: "injection" },
  ] satisfies ThemeLiveApplyResult[])(
    "retains successful persistence when live application returns %j",
    async (liveApply) => {
      const fixture = controllerFixture();
      const savedTheme = { libraryId: "saved-theme", revision: 4 };
      fixture.themeService.commit.mockResolvedValue({
        ok: true,
        data: savedTheme,
      });
      fixture.session.applySavedTheme.mockResolvedValue(liveApply);
      expect(
        await fixture.controller.commitTheme(savedTheme.libraryId, 3),
      ).toEqual({
        ok: true,
        data: { theme: savedTheme, liveApply },
      });
    },
  );

  it("retains successful persistence even when live application unexpectedly rejects", async () => {
    const fixture = controllerFixture();
    const savedTheme = { libraryId: "saved-theme", revision: 4 };
    fixture.themeService.commit.mockResolvedValue({
      ok: true,
      data: savedTheme,
    });
    fixture.session.applySavedTheme.mockRejectedValue(new Error("unexpected"));
    expect(
      await fixture.controller.commitTheme(savedTheme.libraryId, 3),
    ).toEqual({
      ok: true,
      data: {
        theme: savedTheme,
        liveApply: { status: "failed", reason: "injection" },
      },
    });
  });

  it("holds the operation gate until live application settles and broadcasts its final session state", async () => {
    const fixture = controllerFixture({
      canEnd: true,
      state: "THEMED_SESSION",
    });
    fixture.themeService.commit.mockResolvedValue({
      ok: true,
      data: { libraryId: "saved-theme", revision: 4 },
    });
    let finish!: () => void;
    fixture.session.applySavedTheme.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      fixture.state.state = "ORPHANED";
      fixture.state.canEnd = false;
      return { status: "failed", reason: "verification" };
    });
    const commit = fixture.controller.commitTheme("saved-theme", 3);
    await vi.waitFor(() =>
      expect(fixture.session.applySavedTheme).toHaveBeenCalledOnce(),
    );
    for (const result of await Promise.all([
      fixture.controller.pauseSession(),
      fixture.controller.endOwnedSession(),
      fixture.controller.launchSession(),
    ]))
      expect(result).toMatchObject({
        ok: false,
        error: { code: "OPERATION_BUSY" },
      });
    expect(fixture.session.pause).not.toHaveBeenCalled();
    expect(fixture.session.endOwned).not.toHaveBeenCalled();
    expect(fixture.session.launch).not.toHaveBeenCalled();
    finish();
    expect(await commit).toMatchObject({
      ok: true,
      data: { liveApply: { status: "failed" } },
    });
    expect(fixture.broadcast).toHaveBeenCalledOnce();
    expect(fixture.broadcast.mock.calls[0][0].session.state).toBe("ORPHANED");
  });

  it("ends an owned Codex session before starting an immediate update", async () => {
    const fixture = controllerFixture({
      canEnd: true,
      state: "THEMED_SESSION",
      updateStatus: "downloaded",
    });
    dialogs.mockResolvedValue({ response: 1 });
    fixture.session.endOwned.mockImplementation(async () => {
      fixture.state.state = "NO_SESSION";
      fixture.state.canEnd = false;
    });

    const result = await fixture.controller.installUpdate("now");

    expect(result).toMatchObject({ ok: true });
    expect(fixture.session.endOwned).toHaveBeenCalledOnce();
    expect(fixture.updateService.installNow).toHaveBeenCalledOnce();
    expect(appQuit).not.toHaveBeenCalled();
  });

  it("does not install when owned-session cleanup fails", async () => {
    const fixture = controllerFixture({
      canEnd: true,
      state: "THEMED_SESSION",
      updateStatus: "downloaded",
    });
    dialogs.mockResolvedValue({ response: 1 });
    fixture.session.endOwned.mockRejectedValue(new Error("CLEANUP_FAILED"));

    const result = await fixture.controller.installUpdate("now");

    expect(result).toEqual({
      ok: false,
      error: { code: "CLEANUP_FAILED", messageKey: "session.cleanupFailed" },
    });
    expect(fixture.updateService.installNow).not.toHaveBeenCalled();
  });

  it("does not install when the native confirmation is cancelled", async () => {
    const fixture = controllerFixture({ updateStatus: "downloaded" });
    dialogs.mockResolvedValue({ response: 0 });

    const result = await fixture.controller.installUpdate("now");

    expect(result).toEqual({
      ok: false,
      error: { code: "CANCELLED", messageKey: "update.installCancelled" },
    });
    expect(fixture.updateService.installNow).not.toHaveBeenCalled();
  });

  it("allows a confirmed retry when a verified installer previously failed to start", async () => {
    const fixture = controllerFixture({ updateStatus: "error" });
    dialogs.mockResolvedValue({ response: 1 });

    const result = await fixture.controller.installUpdate("now");

    expect(result).toMatchObject({ ok: true });
    expect(fixture.updateService.installNow).toHaveBeenCalledOnce();
  });

  it("uses the normal owned-session cleanup path for install-on-exit", async () => {
    const fixture = controllerFixture({
      canEnd: true,
      state: "THEMED_SESSION",
      updateStatus: "scheduled",
    });
    dialogs.mockResolvedValue({ response: 1 });
    fixture.session.endOwned.mockImplementation(async () => {
      fixture.state.state = "NO_SESSION";
      fixture.state.canEnd = false;
    });

    await fixture.controller.requestQuit();

    expect(fixture.session.endOwned).toHaveBeenCalledOnce();
    expect(fixture.updateService.installNow).toHaveBeenCalledOnce();
    expect(fixture.session.endOwned.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.updateService.installNow.mock.invocationCallOrder[0],
    );
    expect(appQuit).not.toHaveBeenCalled();
  });
});

function controllerFixture(
  initial: Partial<{
    state: string;
    canEnd: boolean;
    updateStatus: "idle" | "downloaded" | "scheduled" | "error";
  }> = {},
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
    recheck: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    endOwned: vi.fn(),
    applySavedTheme: vi.fn(),
    snapshot: vi.fn(() => state),
  };
  const updateState: UpdateSnapshot = {
    configured: true,
    status: initial.updateStatus ?? "idle",
    currentVersion: "1.0.0",
    latestVersion: initial.updateStatus === "idle" ? undefined : "1.1.0",
    installOnQuit: initial.updateStatus === "scheduled" ? true : undefined,
    errorPhase: initial.updateStatus === "error" ? "install" : undefined,
  };
  const snapshot = vi.fn(() => ({
    themes: [],
    paused: false,
    session: { ...state },
    update: { ...updateState },
  }));
  const broadcast = vi.fn();
  const themeService = {
    commit: vi.fn(),
    delete: vi.fn(),
    setPaused: vi.fn().mockResolvedValue({ ok: true }),
  };
  const store = {
    setPaused: vi.fn().mockResolvedValue(undefined),
    readyForInjection: vi.fn(),
    getBackground: vi.fn(),
    getReasoningBackgrounds: vi.fn(),
  };
  const controller = Object.create(AppController.prototype) as AppController;
  const updateService = {
    snapshot: vi.fn(() => ({ ...updateState })),
    shouldInstallOnQuit: vi.fn(() => updateState.status === "scheduled"),
    installNow: vi.fn(() => {
      updateState.status = "idle";
      return { ...updateState, status: "installing" };
    }),
  };
  Object.assign(controller as object, {
    operationGate: new MainOperationGate(),
    mainWindow: {
      isDestroyed: () => false,
      webContents: { id: 17, send: vi.fn() },
    },
    platform,
    session,
    store,
    themeService,
    updateService,
    snapshot,
    broadcast,
    tray: { destroy: vi.fn() },
  });
  return {
    controller,
    session,
    platform,
    state,
    broadcast,
    themeService,
    store,
    updateService,
  };
}

function trustedEvent() {
  const frame = { url: "app://studio/index.html" };
  return {
    sender: { id: 17, mainFrame: frame },
    senderFrame: frame,
  };
}
