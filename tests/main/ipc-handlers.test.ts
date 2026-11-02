import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../../src/contracts";

type RegisteredHandler = (event: unknown, payload: unknown) => Promise<unknown>;
const confirmationId = "12345678-1234-4234-8234-123456789abc";

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

  it("allows bounded effort picks and clears while rejecting caller paths and unknown slots", async () => {
    const controller = controllerFixture();
    controller.chooseBackground.mockResolvedValue({ ok: true, data: "picked" });
    controller.clearReasoningBackground.mockResolvedValue({
      ok: true,
      data: "cleared",
    });
    registerIpc(controller as never);
    const request = {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 3,
      reasoningEffort: "ultra",
    };
    const choose = handlers.get("theme.chooseBackground")!;
    const clear = handlers.get("theme.clearReasoningBackground")!;
    expect(await choose(trustedEvent(), request)).toMatchObject({ ok: true });
    expect(controller.chooseBackground).toHaveBeenCalledWith(
      request.libraryId,
      3,
      "ultra",
    );
    expect(await clear(trustedEvent(), request)).toMatchObject({ ok: true });
    expect(controller.clearReasoningBackground).toHaveBeenCalledWith(
      request.libraryId,
      3,
      "ultra",
    );
    for (const invalid of [
      { ...request, reasoningEffort: "future" },
      { ...request, path: "C:/user/private.png" },
      { ...request, imageDataUrl: "data:image/png;base64,AA==" },
    ]) {
      expect(await choose(trustedEvent(), invalid)).toMatchObject({
        ok: false,
        error: { code: "IPC_INVALID" },
      });
      expect(await clear(trustedEvent(), invalid)).toMatchObject({
        ok: false,
        error: { code: "IPC_INVALID" },
      });
    }
    expect(
      await clear(trustedEvent(), { ...request, reasoningEffort: undefined }),
    ).toMatchObject({ ok: false, error: { code: "IPC_INVALID" } });
    expect(await clear(trustedEvent({ senderId: 99 }), request)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_RENDERER" },
    });
    expect(await choose(trustedEvent(), { ...request, v: 7 })).toMatchObject({
      ok: false,
      error: { code: "IPC_VERSION_MISMATCH" },
    });
    expect(controller.chooseBackground).toHaveBeenCalledOnce();
    expect(controller.clearReasoningBackground).toHaveBeenCalledOnce();
  });

  it("accepts only an explicit boolean for startup and rejects paths or untrusted senders", async () => {
    const controller = controllerFixture();
    controller.getStartupSettings.mockReturnValue({
      ok: true,
      data: { supported: true, enabled: false },
    });
    controller.setStartupSettings.mockResolvedValue({
      ok: true,
      data: { supported: true, enabled: true },
    });
    registerIpc(controller as never);
    const read = handlers.get("startup.getSettings")!;
    const write = handlers.get("startup.setSettings")!;
    expect(await read(trustedEvent(), { v: PROTOCOL_VERSION })).toMatchObject({
      ok: true,
      data: { enabled: false },
    });
    expect(
      await write(trustedEvent(), { v: PROTOCOL_VERSION, enabled: true }),
    ).toMatchObject({
      ok: true,
      data: { enabled: true },
    });
    expect(controller.setStartupSettings).toHaveBeenCalledWith(true);
    for (const payload of [
      { v: PROTOCOL_VERSION, enabled: "true" },
      { v: PROTOCOL_VERSION, enabled: true, path: "C:/other.exe" },
      { v: PROTOCOL_VERSION },
    ]) {
      expect(await write(trustedEvent(), payload)).toMatchObject({
        ok: false,
        error: { code: "IPC_INVALID" },
      });
    }
    expect(
      await write(trustedEvent({ senderId: 99 }), {
        v: PROTOCOL_VERSION,
        enabled: true,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_RENDERER" } });
    expect(await write(trustedEvent(), { v: 6, enabled: true })).toMatchObject({
      ok: false,
      error: { code: "IPC_VERSION_MISMATCH" },
    });
    expect(controller.setStartupSettings).toHaveBeenCalledOnce();
  });

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
      v: PROTOCOL_VERSION,
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

  it("allows only an authenticated parameter-free session recheck", async () => {
    const controller = controllerFixture();
    controller.recheckSession.mockResolvedValue({
      ok: true,
      data: {
        session: { state: "NO_SESSION", messageKey: "session.preflightReady" },
      },
    });
    registerIpc(controller as never);
    const handler = handlers.get("session.recheck")!;
    expect(
      await handler(trustedEvent(), { v: PROTOCOL_VERSION }),
    ).toMatchObject({ ok: true });
    expect(
      await handler(trustedEvent({ senderId: 99 }), { v: PROTOCOL_VERSION }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_RENDERER" } });
    expect(await handler(trustedEvent(), { v: 6 })).toMatchObject({
      ok: false,
      error: { code: "IPC_VERSION_MISMATCH" },
    });
    expect(
      await handler(trustedEvent(), { v: PROTOCOL_VERSION, port: 9222 }),
    ).toMatchObject({
      ok: false,
      error: { code: "IPC_INVALID" },
    });
    expect(controller.recheckSession).toHaveBeenCalledOnce();
    expect(controller.launchSession).not.toHaveBeenCalled();
  });

  it("rejects an untrusted sender before it reaches AppController", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("update.request")!(
      trustedEvent({ senderId: 99 }),
      { v: PROTOCOL_VERSION, confirmationId },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED_RENDERER", messageKey: "ipc.unauthorized" },
    });
    expect(controller.requestUpdate).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("delegates explicit assistant plugin installation to AppController", async () => {
    const controller = controllerFixture();
    controller.installAssistantPlugin.mockResolvedValue({
      ok: true,
      data: {
        status: "installed",
        pluginId: "codexstyle-assistant@codexstyle",
        version: "0.1.1",
        requiresCodexRestart: true,
      },
    });
    registerIpc(controller as never);

    const result = await handlers.get("assistant.installPlugin")!(
      trustedEvent(),
      { v: PROTOCOL_VERSION },
    );

    expect(result).toMatchObject({ ok: true, data: { version: "0.1.1" } });
    expect(controller.installAssistantPlugin).toHaveBeenCalledOnce();
  });

  it("rejects an invalid request before it reaches AppController", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("theme.get")!(trustedEvent(), {
      v: PROTOCOL_VERSION,
      libraryId: "not-a-uuid",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "libraryId" }],
      },
    });
    expect(controller.getTheme).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range sidebar overlay before patching", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("theme.patchDraft")!(trustedEvent(), {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      patch: {
        backgroundScope: "window",
        sidebarOverlayOpacity: 101,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "patch.sidebarOverlayOpacity" }],
      },
    });
    expect(controller.patchDraft).not.toHaveBeenCalled();
  });

  it("rejects the removed legacy-compatible export format", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    const result = await handlers.get("theme.exportZip")!(trustedEvent(), {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      format: "compatibility",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "format" }],
      },
    });
    expect(controller.exportTheme).not.toHaveBeenCalled();
  });

  it("logs only safe validation paths and issue codes", async () => {
    const controller = controllerFixture();
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    registerIpc(controller as never, logger as never);

    await handlers.get("theme.patchDraft")!(trustedEvent(), {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      patch: {
        colors: { background: "sensitive-invalid-value" },
      },
    });

    expect(logger.warn).toHaveBeenCalledWith("ipc.request.invalid", {
      channel: "theme.patchDraft",
      issueCodes: expect.stringContaining("invalid_type"),
      issuePaths: expect.stringContaining("patch.colors"),
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      "sensitive-invalid-value",
    );
  });

  it("validates and delegates a custom send icon selection", async () => {
    const controller = controllerFixture();
    controller.chooseSendIcon.mockResolvedValue({ ok: true, data: "updated" });
    registerIpc(controller as never);

    const request = {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 3,
    };
    const result = await handlers.get("theme.chooseSendIcon")!(
      trustedEvent(),
      request,
    );

    expect(result).toEqual({ ok: true, data: "updated" });
    expect(controller.chooseSendIcon).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
    );
  });

  it("validates and delegates an independent home card image selection", async () => {
    const controller = controllerFixture();
    controller.chooseHomeCardImage.mockResolvedValue({
      ok: true,
      data: "updated",
    });
    registerIpc(controller as never);
    const request = {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 3,
      cardIndex: 2,
    };

    const result = await handlers.get("theme.chooseHomeCardImage")!(
      trustedEvent(),
      request,
    );

    expect(result).toEqual({ ok: true, data: "updated" });
    expect(controller.chooseHomeCardImage).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
      request.cardIndex,
    );
  });

  it("rejects the old commit contract and preserves saved/application results for current protocol", async () => {
    const controller = controllerFixture();
    const committed = {
      ok: true,
      data: {
        theme: {
          libraryId: "11111111-1111-4111-8111-111111111111",
          revision: 4,
        },
        liveApply: { status: "failed", reason: "verification" },
      },
    };
    controller.commitTheme.mockResolvedValue(committed);
    registerIpc(controller as never);
    const request = {
      libraryId: committed.data.theme.libraryId,
      expectedRevision: 3,
    };
    expect(
      await handlers.get("theme.commit")!(trustedEvent(), { v: 6, ...request }),
    ).toMatchObject({
      ok: false,
      error: { code: "IPC_VERSION_MISMATCH" },
    });
    expect(controller.commitTheme).not.toHaveBeenCalled();
    expect(
      await handlers.get("theme.commit")!(trustedEvent(), {
        v: PROTOCOL_VERSION,
        ...request,
      }),
    ).toEqual(committed);
    expect(controller.commitTheme).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
    );
  });

  it("rejects stale protocol requests but accepts the bootstrap handshake", async () => {
    const controller = controllerFixture();
    controller.rendererReady.mockReturnValue({
      ok: true,
      data: { appVersion: "1.3.3", protocolVersion: 7 },
    });
    registerIpc(controller as never);

    const stale = await handlers.get("studio.getSnapshot")!(trustedEvent(), {
      v: 1,
    });
    const bootstrap = await handlers.get("studio.rendererReady")!(
      trustedEvent(),
      { v: 1 },
    );

    expect(stale).toEqual({
      ok: false,
      error: {
        code: "IPC_VERSION_MISMATCH",
        messageKey: "ipc.versionMismatch",
      },
    });
    expect(controller.getStudioSnapshot).not.toHaveBeenCalled();
    expect(bootstrap).toMatchObject({
      ok: true,
      data: { protocolVersion: 7 },
    });
    expect(controller.rendererReady).toHaveBeenCalledOnce();
  });

  it("validates and delegates theme deletion", async () => {
    const controller = controllerFixture();
    controller.deleteTheme.mockResolvedValue({
      ok: true,
      data: { themes: [] },
    });
    registerIpc(controller as never);
    const request = {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 3,
    };

    const result = await handlers.get("theme.delete")!(trustedEvent(), request);

    expect(controller.deleteTheme).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
    );
    expect(result).toEqual({ ok: true, data: { themes: [] } });
  });

  it("validates and delegates discarding the current theme changes", async () => {
    const controller = controllerFixture();
    controller.discardThemeChanges.mockResolvedValue({
      ok: true,
      data: { revision: 5, status: "ready" },
    });
    registerIpc(controller as never);
    const request = {
      v: PROTOCOL_VERSION,
      libraryId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 4,
    };

    const result = await handlers.get("theme.discardChanges")!(
      trustedEvent(),
      request,
    );

    expect(controller.discardThemeChanges).toHaveBeenCalledWith(
      request.libraryId,
      request.expectedRevision,
    );
    expect(result).toEqual({
      ok: true,
      data: { revision: 5, status: "ready" },
    });
  });

  it("returns the manual update check result from AppController", async () => {
    const controller = controllerFixture();
    controller.checkUpdate.mockResolvedValue({
      ok: true,
      data: {
        configured: true,
        status: "current",
        currentVersion: "1.0.0",
        latestVersion: "1.0.0",
      },
    });
    registerIpc(controller as never);

    const result = await handlers.get("update.check")!(trustedEvent(), {
      v: PROTOCOL_VERSION,
    });

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

  it("forwards only the opaque confirmation ID for an explicit update download", async () => {
    const controller = controllerFixture();
    const downloading = {
      ok: true,
      data: {
        configured: true,
        status: "downloading",
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
        confirmationId,
        releaseNotes: "修复主题删除提示。",
        releaseDate: "2026-11-02T00:00:00.000Z",
      },
    };
    controller.requestUpdate.mockResolvedValue(downloading);
    registerIpc(controller as never);

    expect(
      await handlers.get("update.request")!(trustedEvent(), {
        v: PROTOCOL_VERSION,
        confirmationId,
      }),
    ).toEqual(downloading);
    expect(controller.requestUpdate).toHaveBeenCalledExactlyOnceWith({
      confirmationId,
    });
    expect(controller.checkUpdate).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed confirmation IDs and renderer-selected update targets", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);
    const request = { v: PROTOCOL_VERSION, confirmationId };

    // 确认标识只能引用主进程候选，renderer 不能选择版本或下载地址。
    for (const payload of [
      { v: PROTOCOL_VERSION },
      { ...request, confirmationId: "not-a-uuid" },
      { ...request, confirmationId: 1 },
      { ...request, version: "9.9.9" },
      { ...request, url: "https://example.com/installer.exe" },
    ]) {
      expect(
        await handlers.get("update.request")!(trustedEvent(), payload),
      ).toMatchObject({ ok: false, error: { code: "IPC_INVALID" } });
    }
    expect(controller.requestUpdate).not.toHaveBeenCalled();
    expect(controller.broadcast).not.toHaveBeenCalled();
  });

  it("keeps update checking parameter-free and rejects stale or untrusted update calls", async () => {
    const controller = controllerFixture();
    registerIpc(controller as never);

    for (const payload of [
      { v: PROTOCOL_VERSION, confirmationId },
      { v: PROTOCOL_VERSION, version: "9.9.9" },
      { v: PROTOCOL_VERSION, url: "https://example.com/updates" },
    ]) {
      expect(
        await handlers.get("update.check")!(trustedEvent(), payload),
      ).toMatchObject({ ok: false, error: { code: "IPC_INVALID" } });
    }
    for (const channel of ["update.check", "update.request"]) {
      const payload = channel === "update.request" ? { confirmationId } : {};
      expect(
        await handlers.get(channel)!(trustedEvent(), { v: 8, ...payload }),
      ).toMatchObject({
        ok: false,
        error: { code: "IPC_VERSION_MISMATCH" },
      });
      expect(
        await handlers.get(channel)!(trustedEvent({ senderId: 99 }), {
          v: PROTOCOL_VERSION,
          ...payload,
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "UNAUTHORIZED_RENDERER" },
      });
    }
    expect(controller.checkUpdate).not.toHaveBeenCalled();
    expect(controller.requestUpdate).not.toHaveBeenCalled();
  });

  it("validates the fixed update installation mode", async () => {
    const controller = controllerFixture();
    controller.installUpdate.mockResolvedValue({
      ok: true,
      data: {
        configured: true,
        status: "installing",
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
      },
    });
    registerIpc(controller as never);

    const valid = await handlers.get("update.install")!(trustedEvent(), {
      v: PROTOCOL_VERSION,
      mode: "now",
    });
    const invalid = await handlers.get("update.install")!(trustedEvent(), {
      v: PROTOCOL_VERSION,
      mode: "silent-with-path",
      path: "C:\\untrusted.exe",
    });

    expect(controller.installUpdate).toHaveBeenCalledWith("now");
    expect(valid).toMatchObject({ ok: true });
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: "IPC_INVALID",
        messageKey: "ipc.invalid",
        details: [{ key: "mode" }, { key: "request" }],
      },
    });
  });
});

function controllerFixture() {
  return {
    mainWindow: {
      isDestroyed: () => false,
      webContents: { id: 17 },
    },
    broadcast: vi.fn(),
    rendererReady: vi.fn(),
    getStartupSettings: vi.fn(),
    setStartupSettings: vi.fn(),
    openLogDirectory: vi.fn(),
    installAssistantPlugin: vi.fn(),
    getStudioSnapshot: vi.fn(),
    getTheme: vi.fn(),
    createDraft: vi.fn(),
    patchDraft: vi.fn(),
    discardThemeChanges: vi.fn(),
    chooseBackground: vi.fn(),
    clearReasoningBackground: vi.fn(),
    chooseSendIcon: vi.fn(),
    chooseHomeCardImage: vi.fn(),
    commitTheme: vi.fn(),
    deleteTheme: vi.fn(),
    importTheme: vi.fn(),
    resolveThemeImport: vi.fn(),
    exportTheme: vi.fn(),
    selectThemeForNextLaunch: vi.fn(),
    clearThemeSelection: vi.fn(),
    recheckSession: vi.fn(),
    launchSession: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    endOwnedSession: vi.fn(),
    getUpdateStatus: vi.fn(),
    checkUpdate: vi.fn(),
    requestUpdate: vi.fn(),
    cancelUpdate: vi.fn(),
    installUpdate: vi.fn(),
    openUpdatePage: vi.fn(),
  };
}

function trustedEvent({ senderId = 17 }: { senderId?: number } = {}) {
  const frame = { url: "app://studio/index.html" };
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame: frame,
  };
}
