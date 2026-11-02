import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Studio shows bundled Chinese release history offline with contained scrolling and keyboard focus", async ({}, testInfo) => {
  test.setTimeout(75_000);
  // 使用真实工作台、preload 和主进程，但数据目录隔离；HTTP(S) 全部阻断，不下载安装器。
  const isolatedRoot = await mkdtemp(
    join(tmpdir(), "codexstyle-update-notes-"),
  );
  const packageVersion = (
    JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  const changelog = await readFile(resolve("CHANGELOG.md"), "utf8");
  const currentReleaseHeader = new RegExp(
    `^## v${packageVersion.replaceAll(".", "\\.")} — (\\d{4}-\\d{2}-\\d{2})$`,
    "mu",
  ).exec(changelog);
  expect(
    currentReleaseHeader,
    "Current version must have bundled notes",
  ).not.toBeNull();
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
    env: {
      ...environment,
      LOCALAPPDATA: isolatedRoot,
      NODE_ENV: "production",
      npm_package_version: packageVersion,
    },
  });
  try {
    const page = await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) => {
      const state = globalThis as typeof globalThis & {
        updateNotesExternalRequests?: number;
      };
      state.updateNotesExternalRequests = 0;
      BrowserWindow.getAllWindows()[0].webContents.session.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => {
          state.updateNotesExternalRequests! += 1;
          callback({ cancel: true });
        },
      );
    });
    const historyButton = page.getByRole("button", {
      name: "更新记录",
      exact: true,
    });
    await expect(historyButton).toBeVisible();
    const runtime = await page.evaluate(() =>
      window.codexStyle.rendererReady(),
    );
    expect(runtime).toMatchObject({
      ok: true,
      data: { appVersion: packageVersion, protocolVersion: 9 },
    });

    await historyButton.click();
    const dialog = page.getByRole("dialog", { name: "更新与版本记录" });
    await expect(dialog).toBeVisible();
    const historyTab = dialog.getByRole("tab", { name: "历史更新" });
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
    const historyPanel = dialog.getByRole("tabpanel", { name: "历史更新" });
    await expect(historyPanel).toContainText("可离线查看");
    const currentEntry = dialog.locator(".release-history-entry").filter({
      has: page.locator(".release-current-badge"),
    });
    await expect(currentEntry).toHaveCount(1);
    await expect(currentEntry.locator("summary")).toContainText(
      `v${packageVersion}`,
    );
    await expect(currentEntry.locator("time")).toHaveAttribute(
      "datetime",
      currentReleaseHeader![1],
    );
    await expect(currentEntry.locator("time")).toHaveText(
      currentReleaseHeader![1],
    );
    if (
      !(await currentEntry.evaluate(
        (entry) => (entry as HTMLDetailsElement).open,
      ))
    )
      await currentEntry.locator("summary").click();
    await expect(currentEntry.locator(".release-notes")).toContainText(
      /\p{Script=Han}/u,
    );
    await expect(currentEntry).not.toContainText("### English");

    // 长历史只滚动弹窗正文，页头和底部操作留在视口内。
    const scrollArea = dialog.locator(".update-dialog-scroll");
    const dimensions = await scrollArea.evaluate((element) => ({
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
    }));
    expect(dimensions.contentHeight).toBeGreaterThan(dimensions.height);
    const outerScroll = await page.evaluate(
      () => document.scrollingElement?.scrollTop ?? 0,
    );
    const bounds = await scrollArea.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(
      bounds!.x + bounds!.width / 2,
      bounds!.y + bounds!.height / 2,
    );
    await page.mouse.wheel(0, 1800);
    await expect
      .poll(() => scrollArea.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0),
    ).toBe(outerScroll);
    await expect(
      dialog.getByRole("heading", { name: "更新与版本记录" }),
    ).toBeVisible();
    const footerClose = dialog.getByRole("button", {
      name: "关闭",
      exact: true,
    });
    const headerClose = dialog.getByRole("button", { name: "关闭更新窗口" });
    await expect(footerClose).toBeVisible();
    await footerClose.focus();
    await page.keyboard.press("Tab");
    await expect(headerClose).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(footerClose).toBeFocused();

    // 沿用产品允许的最小窗口，核对长内容与按钮不会使对话框溢出。
    const nativeWindow = await application.browserWindow(page);
    await nativeWindow.evaluate((browserWindow) =>
      browserWindow.setContentSize(960, 620),
    );
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(960);
    await scrollArea.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect
      .poll(async () => {
        const viewport = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        const box = await dialog.boundingBox();
        return Boolean(
          box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= viewport.width &&
            box.y + box.height <= viewport.height,
        );
      })
      .toBe(true);
    // 更新窗口需要保留阅读宽度，避免通用确认框后置样式把它压回 440px。
    const readingLayout = await scrollArea.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        dialogWidth: element.closest('[role="dialog"]')!.getBoundingClientRect()
          .width,
        contentWidth:
          element.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight),
      };
    });
    expect(readingLayout.dialogWidth).toBeGreaterThanOrEqual(720);
    expect(readingLayout.dialogWidth).toBeLessThanOrEqual(760);
    expect(readingLayout.contentWidth).toBeGreaterThanOrEqual(650);
    expect(
      await scrollArea.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("release-history-offline.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(historyButton).toBeFocused();

    // 开发版不能下载更新，但本次更新面板仍提供当前版本说明和可返回的历史标签。
    const updateButton = page.getByRole("button", {
      name: "此版本不支持应用内更新",
    });
    await updateButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "本次更新" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(dialog).toContainText("当前版本内容");
    await expect(dialog.locator(".release-notes")).toContainText(
      /\p{Script=Han}/u,
    );
    await expect(
      dialog.getByRole("button", { name: "下载更新", exact: true }),
    ).toHaveCount(0);
    const updateTab = dialog.getByRole("tab", { name: "本次更新" });
    await updateTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
    await expect(historyTab).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(updateTab).toHaveAttribute("aria-selected", "true");
    await expect(updateTab).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath("current-release-offline.png"),
      animations: "disabled",
    });
    await headerClose.click();
    await expect(dialog).toHaveCount(0);
    await expect(updateButton).toBeFocused();
    expect(
      await application.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              updateNotesExternalRequests?: number;
            }
          ).updateNotesExternalRequests,
      ),
    ).toBe(0);
  } finally {
    await application.close();
  }
});
