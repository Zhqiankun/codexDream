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
      "cancelUpdate",
      "chooseBackground",
      "chooseHomeCardImage",
      "chooseSendIcon",
      "clearSelection",
      "commit",
      "createDraft",
      "deleteTheme",
      "discardChanges",
      "endOwnedSession",
      "exportZip",
      "getSnapshot",
      "getStartupSettings",
      "getTheme",
      "getUpdateStatus",
      "importZip",
      "installAssistantPlugin",
      "installUpdate",
      "launchSession",
      "onStateChanged",
      "openLogDirectory",
      "openUpdatePage",
      "patchDraft",
      "pauseSession",
      "rendererReady",
      "requestUpdate",
      "resolveImport",
      "resumeSession",
      "selectForNextLaunch",
      "setStartupSettings",
    ]);
    expect(api).not.toHaveProperty("invoke");
    await api.getStartupSettings();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("startup.getSettings", {
      v: 6,
    });
    await api.setStartupSettings({ enabled: true });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("startup.setSettings", {
      v: 6,
      enabled: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("studio.getSnapshot", {
      v: 6,
    });

    await api.rendererReady();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("studio.rendererReady", {
      v: 1,
    });

    await api.openLogDirectory();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("diagnostics.openLogs", {
      v: 6,
    });

    await api.installAssistantPlugin();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("assistant.installPlugin", {
      v: 6,
    });

    await api.discardChanges({
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 2,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("theme.discardChanges", {
      v: 6,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 2,
    });

    await api.chooseHomeCardImage({
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 2,
      cardIndex: 3,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      "theme.chooseHomeCardImage",
      {
        v: 6,
        libraryId: "11111111-1111-4111-8111-111111111111",
        expectedRevision: 2,
        cardIndex: 3,
      },
    );

    await api.cancelUpdate();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("update.cancel", { v: 6 });
    await api.installUpdate({ mode: "now" });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("update.install", {
      v: 6,
      mode: "now",
    });
  });
});
