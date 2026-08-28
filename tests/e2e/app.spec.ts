import { _electron as electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("starts the real Electron shell with native storage and completes a local write", async () => {
  const projectRoot = resolve(process.cwd());
  const localAppData = await mkdtemp(join(tmpdir(), "codexstyle-e2e-"));
  const screenshotDirectory = resolve(projectRoot, "test-results", "e2e");
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const application = await electron.launch({
    executablePath: resolve(
      projectRoot,
      "node_modules",
      "electron",
      "dist",
      "electron.exe",
    ),
    args: [
      resolve(projectRoot, "out", "main", "index.js"),
      `--user-data-dir=${resolve(localAppData, "electron-user-data")}`,
    ],
    cwd: projectRoot,
    env: {
      ...environment,
      LOCALAPPDATA: localAppData,
      NODE_ENV: "production",
    },
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByText("Midnight Copper").first()).toBeVisible();
    await expect(page.getByText("Paper Light").first()).toBeVisible();

    await page.getByRole("button", { name: "＋ 新建主题" }).click();
    await expect(page.locator('input[value="新主题"]')).toBeVisible();
    await page.getByRole("tab", { name: "颜色" }).click();
    await page
      .getByRole("textbox", { name: "页面背景颜色", exact: true })
      .fill("#123456");
    await page.getByRole("button", { name: "保存主题" }).click();

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const result = await globalThis.window.codexStyle.getSnapshot();
          if (!result.ok) return undefined;
          return result.data.themes.find((theme) => theme.name === "新主题");
        }),
      )
      .toMatchObject({ status: "ready", hasBackground: true });

    const snapshot = await page.evaluate(() =>
      globalThis.window.codexStyle.getSnapshot(),
    );
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) expect(snapshot.data.themes).toHaveLength(3);

    const logDirectory = await application.evaluate(({ app }) =>
      app.getPath("logs"),
    );
    expect(logDirectory).toContain(localAppData);
    expect(await readdir(logDirectory)).toEqual([
      expect.stringMatching(/^main-\d{4}-\d{2}-\d{2}(?:\.\d+)?\.jsonl$/u),
    ]);

    await expect(
      page.getByRole("button", { name: "此版本不支持应用内更新" }),
    ).toBeEnabled();

    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDirectory, "codexstyle-studio.png"),
      fullPage: true,
    });
  } finally {
    await application.close();
    await rm(localAppData, { recursive: true, force: true });
  }
});
