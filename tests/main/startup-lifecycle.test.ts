import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (...args: unknown[]) => void;
type LoadBehavior = () => Promise<void>;

interface WindowHarness {
  readonly show: ReturnType<typeof vi.fn>;
  readonly focus: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
  emitWindow(event: string, ...args: unknown[]): void;
  emitWebContents(event: string, ...args: unknown[]): void;
}

const state = vi.hoisted(() => ({
  order: [] as string[],
  windows: [] as unknown[],
  loadBehaviors: [] as LoadBehavior[],
  clearCache: vi.fn<() => Promise<void>>(),
  protocolHandle: vi.fn(),
  registerIpc: vi.fn(),
  quit: vi.fn(),
  showErrorBox: vi.fn(),
}));

vi.mock("electron", () => {
  class MockBrowserWindow {
    private destroyed = false;
    private readonly windowListeners = new Map<
      string,
      Array<{ listener: Listener; once: boolean }>
    >();
    private readonly webContentsListeners = new Map<
      string,
      Array<{ listener: Listener; once: boolean }>
    >();

    readonly show = vi.fn();
    readonly focus = vi.fn();
    readonly hide = vi.fn();
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly destroy = vi.fn(() => {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emitWindow("closed");
    });
    readonly loadURL = vi.fn((_url: string) => {
      state.order.push("loadURL");
      return state.loadBehaviors.shift()?.() ?? Promise.resolve();
    });
    readonly webContents = {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      session: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      },
      on: (event: string, listener: Listener) => {
        this.addListener(this.webContentsListeners, event, listener, false);
      },
    };

    constructor(_options: unknown) {
      state.order.push("window");
      state.windows.push(this);
    }

    on(event: string, listener: Listener): void {
      this.addListener(this.windowListeners, event, listener, false);
    }

    once(event: string, listener: Listener): void {
      this.addListener(this.windowListeners, event, listener, true);
    }

    emitWindow(event: string, ...args: unknown[]): void {
      this.emit(this.windowListeners, event, args);
    }

    emitWebContents(event: string, ...args: unknown[]): void {
      this.emit(this.webContentsListeners, event, args);
    }

    private addListener(
      listeners: Map<string, Array<{ listener: Listener; once: boolean }>>,
      event: string,
      listener: Listener,
      once: boolean,
    ): void {
      const existing = listeners.get(event) ?? [];
      existing.push({ listener, once });
      listeners.set(event, existing);
    }

    private emit(
      listeners: Map<string, Array<{ listener: Listener; once: boolean }>>,
      event: string,
      args: unknown[],
    ): void {
      const registered = [...(listeners.get(event) ?? [])];
      listeners.set(
        event,
        registered.filter(({ once }) => !once),
      );
      for (const { listener } of registered) listener(...args);
    }
  }

  class MockTray {
    readonly setToolTip = vi.fn();
    readonly on = vi.fn();
    readonly setContextMenu = vi.fn();
    readonly destroy = vi.fn();

    constructor(_icon: unknown) {
      state.order.push("tray");
    }
  }

  const image = {
    isEmpty: vi.fn(() => false),
    resize: vi.fn(() => image),
  };

  return {
    app: {
      getVersion: vi.fn(() => "1.3.1"),
      getPath: vi.fn(() => "C:\\Temp"),
      getAppPath: vi.fn(() => "E:\\codex_bg\\codexDream"),
      isPackaged: false,
      quit: state.quit,
    },
    BrowserWindow: MockBrowserWindow,
    dialog: {
      showMessageBox: vi.fn(),
      showErrorBox: state.showErrorBox,
    },
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    nativeImage: { createFromPath: vi.fn(() => image) },
    net: { fetch: vi.fn() },
    protocol: {
      handle: (...args: unknown[]) => {
        state.order.push("protocol");
        return state.protocolHandle(...args);
      },
    },
    session: { defaultSession: { clearCache: state.clearCache } },
    Tray: MockTray,
  };
});

vi.mock("../../src/main/infra/local-store", () => ({
  LocalThemeStore: class LocalThemeStore {
    readonly managedStore = { close: vi.fn() };
    readonly init = vi.fn(async () => {
      state.order.push("store:init");
    });
    readonly selectedReadyForInjection = vi.fn();
    readonly getBackground = vi.fn();
    readonly markLastKnownGood = vi.fn();
    readonly snapshot = vi.fn(() => ({
      themes: [],
      paused: false,
      session: sessionSnapshot(),
      update: updateSnapshot(),
    }));
  },
}));

vi.mock("../../src/main/platform/windows", () => ({
  WindowsPlatform: class WindowsPlatform {},
}));

vi.mock("../../src/main/session/session-service", () => ({
  CodexSessionService: class CodexSessionService {
    readonly restoreOrphanedState = vi.fn(async () => {
      state.order.push("session:restore");
    });
    readonly snapshot = vi.fn(() => sessionSnapshot());
  },
}));

vi.mock("../../src/main/app/theme-service", () => ({
  ThemeService: class ThemeService {
    readonly asset = vi.fn();
    readonly assetMime = vi.fn();
  },
}));

vi.mock("../../src/main/infra/electron-updater-gateway", () => ({
  ElectronUpdaterGateway: class ElectronUpdaterGateway {},
}));

vi.mock("../../src/main/ipc/handlers", () => ({
  registerIpc: (...args: unknown[]) => {
    state.order.push("ipc");
    state.registerIpc(...args);
  },
}));

import { AppController } from "../../src/main/app/controller";

describe("CodexStyle startup window lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.order.length = 0;
    state.windows.length = 0;
    state.loadBehaviors.length = 0;
    state.clearCache
      .mockReset()
      .mockImplementation(() => new Promise(() => {}));
    state.protocolHandle.mockReset();
    state.registerIpc.mockReset();
    state.quit.mockReset();
    state.showErrorBox.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("does not wait for clearCache and registers protocol, IPC, and tray before navigation", async () => {
    const controller = createController();

    await expect(controller.init()).resolves.toBeUndefined();

    expect(state.clearCache).not.toHaveBeenCalled();
    expect(
      state.order.filter((entry) =>
        ["protocol", "ipc", "tray", "loadURL"].includes(entry),
      ),
    ).toEqual(["protocol", "ipc", "tray", "loadURL"]);
  });

  it("shows the Studio only after both ready-to-show and rendererReady", async () => {
    const controller = createController();
    await controller.init();
    const window = windowAt(0);

    window.emitWindow("ready-to-show");
    expect(window.show).not.toHaveBeenCalled();

    expect(controller.rendererReady()).toEqual({
      ok: true,
      data: { appVersion: "1.3.1", protocolVersion: 2 },
    });
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it("rebuilds once after loadURL failures and never enters an infinite retry loop", async () => {
    state.loadBehaviors.push(
      () => Promise.reject(new Error("first navigation failed")),
      () => Promise.reject(new Error("second navigation failed")),
    );
    const controller = createController();

    await controller.init();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(state.windows).toHaveLength(2);
    expect(state.showErrorBox).toHaveBeenCalledOnce();
    expect(state.quit).toHaveBeenCalledOnce();
  });

  it("allows only one rebuild even when each renderer becomes ready before crashing", async () => {
    state.loadBehaviors.push(
      () => Promise.resolve(),
      () => Promise.resolve(),
    );
    const controller = createController();

    await controller.init();
    const firstWindow = windowAt(0);
    firstWindow.emitWindow("ready-to-show");
    expect(controller.rendererReady()).toEqual({
      ok: true,
      data: { appVersion: "1.3.1", protocolVersion: 2 },
    });
    firstWindow.emitWebContents(
      "render-process-gone",
      {},
      { reason: "crashed" },
    );

    await vi.advanceTimersByTimeAsync(250);
    const secondWindow = windowAt(1);
    secondWindow.emitWindow("ready-to-show");
    expect(controller.rendererReady()).toEqual({
      ok: true,
      data: { appVersion: "1.3.1", protocolVersion: 2 },
    });
    secondWindow.emitWebContents(
      "render-process-gone",
      {},
      { reason: "crashed" },
    );
    await vi.advanceTimersByTimeAsync(60_000);

    expect(state.windows).toHaveLength(2);
    expect(state.showErrorBox).toHaveBeenCalledOnce();
    expect(state.quit).toHaveBeenCalledOnce();
  });

  it("ignores stale events from the replaced window", async () => {
    state.loadBehaviors.push(
      () => Promise.reject(new Error("replace this window")),
      () => Promise.resolve(),
    );
    const controller = createController();

    await controller.init();
    await flushPromises();
    const oldWindow = windowAt(0);
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    const currentWindow = windowAt(1);

    expect(controller.rendererReady()).toEqual({
      ok: true,
      data: { appVersion: "1.3.1", protocolVersion: 2 },
    });
    expect(currentWindow.show).not.toHaveBeenCalled();

    oldWindow.emitWindow("ready-to-show");
    oldWindow.emitWindow("closed");
    oldWindow.emitWebContents(
      "did-fail-load",
      {},
      -2,
      "stale failure",
      "app://studio/index.html",
      true,
    );
    oldWindow.emitWebContents(
      "preload-error",
      {},
      "old-preload.cjs",
      new Error("stale preload error"),
    );
    oldWindow.emitWebContents("render-process-gone", {}, { reason: "crashed" });

    expect(currentWindow.show).not.toHaveBeenCalled();
    expect(state.windows).toHaveLength(2);

    currentWindow.emitWindow("ready-to-show");
    expect(currentWindow.show).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(state.windows).toHaveLength(2);
    expect(state.showErrorBox).not.toHaveBeenCalled();
    expect(state.quit).not.toHaveBeenCalled();
  });
});

function createController(): AppController {
  return new AppController({
    snapshot: vi.fn(() => updateSnapshot()),
    cancel: vi.fn(),
  } as never);
}

function windowAt(index: number): WindowHarness {
  const window = state.windows[index];
  if (!window) throw new Error(`Missing BrowserWindow at index ${index}`);
  return window as WindowHarness;
}

function sessionSnapshot() {
  return {
    state: "NO_SESSION" as const,
    messageKey: "session.ready",
    canEnd: false,
    launchedByTool: false,
  };
}

function updateSnapshot() {
  return {
    configured: true as const,
    status: "idle" as const,
    currentVersion: "1.3.1",
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
