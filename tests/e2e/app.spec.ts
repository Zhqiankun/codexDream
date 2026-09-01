import { _electron as electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  MANAGED_FILES,
  SecureManagedStore,
} from "../../src/main/infra/secure-store";
import { CODEX_SELECTOR_PROFILE } from "../../src/main/session/selector-profile";

test("starts the real Electron shell with native storage and completes a local write", async () => {
  const projectRoot = resolve(process.cwd());
  const packageVersion = (
    JSON.parse(
      await readFile(resolve(projectRoot, "package.json"), "utf8"),
    ) as {
      version: string;
    }
  ).version;
  const localAppData = await mkdtemp(join(tmpdir(), "codexstyle-e2e-"));
  const screenshotDirectory = resolve(projectRoot, "test-results", "e2e");
  seedFutureOwnershipState(localAppData);
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
      npm_package_version: packageVersion,
    },
  });
  let mcpClient: Client | undefined;

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
    await expect(page.getByLabel("CodexStyle 当前版本")).toContainText(
      `v${packageVersion}`,
    );
    await expect(
      page.getByRole("region", { name: "Codex 助手" }),
    ).toContainText("CodexStyle MCP 已就绪");
    const assistantGuide = page.getByLabel("MCP 使用方法");
    await expect(assistantGuide.getByRole("listitem")).toHaveCount(3);
    await expect(
      assistantGuide.getByRole("button", { name: "一键安装 / 更新" }),
    ).toBeVisible();
    await expect(assistantGuide).toContainText(
      "以后每次只需启动 CodexStyle；本机连接自动就绪",
    );
    const pluginRoot = resolve(projectRoot, "plugins", "codexstyle-assistant");
    const mcpConfig = JSON.parse(
      await readFile(resolve(pluginRoot, ".mcp.json"), "utf8"),
    ) as {
      mcpServers: {
        codexstyle: { command: string; args: string[]; cwd: string };
      };
    };
    const mcpDefinition = mcpConfig.mcpServers.codexstyle;
    mcpClient = new Client({ name: "codexstyle-e2e", version: "1.0.0" });
    await mcpClient.connect(
      new StdioClientTransport({
        command: resolve(pluginRoot, mcpDefinition.command),
        args: mcpDefinition.args,
        cwd: resolve(pluginRoot, mcpDefinition.cwd),
        env: {
          LOCALAPPDATA: localAppData,
          USERPROFILE: environment.USERPROFILE ?? "",
          PATH: environment.PATH ?? "",
        },
        stderr: "pipe",
      }),
    );
    const mcpTools = await mcpClient.listTools();
    expect(mcpTools.tools.map((tool) => tool.name).sort()).toEqual([
      "create_theme_draft",
      "get_theme",
      "list_themes",
      "select_theme",
      "status",
      "update_theme_draft",
      "validate_palette",
    ]);
    const mcpStatus = await mcpClient.callTool({
      name: "status",
      arguments: {},
    });
    expect(mcpStatus.isError).toBeFalsy();
    expect(mcpStatus.structuredContent).toMatchObject({
      appVersion: expect.any(String),
      protocolVersion: 1,
    });
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
          "安全黄标",
          "橘柿大利",
          "赤金信念",
          "慢工树懒",
          "银辉侧影",
          "发财掌柜",
          "打工箴言",
          "森语慢生活",
          "柿影暖阁",
          "宫阙祈愿",
          "紫墨武藏",
          "墨锋",
          "樱粉猫眸",
          "心动小狗",
          "虎兔来财",
          "白熊暖茶",
          "荣华祈愿",
          "清事书香",
          "橙城搭档",
          "霆闪善逸",
          "云海孤侠",
          "好运爆棚",
          "红团向前",
          "做大做强",
          "唐风健身",
          "朱漆松弛",
          "玄银流岚",
          "丹柿墨金",
          "冰眸烟晶",
          "黑曜赤金",
          "月蚀狼影",
          "翡翠待币",
          "绯刃夜权",
          "萤森猫语",
          "橄榄财趣",
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
          panel: "rgba(83, 10, 8, 0.2)",
          threadTabBackground: "rgba(93, 13, 9, 0.88)",
          homeTitleText: "#fff7e6",
          homeCardBackground: "rgba(92, 14, 10, 0.82)",
          activityBackground: "rgba(93, 13, 9, 0.76)",
          activityText: "#ffe9ba",
          composerText: "#fff8ea",
          accentText: "#56100b",
          selectionText: "#4c0c08",
          line: "rgba(255, 212, 59, 0.2)",
        },
      },
    });
    await expect(page.locator(".theme-swatch img")).toHaveCount(35);
    const themeList = page.getByLabel("主题列表");
    const themeSearch = page.getByRole("searchbox", { name: "搜索主题" });
    await themeSearch.fill("赤金信念");
    await expect(themeList.getByRole("button")).toHaveCount(1);
    await expect(
      themeList.getByRole("button", { name: /赤金信念/u }),
    ).toBeVisible();
    await page.getByRole("button", { name: "清空主题搜索" }).click();
    await expect(themeList.getByRole("button")).toHaveCount(37);
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
          sidebarBackgroundImage: style(".mock-sidebar").backgroundImage,
          dialog: style(".mock-dialog").backgroundColor,
          line: style(".mock-dialog").borderTopColor,
        };
      });
    expect(presetSurfaces).toEqual({
      relativeColorSupported: true,
      main: "rgba(111, 18, 13, 0.2)",
      sidebar: "rgba(69, 13, 15, 0.2)",
      sidebarBackgroundImage: "none",
      dialog: "rgba(83, 10, 8, 0.2)",
      line: "rgba(255, 212, 59, 0.2)",
    });

    await page.getByRole("tab", { name: "颜色" }).click();
    const sidebarPanelOpacity = page.getByRole("slider", {
      name: "左侧面板与弹窗透明度",
    });
    await sidebarPanelOpacity.fill("0");
    const transparentSidebar = await page
      .locator(".mock-sidebar")
      .evaluate((sidebar) => {
        const style = getComputedStyle(sidebar);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backdropFilter: style.backdropFilter,
        };
      });
    expect(transparentSidebar).toEqual({
      backgroundColor: "rgba(69, 13, 15, 0)",
      backgroundImage: "none",
      backdropFilter: "none",
    });
    await page.getByRole("button", { name: "放弃本次修改" }).click();
    const discardDialog = page.getByRole("dialog", {
      name: "放弃“赤金信念”的本次修改？",
    });
    await discardDialog.getByRole("button", { name: "放弃并恢复" }).click();
    await expect(discardDialog).toBeHidden();
    await expect(
      page.getByText("已放弃本次修改，主题已恢复到最近保存的状态。"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "放弃本次修改" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "＋ 新建主题" }).click();
    await expect(
      page.getByRole("heading", { name: "新主题", exact: true }),
    ).toBeVisible();
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
    if (snapshot.ok) expect(snapshot.data.themes).toHaveLength(38);
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
    await expect(
      page.getByRole("region", { name: "Codex 会话启动" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Codex 会话" })).toHaveCount(0);
    await page.locator('[data-preview-control-id="homeTitle"]').hover();
    await expect(page.getByText("点击定位 · 首页标题文字")).toBeVisible();

    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDirectory, "codexstyle-studio.png"),
      fullPage: true,
    });
  } finally {
    await mcpClient?.close();
    await application.close();
    await rm(localAppData, { recursive: true, force: true });
  }
});

function seedFutureOwnershipState(localAppData: string): void {
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
          selectorProfile: `openai-codex-shell/${currentVersion + 1}`,
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
