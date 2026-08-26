import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "C:\\Temp") },
  BrowserWindow: class BrowserWindow {},
  dialog: { showMessageBox: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromDataURL: vi.fn() },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  session: { defaultSession: { clearCache: vi.fn() } },
  Tray: class Tray {},
}));

import { AppController, withoutCache } from "../../src/main/app/controller";
import { MainOperationGate } from "../../src/main/app/operation-gate";

describe("AppController", () => {
  it("prevents stable app URLs from serving stale renderer assets", async () => {
    const response = withoutCache(
      new Response("current renderer", {
        headers: { "content-type": "text/javascript", etag: "old" },
      }),
      "GET",
    );

    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("content-type")).toBe("text/javascript");
    await expect(response.text()).resolves.toBe("current renderer");

    const head = withoutCache(new Response("ignored"), "HEAD");
    await expect(head.text()).resolves.toBe("");
  });

  it("restores the paused preference when future-injection resume fails", async () => {
    const controller = Object.create(AppController.prototype) as AppController;
    const themeService = {
      setPaused: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    };
    const session = {
      resume: vi.fn().mockRejectedValue(new Error("resume failed")),
    };
    const snapshot = vi.fn(() => ({
      themes: [],
      paused: false,
      session: {
        state: "NO_SESSION",
        messageKey: "session.ready",
        canEnd: false,
        launchedByTool: false,
      },
      update: {
        configured: true as const,
        status: "idle" as const,
        currentVersion: "1.0.0",
      },
    }));
    Object.assign(controller as object, {
      operationGate: new MainOperationGate(),
      themeService,
      session,
      snapshot,
      broadcast: vi.fn(),
    });

    await expect(controller.resumeSession()).resolves.toEqual({
      ok: false,
      error: { code: "UNKNOWN", messageKey: "error.unknown" },
    });

    expect(themeService.setPaused).toHaveBeenNthCalledWith(1, false);
    expect(themeService.setPaused).toHaveBeenNthCalledWith(2, true);
  });
});
