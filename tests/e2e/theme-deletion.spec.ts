import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("theme context menu confirms deletion, preserves other edits, and persists across restart", async ({}, testInfo) => {
  test.setTimeout(90_000);
  // 独立 secure-store 与 Electron profile，只修改本用例的主题库，不启动 Codex 会话。
  const isolatedRoot = await mkdtemp(join(tmpdir(), "codexstyle-delete-ui-"));
  const packageVersion = (
    JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string",
    ),
  ) as Record<string, string>;
  const launch = () =>
    electron.launch({
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
  let application: ElectronApplication | undefined = await launch();
  try {
    let page = await application.firstWindow();
    const paperRow = page
      .locator(".theme-row")
      .filter({ hasText: "Paper Light" });
    await expect(paperRow).toBeVisible();
    await page
      .locator(".theme-row")
      .filter({ hasText: "Midnight Copper" })
      .click();
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(
      "Midnight Copper",
    );
    await page.getByLabel("名称", { exact: true }).fill("尚未保存的编辑内容");

    // 右键仅打开菜单，不切换编辑主题；Escape 必须恢复到触发的主题行。
    await paperRow.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "删除主题" }),
    ).toBeFocused();
    const menuBounds = await menu.boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(menuBounds).not.toBeNull();
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.screenshot({
      path: testInfo.outputPath("theme-context-menu.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(paperRow).toBeFocused();

    // 键盘打开同一菜单，取消确认不会写主题库。
    await paperRow.press("Shift+F10");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "删除主题" }).click();
    let confirmation = page.getByRole("dialog");
    await expect(confirmation).toContainText("Paper Light");
    await confirmation
      .getByRole("button", { name: "取消", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(paperRow).toBeVisible();
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(
      "尚未保存的编辑内容",
    );

    await paperRow.click({ button: "right" });
    await menu.getByRole("menuitem", { name: "删除主题" }).click();
    confirmation = page.getByRole("dialog");
    await confirmation.getByRole("button", { name: "确认删除" }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(paperRow).toHaveCount(0);
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(
      "尚未保存的编辑内容",
    );
    expect(
      await page.evaluate(async () => {
        const result = await window.codexStyle.getSnapshot();
        return result.ok
          ? result.data.themes.some((theme) => theme.name === "Paper Light")
          : undefined;
      }),
    ).toBe(false);

    // 重启同一隔离 profile，证明删除已落盘且内置主题安装不会将它复活。
    await application.close();
    application = undefined;
    application = await launch();
    page = await application.firstWindow();
    const copperRow = page
      .locator(".theme-row")
      .filter({ hasText: "Midnight Copper" });
    await expect(copperRow).toBeVisible();
    await expect(
      page.locator(".theme-row").filter({ hasText: "Paper Light" }),
    ).toHaveCount(0);
    await copperRow.click();
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(
      "Midnight Copper",
    );

    // 删除当前编辑项后，必须真正读到剩余主题，不能被旧选中状态留在空编辑器。
    await page.getByRole("button", { name: "＋ 新建主题" }).click();
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(
      "新主题",
    );
    await expect(
      page.getByRole("button", { name: "＋ 新建主题" }),
    ).toBeEnabled();
    const currentDraft = page
      .locator(".theme-row")
      .filter({ hasText: "新主题" });
    await expect(currentDraft).toHaveCount(1);
    await currentDraft.click({ button: "right" });
    await page.getByRole("menuitem", { name: "删除主题" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认删除" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(currentDraft).toHaveCount(0);
    const expectedNextName = await page.evaluate(async () => {
      const result = await window.codexStyle.getSnapshot();
      if (!result.ok) throw new Error("Theme library unavailable");
      return (
        result.data.themes.find((theme) => theme.selectedForNextLaunch) ??
        result.data.themes[0]
      )?.name;
    });
    expect(expectedNextName).toBeTruthy();
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(
      expectedNextName!,
    );

    // 双击只选择下次启动主题；受保护主题右键仍可看到原因，不能提交删除。
    await copperRow.dblclick();
    await expect(copperRow.locator(".check-mark")).toHaveCount(1);
    await copperRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "删除主题" }).click();
    const protectedDialog = page.getByRole("dialog");
    await expect(protectedDialog.getByRole("alert")).toContainText("下次启动");
    await expect(
      protectedDialog.getByRole("button", { name: "确认删除" }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath("theme-deletion-protected.png"),
      animations: "disabled",
    });
    await protectedDialog
      .getByRole("button", { name: "取消", exact: true })
      .click();
    await expect(copperRow).toBeVisible();
  } finally {
    await application?.close();
  }
});
