import { beforeEach, describe, expect, it, vi } from "vitest";

type AppListener = (...args: unknown[]) => void;

const state = vi.hoisted(() => ({
  listeners: new Map<string, AppListener>(),
  readyPromise: Promise.resolve(),
  initPromise: Promise.resolve(),
  init: vi.fn<() => Promise<void>>(),
  openStudio: vi.fn<() => Promise<void>>(),
  dispose: vi.fn(),
  quit: vi.fn(),
  showErrorBox: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => state.readyPromise),
    setAppUserModelId: vi.fn(),
    on: vi.fn((event: string, listener: AppListener) => {
      state.listeners.set(event, listener);
    }),
    quit: state.quit,
  },
  dialog: { showErrorBox: state.showErrorBox },
  protocol: { registerSchemesAsPrivileged: vi.fn() },
}));

vi.mock("../../src/main/app/controller", () => ({
  AppController: class AppController {
    init = state.init;
    openStudio = state.openStudio;
    dispose = state.dispose;
  },
}));

describe("main process startup", () => {
  beforeEach(() => {
    vi.resetModules();
    state.listeners.clear();
    state.init.mockReset();
    state.openStudio.mockReset().mockResolvedValue(undefined);
    state.dispose.mockReset();
    state.quit.mockReset();
    state.showErrorBox.mockReset();
  });

  it("queues second-instance opening until initialization has completed", async () => {
    const ready = deferred<void>();
    const initialized = deferred<void>();
    state.readyPromise = ready.promise;
    state.initPromise = initialized.promise;
    state.init.mockImplementation(() => state.initPromise);

    await import("../../src/main/index");

    state.listeners.get("second-instance")?.();
    expect(state.openStudio).not.toHaveBeenCalled();

    ready.resolve();
    await flushPromises();
    expect(state.init).toHaveBeenCalledOnce();

    state.listeners.get("second-instance")?.();
    expect(state.openStudio).not.toHaveBeenCalled();

    initialized.resolve();
    await flushPromises();
    expect(state.openStudio).toHaveBeenCalledOnce();
    expect(state.showErrorBox).not.toHaveBeenCalled();
    expect(state.quit).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
