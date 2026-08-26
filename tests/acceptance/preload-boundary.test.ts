import { describe, expect, it, vi } from "vitest";
import type { CodexStyleApi, Result, ThemeSnapshot } from "../../src/contracts";

const { exposed, ipcRenderer } = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, value: unknown) =>
      exposed.set(name, value),
  },
  ipcRenderer,
}));

import "../../src/preload";

describe("preload public boundary", () => {
  it("exposes only the typed CodexStyle API and versions its invocations", async () => {
    const api = exposed.get("codexStyle") as CodexStyleApi;
    const snapshot: Result<ThemeSnapshot> = {
      ok: true,
      data: {
        themes: [],
        paused: false,
        session: {
          state: "NO_SESSION",
          messageKey: "session.ready",
          canEnd: false,
          launchedByTool: false,
        },
        update: {
          configured: true,
          status: "idle",
          currentVersion: "1.0.0",
        },
      },
    };
    ipcRenderer.invoke.mockResolvedValue(snapshot);

    await expect(api.getSnapshot()).resolves.toEqual(snapshot);

    expect(Object.keys(api).sort()).toEqual([
      "chooseBackground",
      "chooseSendIcon",
      "clearSelection",
      "commit",
      "createDraft",
      "deleteTheme",
      "endOwnedSession",
      "exportZip",
      "getSnapshot",
      "getTheme",
      "getUpdateStatus",
      "importZip",
      "launchSession",
      "onStateChanged",
      "openUpdatePage",
      "patchDraft",
      "pauseSession",
      "requestUpdate",
      "resolveImport",
      "resumeSession",
      "selectForNextLaunch",
    ]);
    expect(api).not.toHaveProperty("invoke");
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("studio.getSnapshot", {
      v: 1,
    });
  });
});
