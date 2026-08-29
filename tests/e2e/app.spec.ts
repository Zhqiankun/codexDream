import { _electron as electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MANAGED_FILES,
  SecureManagedStore,
} from "../../src/main/infra/secure-store";
import { CODEX_SELECTOR_PROFILE } from "../../src/main/session/selector-profile";

test("starts the real Electron shell with native storage and completes a local write", async () => {
  const projectRoot = resolve(process.cwd());
  const localAppData = await mkdtemp(join(tmpdir(), "codexstyle-e2e-"));
  const screenshotDirectory = resolve(projectRoot, "test-results", "e2e");
  seedPreviousOwnershipState(localAppData);
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
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const result = await globalThis.window.codexStyle.getSnapshot();
          return result.ok ? result.data.session.state : undefined;
        }),
      )
      .toBe("ORPHANED");
    await expect(page.getByText("Midnight Copper").first()).toBeVisible();
    await expect(page.getByText("Paper Light").first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const result = await globalThis.window.codexStyle.getSnapshot();
          return result.ok
            ? result.data.themes.map((theme) => theme.name)
            : undefined;
        }),
      )
      .toEqual(
        expect.arrayContaining([
          "赤金信念",
          "银辉侧影",
          "森语慢生活",
          "墨锋",
          "樱粉猫眸",
          "白熊暖茶",
          "霆闪善逸",
          "云海孤侠",
          "好运爆棚",
          "做大做强",
          "暖橙豚豚",
          "百元绯影",
          "晴绿线条小狗",
        ]),
      );

    const preset = await page.evaluate(async () => {
      const snapshot = await globalThis.window.codexStyle.getSnapshot();
      if (!snapshot.ok) return undefined;
      const summary = snapshot.data.themes.find(
        (theme) => theme.name === "赤金信念",
      );
      if (!summary) return undefined;
      const detail = await globalThis.window.codexStyle.getTheme({
        libraryId: summary.libraryId,
      });
      return detail.ok ? { summary, detail: detail.data } : undefined;
    });
    expect(preset).toMatchObject({
      summary: {
        backgroundColor: "rgba(111, 18, 13, 0.2)",
        backgroundThumbnailUrl: expect.stringContaining("app://theme-asset/"),
      },
      detail: {
        sidebarOverlayOpacity: 20,
        colors: {
          background: "rgba(111, 18, 13, 0.2)",
          panel: "rgba(136, 24, 18, 0.2)",
          threadTabBackground: "rgba(136, 24, 18, 0.2)",
          homeTitleText: "#fff6dc",
          homeCardBackground: "rgba(136, 24, 18, 0.2)",
          activityBackground: "rgba(136, 24, 18, 0.2)",
          activityText: "#fff6dc",
          line: "rgba(255, 212, 56, 0.1)",
        },
      },
    });
    await expect(page.locator(".theme-swatch img")).toHaveCount(13);
    await expect(
      page.getByRole("button", { name: "导出旧版兼容 ZIP" }),
    ).toHaveCount(0);
    expect(
      await page.locator(".top-apply-card").evaluate((selection) => {
        const editor = document.querySelector(".editor-grid");
        return Boolean(
          editor &&
            selection.compareDocumentPosition(editor) &
              Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);

    await page.getByRole("button", { name: /赤金信念/u }).click();
    await expect(page.locator('input[value="赤金信念"]')).toBeVisible();
    const presetSurfaces = await page
      .locator(".mock-codex")
      .evaluate((root) => {
        const style = (selector: string) =>
          getComputedStyle(root.querySelector(selector)!);
        return {
          relativeColorSupported: CSS.supports(
            "color",
            "rgb(from rgba(1, 2, 3, 0.2) r g b / 20%)",
          ),
          main: style(".mock-main").backgroundColor,
          sidebar: style(".mock-sidebar").backgroundColor,
          dialog: style(".mock-dialog").backgroundColor,
          line: style(".mock-dialog").borderTopColor,
        };
      });
    expect(presetSurfaces).toEqual({
      relativeColorSupported: true,
      main: "rgba(111, 18, 13, 0.2)",
      sidebar: "color(srgb 0.533333 0.0941176 0.0705882 / 0.2)",
      dialog: "rgba(136, 24, 18, 0.2)",
      line: "rgba(255, 212, 56, 0.1)",
    });

    await page.getByRole("button", { name: "＋ 新建主题" }).click();
    await expect(page.locator('input[value="新主题"]')).toBeVisible();
    await page.getByRole("tab", { name: "颜色" }).click();
    await page
      .getByRole("textbox", { name: "页面背景颜色", exact: true })
      .fill("#123456");
    await page
      .getByRole("textbox", {
        name: "探索并理解代码背景颜色",
        exact: true,
      })
      .fill("#654321");
    await page.getByRole("button", { name: "保存主题" }).click();

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const result = await globalThis.window.codexStyle.getSnapshot();
          if (!result.ok) return undefined;
          return result.data.themes.find((theme) => theme.name === "新主题");
        }),
      )
      .toMatchObject({
        status: "ready",
        hasBackground: true,
        backgroundColor: "#123456",
        backgroundThumbnailUrl: undefined,
      });

    const snapshot = await page.evaluate(() =>
      globalThis.window.codexStyle.getSnapshot(),
    );
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) expect(snapshot.data.themes).toHaveLength(16);
    const createdDetail = await page.evaluate(async () => {
      const snapshot = await globalThis.window.codexStyle.getSnapshot();
      if (!snapshot.ok) return undefined;
      const created = snapshot.data.themes.find(
        (candidate) => candidate.name === "新主题",
      );
      if (!created) return undefined;
      const detail = await globalThis.window.codexStyle.getTheme({
        libraryId: created.libraryId,
      });
      return detail.ok ? detail.data : undefined;
    });
    expect(createdDetail?.homeCards[0]).toMatchObject({
      mode: "color",
      color: "#654321",
    });

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

function seedPreviousOwnershipState(localAppData: string): void {
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = localAppData;
  let store: SecureManagedStore | undefined;
  try {
    store = SecureManagedStore.open(join(localAppData, "CodexStyle"));
    store.ensureLayout();
    const currentVersion = Number(CODEX_SELECTOR_PROFILE.split("/").at(-1));
    store.writeFileAtomic(
      MANAGED_FILES.ownership,
      Buffer.from(
        JSON.stringify({
          version: 1,
          packageFullName: "OpenAI.Codex_test",
          packageFamilyName: "OpenAI.Codex_test",
          executablePath: "C:\\Program Files\\WindowsApps\\ChatGPT.exe",
          pid: 42,
          startedAt: "2026-08-06T00:00:00.000Z",
          nonce: "b".repeat(64),
          port: 9222,
          browserId: "browser-1",
          targetId: "target-1",
          selectorProfile: `openai-codex-shell/${currentVersion - 1}`,
          themeLibraryId: "11111111-1111-4111-8111-111111111111",
          themeFingerprint: "a".repeat(64),
          createdAt: "2026-08-06T00:00:00.000Z",
        }),
        "utf8",
      ),
    );
  } finally {
    store?.close();
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
  }
}
