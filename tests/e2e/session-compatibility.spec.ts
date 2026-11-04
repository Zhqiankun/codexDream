import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SessionCompatibility, ThemeSnapshot } from "../../src/contracts";

test("Studio distinguishes partial, full and pending compatibility without a real Codex session", async ({}, testInfo) => {
  test.setTimeout(75_000);
  // The production Studio/preload run against an isolated native store.
  // Session snapshots are fixtures: no official Codex process is launched,
  // attached, injected, paused or ended by this renderer acceptance test.
  const isolatedRoot = await mkdtemp(
    join(tmpdir(), "codexstyle-compatibility-ui-"),
  );
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string",
    ),
  ) as Record<string, string>;
  const application = await electron.launch({
    executablePath: resolve("node_modules/electron/dist/electron.exe"),
    args: [
      resolve("out/main/index.js"),
      `--user-data-dir=${join(isolatedRoot, "electron-user-data")}`,
    ],
    cwd: process.cwd(),
    env: { ...environment, LOCALAPPDATA: isolatedRoot, NODE_ENV: "production" },
  });
  try {
    const page = await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(960, 760);
      window.webContents.session.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => callback({ cancel: true }),
      );
    });
    const launcher = page.getByRole("region", { name: "Codex 会话启动" });
    await expect(launcher).toBeVisible();
    const initial = await page.evaluate(() => window.codexStyle.getSnapshot());
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error("Isolated Studio snapshot unavailable");
    const publish = async (compatibility: SessionCompatibility) => {
      const snapshot: ThemeSnapshot = {
        ...initial.data,
        paused: false,
        session: {
          state: "THEMED_SESSION",
          messageKey: "session.themed",
          canEnd: true,
          launchedByTool: true,
          compatibility,
        },
      };
      await application.evaluate(({ BrowserWindow, ipcMain }, state) => {
        ipcMain.removeHandler("studio.getSnapshot");
        ipcMain.handle("studio.getSnapshot", () => ({ ok: true, data: state }));
        BrowserWindow.getAllWindows()[0].webContents.send(
          "studio:state-changed",
          state,
        );
      }, snapshot);
    };
    const status = launcher.getByRole("status", { name: "主题适配状态" });
    await publish({
      status: "partial",
      unavailable: ["sidebar", "titlebar", "header", "reasoning-background"],
    });
    await expect(status).toContainText("部分适配");
    for (const message of [
      "侧栏样式暂不可用",
      "标题栏样式暂不可用",
      "页头样式暂不可用",
      "档位切换暂不可用，已使用普通背景",
    ])
      await expect(status).toContainText(message);
    await expect(
      launcher.getByLabel("主题与当前版本兼容：部分适配", { exact: true }),
    ).toBeVisible();
    await expect(
      launcher.getByLabel("Store Codex 可启动：通过", { exact: true }),
    ).toBeVisible();
    await expect(
      launcher.getByLabel("会话可安全管理：通过", { exact: true }),
    ).toBeVisible();
    await expect(
      launcher.getByRole("button", { name: "暂停后续注入", exact: true }),
    ).toBeEnabled();
    const width = await launcher.evaluate((el) => ({
      actual: el.scrollWidth,
      available: el.clientWidth,
    }));
    expect(width.actual).toBeLessThanOrEqual(width.available);
    await launcher.screenshot({
      path: testInfo.outputPath("session-partial.png"),
      animations: "disabled",
    });

    await publish({ status: "full", unavailable: [] });
    await expect(status).toHaveCount(0);
    await expect(
      launcher.getByLabel("主题与当前版本兼容：通过", { exact: true }),
    ).toBeVisible();
    await launcher.screenshot({
      path: testInfo.outputPath("session-full.png"),
      animations: "disabled",
    });

    await publish({ status: "checking", unavailable: [] });
    await expect(status).toContainText("等待适配检查");
    await expect(status).toContainText("正在等待当前页面的适配检查结果");
    await expect(
      launcher.getByLabel("主题与当前版本兼容：等待", { exact: true }),
    ).toBeVisible();
    await expect(status).not.toContainText("部分适配");
    await launcher.screenshot({
      path: testInfo.outputPath("session-checking.png"),
      animations: "disabled",
    });
  } finally {
    await application.close();
  }
});
