import { describe, expect, it, vi } from "vitest";
import type {
  CodexStyleApi,
  Result,
  ThemeSnapshot,
  UpdateSnapshot,
} from "../../src/contracts";

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
      "checkUpdate",
      "chooseBackground",
      "chooseHomeCardImage",
      "chooseSendIcon",
      "clearReasoningBackground",
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
      "recheckSession",
      "rendererReady",
      "requestUpdate",
      "resolveImport",
      "resumeSession",
      "selectForNextLaunch",
      "setStartupSettings",
    ]);
    expect(api).not.toHaveProperty("invoke");
    const slot = {
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 2,
      reasoningEffort: "ultra" as const,
    };
    await api.chooseBackground(slot);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("theme.chooseBackground", {
      v: 9,
      ...slot,
    });
    await api.clearReasoningBackground(slot);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      "theme.clearReasoningBackground",
      { v: 9, ...slot },
    );
    await api.recheckSession();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("session.recheck", {
      v: 9,
    });
    await api.getStartupSettings();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("startup.getSettings", {
      v: 9,
    });
    await api.setStartupSettings({ enabled: true });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("startup.setSettings", {
      v: 9,
      enabled: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("studio.getSnapshot", {
      v: 9,
    });

    await api.rendererReady();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("studio.rendererReady", {
      v: 1,
    });

    await api.openLogDirectory();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("diagnostics.openLogs", {
      v: 9,
    });

    await api.installAssistantPlugin();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("assistant.installPlugin", {
      v: 9,
    });

    await api.discardChanges({
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 2,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("theme.discardChanges", {
      v: 9,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 2,
    });

    const committed = {
      ok: true,
      data: {
        theme: {
          libraryId: "11111111-1111-4111-8111-111111111111",
          revision: 3,
        },
        liveApply: { status: "failed", reason: "verification" },
      },
    };
    ipcRenderer.invoke.mockResolvedValue(committed);
    await expect(
      api.commit({
        libraryId: "11111111-1111-4111-8111-111111111111",
        expectedRevision: 2,
      }),
    ).resolves.toEqual(committed);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("theme.commit", {
      v: 9,
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
        v: 9,
        libraryId: "11111111-1111-4111-8111-111111111111",
        expectedRevision: 2,
        cardIndex: 3,
      },
    );

    const confirmationId = "12345678-1234-4234-8234-123456789abc";
    const available: Result<UpdateSnapshot> = {
      ok: true,
      data: {
        configured: true,
        status: "available",
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
        confirmationId,
        releaseNotes: "更新说明只读。",
        releaseDate: "2026-11-02T00:00:00.000Z",
      },
    };
    ipcRenderer.invoke.mockResolvedValue(available);
    // 检查不携带下载目标；下载只回传主进程签发的确认标识。
    await expect(api.checkUpdate()).resolves.toEqual(available);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith("update.check", {
      v: 9,
    });
    await expect(api.requestUpdate({ confirmationId })).resolves.toEqual(
      available,
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith("update.request", {
      v: 9,
      confirmationId,
    });

    await api.cancelUpdate();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("update.cancel", { v: 9 });
    await api.installUpdate({ mode: "now" });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("update.install", {
      v: 9,
      mode: "now",
    });
  });
});
