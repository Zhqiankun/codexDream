import { describe, expect, it, vi } from "vitest";
import type { UpdateSnapshot } from "../../src/contracts";

const { dialogs } = vi.hoisted(() => ({ dialogs: vi.fn() }));
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "C:\\Temp") },
  BrowserWindow: class BrowserWindow {},
  dialog: { showMessageBox: dialogs },
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromDataURL: vi.fn() },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  session: { defaultSession: { clearCache: vi.fn() } },
  shell: { openPath: vi.fn() },
  Tray: class Tray {},
}));
import { AppController } from "../../src/main/app/controller";

const candidate: UpdateSnapshot = {
  configured: true,
  status: "available",
  currentVersion: "1.0.0",
  latestVersion: "1.2.0",
  releaseNotes: "修复删除反馈并增加右键菜单。",
  releaseDate: "2026-11-02T08:00:00.000Z",
  confirmationId: "11111111-1111-4111-8111-111111111111",
};

describe("update controller", () => {
  it("keeps checking separate from a download carrying the opaque confirmation", async () => {
    const { controller, service, broadcast } = fixture();
    await expect(controller.checkUpdate()).resolves.toEqual({
      ok: true,
      data: candidate,
    });
    expect(service.checkAndDownload).not.toHaveBeenCalled();
    await controller.requestUpdate({
      confirmationId: candidate.confirmationId!,
    });
    expect(service.checkAndDownload).toHaveBeenCalledWith(
      candidate.confirmationId,
    );
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it("shows notes in the tray flow and does not download when confirmation is cancelled", async () => {
    const { service, fromTray } = fixture();
    dialogs.mockResolvedValue({ response: 0 });
    await fromTray();
    expect(dialogs).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "CodexStyle 更新内容",
        detail: candidate.releaseNotes,
        buttons: ["稍后", "下载更新"],
        defaultId: 0,
      }),
    );
    expect(service.checkAndDownload).not.toHaveBeenCalled();
  });

  it("downloads from the tray only after the displayed candidate is confirmed", async () => {
    const { service, fromTray, controller } = fixture();
    dialogs
      .mockResolvedValueOnce({ response: 1 })
      .mockResolvedValue({ response: 0 });
    await fromTray();
    expect(service.checkAndDownload).toHaveBeenCalledWith(
      candidate.confirmationId,
    );
    expect(
      service.checkAndDownload.mock.invocationCallOrder[0],
    ).toBeGreaterThan(dialogs.mock.invocationCallOrder[0]);
    expect(dialogs).toHaveBeenCalledTimes(2);
    expect(controller.installUpdate).not.toHaveBeenCalled();
  });

  it("does not loop into another download if the confirmed tray candidate changed", async () => {
    const { service, fromTray } = fixture();
    service.checkAndDownload.mockResolvedValue({
      ...candidate,
      latestVersion: "1.3.0",
      confirmationId: "22222222-2222-4222-8222-222222222222",
    });
    dialogs.mockResolvedValue({ response: 1 });
    await fromTray();
    expect(service.checkAndDownload).toHaveBeenCalledOnce();
    expect(dialogs).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: "更新候选已变化，请再次检查并查看更新内容后确认下载。",
      }),
    );
  });

  it("provides a notes fallback and keeps check failure separate from downloading", async () => {
    const { service, fromTray, controller } = fixture();
    service.checkForUpdates.mockResolvedValue({
      ...candidate,
      releaseNotes: undefined,
    });
    dialogs.mockResolvedValue({ response: 0 });
    await fromTray();
    expect(dialogs).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining("未提供更新说明"),
      }),
    );
    service.checkForUpdates.mockRejectedValue(new Error("UPDATE_CHECK_FAILED"));
    await expect(controller.checkUpdate()).resolves.toMatchObject({
      ok: false,
      error: { code: "UPDATE_CHECK_FAILED" },
    });
    expect(service.checkAndDownload).not.toHaveBeenCalled();
  });
});

function fixture() {
  dialogs.mockReset();
  const service = {
    snapshot: vi.fn(() => candidate),
    checkForUpdates: vi
      .fn<() => Promise<UpdateSnapshot>>()
      .mockResolvedValue(candidate),
    checkAndDownload: vi
      .fn<(confirmationId: string) => Promise<UpdateSnapshot>>()
      .mockResolvedValue({ ...candidate, status: "downloaded" }),
  };
  const broadcast = vi.fn();
  const controller = Object.create(AppController.prototype) as AppController;
  Object.assign(controller, {
    updateService: service,
    broadcast,
    installUpdate: vi.fn(),
  });
  return {
    controller,
    service,
    broadcast,
    fromTray: () =>
      (
        controller as unknown as {
          checkForUpdatesFromTray(): Promise<void>;
        }
      ).checkForUpdatesFromTray(),
  };
}
