// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PatchDraftSchema,
  PROTOCOL_VERSION,
  type CodexStyleApi,
  type ImportResult,
  type Result,
  type ThemeDetail,
  type ThemeSnapshot,
} from "../../src/contracts";
import { App } from "../../src/renderer/app/App";

const theme: ThemeDetail = {
  libraryId: "11111111-1111-4111-8111-111111111111",
  canDiscardChanges: false,
  themeId: "midnight-copper",
  name: "Midnight Copper",
  description: "Local theme",
  css: '[data-ds-part="app"] { background-color: #111827; color: #fff; }',
  appearance: "auto",
  art: {
    focusX: 0.5,
    focusY: 0.5,
    safeArea: "none",
    taskMode: "ambient",
  },
  colors: {
    background: "#181818",
    panel: "#282828",
    sidebarText: "#ffffff",
    threadTabBackground: "rgba(40, 40, 40, 0.88)",
    threadTabText: "#f5d38a",
    homeTitleText: "#f8fafc",
    homeCardBackground: "rgba(45, 45, 45, 0.9)",
    homeCardText: "#f1f5f9",
    panelAlt: "#2d2d2d",
    composerText: "#f8fafc",
    assistantPanel: "#2d2d2d",
    assistantMessageText: "#ffffff",
    userMessageText: "#ffffff",
    changeCardBackground: "#2d2d2d",
    changeCardText: "#ffffff",
    activityBackground: "rgba(20, 20, 20, 0.72)",
    activityText: "#dbeafe",
    activityMuted: "#94a3b8",
    topBarBackground: "rgba(0, 0, 0, 0)",
    topBarText: "rgba(255, 255, 255, .498)",
    accent: "#f59e0b",
    accentText: "#181818",
    accentAlt: "#d9d9d9",
    secondary: "#808080",
    highlight: "#f2f2f2",
    selectionText: "#181818",
    text: "#ffffff",
    muted: "rgba(255, 255, 255, .498)",
    line: "rgba(255, 255, 255, .157)",
  },
  homeCards: [
    { mode: "color", color: "#2d2d2d" },
    { mode: "color", color: "#334155" },
    { mode: "color", color: "rgba(51, 65, 85, 0.8)" },
    { mode: "color", color: "#1f2937" },
  ],
  styleConfig: {
    mode: "advanced",
    sendIcon: "native",
    recipes: {
      sidebar: true,
      composer: true,
      message: true,
      dialog: true,
    },
    blur: 18,
    radius: 12,
    borderWidth: 1,
    shadow: "soft",
  },
  backgroundScope: "window",
  sidebarOverlayOpacity: 75,
  backgroundUrl: "app://theme-asset/11111111-1111-4111-8111-111111111111",
  json: {
    schemaVersion: 1,
    id: "midnight-copper",
    name: "Midnight Copper",
    image: "background.png",
  },
  status: "ready",
  revision: 2,
  updatedAt: "2026-08-06T00:00:00.000Z",
  accent: "#f59e0b",
  backgroundColor: "#181818",
  hasBackground: true,
  backgroundThumbnailUrl:
    "app://theme-asset/11111111-1111-4111-8111-111111111111?v=2",
  selectedForNextLaunch: false,
  signed: false,
  packageFormat: "simplified",
  validation: { css: "valid", image: "valid", package: "ready", warnings: [] },
};

const snapshot: ThemeSnapshot = {
  themes: [
    {
      libraryId: theme.libraryId,
      name: theme.name,
      status: "ready",
      revision: theme.revision,
      updatedAt: theme.updatedAt,
      accent: theme.accent,
      backgroundColor: theme.backgroundColor,
      hasBackground: true,
      backgroundThumbnailUrl: theme.backgroundThumbnailUrl,
      selectedForNextLaunch: false,
      signed: false,
      packageFormat: "simplified",
    },
  ],
  paused: false,
  session: {
    state: "NO_SESSION",
    messageKey: "session.ready",
    canEnd: false,
    launchedByTool: false,
  },
  update: { configured: true, status: "idle", currentVersion: "1.0.0" },
  assistant: {
    state: "listening",
    protocolVersion: 1,
  },
};

function makeApi() {
  const api = {
    rendererReady: vi.fn().mockResolvedValue({
      ok: true,
      data: { appVersion: "1.3.8", protocolVersion: 5 },
    }),
    openLogDirectory: vi.fn().mockResolvedValue({ ok: true, data: true }),
    installAssistantPlugin: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: "installed",
        pluginId: "codexstyle-assistant@codexstyle",
        version: "0.1.1",
        requiresCodexRestart: true,
      },
    }),
    getSnapshot: vi.fn().mockResolvedValue({ ok: true, data: snapshot }),
    getTheme: vi.fn().mockResolvedValue({ ok: true, data: theme }),
    createDraft: vi.fn(),
    patchDraft: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...theme, revision: 3 } }),
    discardChanges: vi.fn().mockResolvedValue({ ok: true, data: theme }),
    chooseBackground: vi.fn(),
    chooseSendIcon: vi.fn(),
    chooseHomeCardImage: vi.fn(),
    commit: vi.fn().mockResolvedValue({
      ok: true,
      data: { ...theme, revision: 4, status: "ready" },
    }),
    deleteTheme: vi.fn().mockResolvedValue({ ok: true, data: snapshot }),
    importZip: vi.fn(),
    resolveImport: vi.fn(),
    exportZip: vi.fn().mockResolvedValue({
      ok: true,
      data: { cancelled: false, format: "simplified" },
    }),
    selectForNextLaunch: vi.fn(),
    clearSelection: vi.fn(),
    launchSession: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    endOwnedSession: vi.fn(),
    getUpdateStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: { configured: true, status: "idle", currentVersion: "1.0.0" },
    }),
    requestUpdate: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        configured: true,
        status: "current",
        currentVersion: "1.0.0",
        latestVersion: "1.0.0",
      },
    }),
    cancelUpdate: vi.fn().mockResolvedValue({
      ok: true,
      data: { configured: true, status: "idle", currentVersion: "1.0.0" },
    }),
    installUpdate: vi.fn(),
    openUpdatePage: vi.fn(),
    onStateChanged: vi.fn().mockReturnValue(() => undefined),
  } satisfies CodexStyleApi;
  return api;
}

describe("Studio renderer", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.codexStyle = makeApi();
  });

  it("loads a local theme and renders a safe preview", async () => {
    render(<App />);
    expect(
      (await screen.findAllByText("Midnight Copper")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("实时预览")).toBeInTheDocument();
    expect(screen.getByText("安全样式已通过")).toBeInTheDocument();
    expect(screen.getByLabelText("Codex 助手")).toHaveTextContent(
      "CodexStyle MCP 已就绪",
    );
    const assistantGuide = screen.getByLabelText("MCP 使用方法");
    expect(within(assistantGuide).getAllByRole("listitem")).toHaveLength(3);
    expect(assistantGuide).toHaveTextContent(
      "首次一次安装并启用插件；已打开 Codex 时新建任务或重启",
    );
    expect(assistantGuide).toHaveTextContent(
      "以后每次只需启动 CodexStyle；本机连接自动就绪",
    );
    expect(assistantGuide).toHaveTextContent(
      "开始设计在 Codex 描述配色 → 回到这里预览并保存草稿",
    );
    expect(screen.getByLabelText("Codex 助手")).toHaveTextContent(
      "本机连接已自动启动",
    );
    expect(screen.getByLabelText("Codex 助手")).not.toHaveTextContent(
      "安装 CodexStyle Assistant 插件后，在新对话中直接描述想要的配色",
    );
    expect(screen.getByLabelText("Codex 助手")).toHaveTextContent("现代奢华");
    fireEvent.click(screen.getByRole("tab", { name: "画面" }));
    expect(
      screen.getByRole("note", { name: "背景图片要求" }),
    ).toHaveTextContent("推荐 1920 × 1080（16:9）");
    expect(document.querySelector(".mock-background")).toHaveAttribute(
      "src",
      theme.backgroundUrl,
    );
    expect(document.querySelector(".mock-user-message")).toHaveAttribute(
      "data-ds-part",
      "message",
    );
    expect(document.querySelector(".mock-message")).toHaveAttribute(
      "data-ds-part",
      "message",
    );
    expect(document.querySelector(".mock-code")).not.toHaveAttribute(
      "data-ds-part",
    );
    expect(screen.getByLabelText("命令与思考预览")).toHaveAttribute(
      "data-ds-part",
      "activity",
    );
    expect(document.querySelector(".mock-toolbar-title")).toHaveAttribute(
      "data-ds-part",
      "thread-tab",
    );
    const changePreview = screen.getByLabelText("文件变更预览");
    expect(changePreview).toHaveTextContent("已编辑 2 个文件");
    expect(changePreview).toHaveTextContent("src/renderer/app/App.tsx");
    expect(changePreview).toHaveTextContent("src/renderer/styles/global.css");
    expect(
      within(changePreview).getByRole("button", {
        name: "撤销按钮，定位到文件变更文字设置",
      }),
    ).toBeInTheDocument();
    expect(
      within(changePreview).getByRole("button", {
        name: "审核按钮，定位到主要按钮背景设置",
      }),
    ).toBeInTheDocument();
  });

  it("uses background thumbnails in the theme list and falls back to the page color", async () => {
    const api = makeApi();
    const colorOnly = {
      ...snapshot.themes[0],
      libraryId: "22222222-2222-4222-8222-222222222222",
      name: "Color Only",
      backgroundColor: "rgba(12, 34, 56, 0.2)",
      backgroundThumbnailUrl: undefined,
    };
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, themes: [snapshot.themes[0], colorOnly] },
    });
    window.codexStyle = api;

    render(<App />);
    const imageRow = await screen.findByRole("button", {
      name: /Midnight Copper/u,
    });
    const image = imageRow.querySelector(".theme-swatch img");
    expect(image).toHaveAttribute("src", theme.backgroundThumbnailUrl);
    expect(image).toHaveAttribute("loading", "lazy");

    const colorRow = screen.getByRole("button", { name: /Color Only/u });
    const fallback = colorRow.querySelector(".theme-swatch");
    expect(fallback).toHaveStyle({ background: colorOnly.backgroundColor });
    expect(fallback?.querySelector("img")).toBeNull();
  });

  it("filters a large theme library without changing the selected theme", async () => {
    const api = makeApi();
    const colorOnlySummary = {
      ...snapshot.themes[0],
      libraryId: "22222222-2222-4222-8222-222222222222",
      name: "Color Only",
      backgroundThumbnailUrl: undefined,
    };
    const colorOnlyDetail: ThemeDetail = {
      ...theme,
      ...colorOnlySummary,
      themeId: "color-only",
    };
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: {
        ...snapshot,
        themes: [snapshot.themes[0], colorOnlySummary],
      },
    });
    api.getTheme.mockImplementation(async ({ libraryId }) => ({
      ok: true,
      data: libraryId === colorOnlySummary.libraryId ? colorOnlyDetail : theme,
    }));
    window.codexStyle = api;

    render(<App />);
    const list = await screen.findByLabelText("主题列表");
    const search = screen.getByRole("searchbox", { name: "搜索主题" });
    expect(within(list).getAllByRole("button")).toHaveLength(2);

    fireEvent.change(search, { target: { value: "color" } });
    await waitFor(() =>
      expect(within(list).getAllByRole("button")).toHaveLength(1),
    );
    expect(
      within(list).queryByRole("button", { name: /Midnight/u }),
    ).toBeNull();
    expect(
      within(screen.getByRole("search", { name: "主题库搜索" })).getByText(
        "1/2",
      ),
    ).toBeVisible();

    fireEvent.click(within(list).getByRole("button", { name: /Color Only/u }));
    await waitFor(() =>
      expect(api.getTheme).toHaveBeenLastCalledWith({
        libraryId: colorOnlySummary.libraryId,
      }),
    );

    fireEvent.change(search, { target: { value: "不存在的主题" } });
    expect(await within(list).findByText("没有匹配的主题")).toBeVisible();
    expect(screen.getByDisplayValue("Color Only")).toBeVisible();

    fireEvent.click(within(list).getByRole("button", { name: "清空搜索" }));
    await waitFor(() =>
      expect(within(list).getAllByRole("button")).toHaveLength(2),
    );
    expect(search).toHaveValue("");
  });

  it("places next-launch theme selection above the editor workspace", async () => {
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    const selection = document.querySelector(".top-apply-card");
    const editor = document.querySelector(".editor-grid");
    expect(selection).toBeInTheDocument();
    expect(editor).toBeInTheDocument();
    expect(
      selection!.compareDocumentPosition(editor!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "导出旧版兼容 ZIP" }),
    ).toBeNull();
  });

  it("opens the bounded diagnostic log directory from the top bar", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "打开诊断日志目录" }),
    );

    await waitFor(() => expect(api.openLogDirectory).toHaveBeenCalledOnce());
    expect(
      await screen.findByText("已打开日志目录；诊断日志自动保留 7 天。"),
    ).toBeInTheDocument();
  });

  it("installs the bundled assistant plugin from the usage guide", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "一键安装 / 更新" }),
    );

    await waitFor(() => expect(api.installAssistantPlugin).toHaveBeenCalled());
    expect(
      await screen.findByRole("button", { name: "已安装 v0.1.1" }),
    ).toBeDisabled();
    expect(
      await screen.findByText(
        "CodexStyle Assistant v0.1.1 已安装；请新建 Codex 任务或重启 Codex。",
      ),
    ).toBeVisible();
  });

  it("blocks a renderer loaded by an incompatible resident main process", async () => {
    const api = makeApi();
    api.rendererReady.mockResolvedValue({
      ok: true,
      data: true as never,
    });
    window.codexStyle = api;

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "检测到新旧版本组件同时运行",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/从托盘彻底退出 CodexStyle/u)).toBeInTheDocument();
    expect(api.getSnapshot).not.toHaveBeenCalled();
  });

  it("downloads a verified update internally and offers installation choices", async () => {
    const api = makeApi();
    const downloaded = {
      configured: true as const,
      status: "downloaded" as const,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.1.0",
      checkedAt: "2026-08-27T08:00:00.000Z",
    };
    const scheduled = {
      ...downloaded,
      status: "scheduled" as const,
      installOnQuit: true,
    };
    api.requestUpdate.mockResolvedValue({ ok: true, data: downloaded });
    api.installUpdate.mockResolvedValue({ ok: true, data: scheduled });
    window.codexStyle = api;

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "检查更新" }));

    expect(await screen.findByText("v1.1.0 已准备好安装")).toBeInTheDocument();
    expect(screen.getByText(/完整性校验已通过/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出时安装" }));

    await waitFor(() =>
      expect(api.installUpdate).toHaveBeenCalledWith({ mode: "on-quit" }),
    );
    expect(await screen.findByText("已安排退出时安装")).toBeInTheDocument();
  });

  it("shows a quiet availability hint and a download icon before downloading", async () => {
    const api = makeApi();
    const available = {
      configured: true as const,
      status: "available" as const,
      currentVersion: "1.3.3",
      latestVersion: "1.4.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.4.0",
      checkedAt: "2026-08-28T09:00:00.000Z",
    };
    const downloaded = { ...available, status: "downloaded" as const };
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, update: available },
    });
    api.requestUpdate.mockResolvedValue({ ok: true, data: downloaded });
    window.codexStyle = api;

    render(<App />);

    expect(await screen.findByText("有新版 v1.4.0")).toBeInTheDocument();
    expect(screen.queryByLabelText("CodexStyle 更新")).toBeNull();
    const updateButton = screen.getByRole("button", {
      name: "下载 v1.4.0 更新",
    });
    expect(updateButton.querySelector("svg.update-icon")).toBeInTheDocument();
    expect(updateButton).not.toHaveTextContent("↻");

    fireEvent.click(updateButton);
    await waitFor(() => expect(api.requestUpdate).toHaveBeenCalledOnce());
    expect(await screen.findByText("v1.4.0 已准备好安装")).toBeInTheDocument();
  });

  it("shows immediate busy feedback when a manual check joins background work", async () => {
    const api = makeApi();
    let resolveUpdate!: (
      result: Awaited<ReturnType<typeof api.requestUpdate>>,
    ) => void;
    api.requestUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    window.codexStyle = api;
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "检查更新" }));

    const pending = screen.getByRole("button", { name: "正在检查更新" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveClass("is-busy");

    await act(async () => {
      resolveUpdate({
        ok: true,
        data: {
          configured: true,
          status: "current",
          currentVersion: "1.3.3",
          latestVersion: "1.3.3",
        },
      });
    });
    expect(
      await screen.findByRole("button", { name: "检查更新" }),
    ).toBeEnabled();
  });

  it("shows determinate download progress and allows cancellation", async () => {
    const api = makeApi();
    const downloading = {
      configured: true as const,
      status: "downloading" as const,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.1.0",
      progress: {
        percent: 42,
        transferredBytes: 42 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024,
        bytesPerSecond: 2 * 1024 * 1024,
      },
    };
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, update: downloading },
    });
    api.cancelUpdate.mockResolvedValue({
      ok: true,
      data: {
        configured: true,
        status: "available",
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
        releaseUrl: downloading.releaseUrl,
      },
    });
    window.codexStyle = api;

    render(<App />);
    const progress = await screen.findByRole("progressbar", {
      name: "更新下载进度",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText(/42% · 42.0 MB \/ 100 MB/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消下载" }));
    await waitFor(() => expect(api.cancelUpdate).toHaveBeenCalledOnce());
    expect(await screen.findByText("更新下载已取消。")).toBeInTheDocument();
  });

  it("offers an installer retry after a verified download cannot start", async () => {
    const api = makeApi();
    const installError = {
      configured: true as const,
      status: "error" as const,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.1.0",
      errorPhase: "install" as const,
    };
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, update: installError },
    });
    api.installUpdate.mockResolvedValue({
      ok: true,
      data: { ...installError, status: "installing", errorPhase: undefined },
    });
    window.codexStyle = api;

    render(<App />);
    expect(await screen.findByText("无法启动更新安装")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试安装" }));

    await waitFor(() =>
      expect(api.installUpdate).toHaveBeenCalledWith({ mode: "now" }),
    );
  });

  it("reports when the installed version is already current", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "检查更新" }));

    expect(
      await screen.findByText("当前已是最新版 v1.0.0。"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "检查更新" })).toBeEnabled(),
    );
  });

  it("reports update-check failures without claiming a network cause", async () => {
    const api = makeApi();
    api.requestUpdate.mockResolvedValue({
      ok: false,
      error: {
        code: "UPDATE_CHECK_FAILED",
        messageKey: "update.checkFailed",
      },
    });
    window.codexStyle = api;

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "检查更新" }));

    expect(
      await screen.findByText(
        "更新检查未完成，请稍后重试，或打开 GitHub Release 手动下载。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/无法连接 GitHub/u)).not.toBeInTheDocument();
  });

  it("opens the manual release fallback for a portable build", async () => {
    const api = makeApi();
    const unsupported = {
      configured: false as const,
      status: "unsupported" as const,
      currentVersion: "1.0.0",
    };
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, update: unsupported },
    });
    api.openUpdatePage.mockResolvedValue({ ok: true, data: unsupported });
    window.codexStyle = api;

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "此版本不支持应用内更新",
      }),
    );

    await waitFor(() => expect(api.openUpdatePage).toHaveBeenCalledOnce());
    expect(
      await screen.findByText("已打开 GitHub Release 手动下载页面。"),
    ).toBeInTheDocument();
  });

  it("applies a built-in theme preset without replacing theme identity", async () => {
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    expect(
      screen.getAllByRole("button", { name: /^应用.+预设$/u }),
    ).toHaveLength(15);
    const amethystPreset = screen.getByRole("button", {
      name: "应用紫晶珍珠预设",
    });
    fireEvent.click(amethystPreset);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "应用紫晶珍珠预设" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "颜色" }));

    await waitFor(() =>
      expect(screen.getByLabelText("页面背景颜色")).toHaveValue(
        "rgba(44, 25, 68, 0.2)",
      ),
    );
    expect(screen.getByLabelText("主要按钮背景颜色")).toHaveValue("#ddd4e9");
    expect(screen.getByLabelText("输入文字颜色")).toHaveValue("#f7f2fb");
    expect(screen.getByLabelText("选区文字颜色")).toHaveValue("#301b48");
    fireEvent.click(screen.getByRole("tab", { name: "基础" }));
    expect(screen.getByDisplayValue("Midnight Copper")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "应用紫晶珍珠预设" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("discards the current edit only after explicit confirmation", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("tab", { name: "颜色" }));
    const background = screen.getByRole("textbox", {
      name: "页面背景颜色",
    });
    fireEvent.change(background, { target: { value: "#123456" } });

    const discardButton = screen.getByRole("button", {
      name: "放弃本次修改",
    });
    discardButton.focus();
    fireEvent.click(discardButton);
    let dialog = screen.getByRole("dialog", {
      name: "放弃“Midnight Copper”的本次修改？",
    });
    expect(dialog).toHaveTextContent("主题本身和“下次启动”选择不会被删除");
    expect(api.discardChanges).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(discardButton).toHaveFocus();

    fireEvent.click(discardButton);
    dialog = screen.getByRole("dialog", {
      name: "放弃“Midnight Copper”的本次修改？",
    });
    expect(
      within(dialog).getByRole("button", { name: "继续编辑" }),
    ).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "放弃并恢复" }));
    await waitFor(() =>
      expect(api.discardChanges).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
      }),
    );
    await waitFor(() =>
      expect(background).toHaveValue(theme.colors.background),
    );
    expect(
      await screen.findByText("已放弃本次修改，主题已恢复到最近保存的状态。"),
    ).toBeInTheDocument();
  });

  it("offers discard for a persisted working copy even without local field changes", async () => {
    const api = makeApi();
    const persistedDraft: ThemeDetail = {
      ...theme,
      canDiscardChanges: true,
      name: "Persisted draft",
      status: "draft",
      revision: 3,
      validation: { ...theme.validation, package: "draft" },
    };
    const restored: ThemeDetail = {
      ...theme,
      canDiscardChanges: false,
      revision: 4,
    };
    api.getTheme.mockResolvedValue({ ok: true, data: persistedDraft });
    api.discardChanges.mockResolvedValue({ ok: true, data: restored });
    window.codexStyle = api;

    render(<App />);
    const discard = await screen.findByRole("button", {
      name: "放弃本次修改",
    });
    expect(discard).toBeEnabled();
    fireEvent.click(discard);
    fireEvent.click(screen.getByRole("button", { name: "放弃并恢复" }));

    await waitFor(() =>
      expect(api.discardChanges).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: persistedDraft.revision,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "放弃本次修改" }),
      ).toBeDisabled(),
    );
    expect(screen.getByRole("tab", { name: "设计" })).toHaveFocus();
  });

  it("switches the live preview between conversation and home", async () => {
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    const preview = document.querySelector(".mock-codex");
    expect(preview).toHaveAttribute("data-preview-page", "conversation");
    expect(
      screen.getByText("await studio.preview(theme);"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "对话" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "首页" }));

    expect(preview).toHaveAttribute("data-preview-page", "home");
    expect(
      screen.getByRole("heading", {
        name: "你想让我们在 CodexStyle 中构建什么？",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("随心输入")).toBeInTheDocument();
    expect(screen.queryByText("await studio.preview(theme);")).toBeNull();
    expect(document.querySelector(".mock-home-composer")).toHaveAttribute(
      "data-ds-part",
      "composer",
    );
    expect(document.querySelector(".mock-home h3")).toHaveAttribute(
      "data-ds-part",
      "home-title",
    );
    expect(
      document.querySelectorAll('[data-ds-part="home-card"]'),
    ).toHaveLength(4);
    expect(document.querySelector(".mock-background")).toHaveAttribute(
      "src",
      theme.backgroundUrl,
    );

    fireEvent.click(screen.getByRole("button", { name: "对话" }));
    expect(preview).toHaveAttribute("data-preview-page", "conversation");
    expect(
      screen.getByText("await studio.preview(theme);"),
    ).toBeInTheDocument();
  });

  it("shows a newly selected background in the live preview", async () => {
    const draftWithoutBackground: ThemeDetail = {
      ...theme,
      backgroundUrl: undefined,
      hasBackground: false,
      status: "draft",
      validation: {
        ...theme.validation,
        image: "missing",
        package: "draft",
      },
    };
    const themeWithBackground: ThemeDetail = {
      ...draftWithoutBackground,
      canDiscardChanges: true,
      backgroundUrl: theme.backgroundUrl,
      hasBackground: true,
      revision: draftWithoutBackground.revision + 1,
      validation: {
        ...theme.validation,
        package: "draft",
      },
    };
    const api = makeApi();
    // Simulate an older refresh completing after the chooser result. The
    // chooser response must update the editor immediately and must not be
    // overwritten by the stale detail.
    api.getTheme.mockResolvedValue({
      ok: true,
      data: draftWithoutBackground,
    });
    api.chooseBackground.mockResolvedValue({
      ok: true,
      data: themeWithBackground,
    });
    window.codexStyle = api;

    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "画面" }));
    await screen.findByText("未选择背景");
    const previewBeforeSelection = document.querySelector(".mock-codex");
    expect(document.querySelector(".mock-background")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "选择图片" }));

    expect(await screen.findByAltText("主题背景预览")).toHaveAttribute(
      "src",
      theme.backgroundUrl,
    );
    await waitFor(() =>
      expect(document.querySelector(".mock-background")).toHaveAttribute(
        "src",
        theme.backgroundUrl,
      ),
    );
    expect(document.querySelector(".mock-codex")).not.toBe(
      previewBeforeSelection,
    );
  });

  it("previews and patches configurable background coverage", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("tab", { name: "画面" }));

    expect(
      document.querySelector(".mock-codex > .mock-background"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全窗口" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "仅内容区" }));
    await waitFor(() =>
      expect(
        document.querySelector(".mock-codex > .mock-background"),
      ).toBeNull(),
    );
    expect(
      document.querySelector(".mock-main > .mock-background"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全窗口" }));
    fireEvent.change(
      screen.getByRole("slider", { name: "左侧栏遮罩不透明度" }),
      { target: { value: "35" } },
    );
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(document.querySelector(".mock-codex")).toHaveStyle({
      "--preview-sidebar-opacity": "35%",
    });

    fireEvent.click(screen.getByRole("button", { name: "保存主题" }));
    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
        patch: expect.objectContaining({
          backgroundScope: "window",
          sidebarOverlayOpacity: 35,
        }),
      }),
    );
    const request = api.patchDraft.mock.calls.at(-1)?.[0];
    expect(
      PatchDraftSchema.safeParse({ v: PROTOCOL_VERSION, ...request }).success,
    ).toBe(true);
  });

  it("blocks configured-theme persistence until every color uses a supported format", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("tab", { name: "组件样式" }));
    fireEvent.click(screen.getByRole("button", { name: "配置生成" }));
    fireEvent.click(screen.getByRole("tab", { name: "设计" }));
    fireEvent.click(screen.getByRole("tab", { name: "颜色" }));

    const color = screen.getByRole("textbox", { name: "页面背景颜色" });
    fireEvent.change(color, { target: { value: "navy" } });

    expect(color).toHaveAttribute("aria-invalid", "true");
    expect(color).toHaveAccessibleDescription(/格式无效/u);
    expect(
      screen.getByText(/格式无效，请使用上方列出的十六进制/u),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存主题" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出主题 ZIP" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "导出旧版兼容 ZIP" }),
    ).toBeNull();
    expect(api.patchDraft).not.toHaveBeenCalled();
    expect(api.exportZip).not.toHaveBeenCalled();

    fireEvent.change(color, { target: { value: "#123456" } });
    expect(color).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: "保存主题" })).toBeEnabled();
  });

  it("previews focus and theme colors before patching structured design", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("tab", { name: "画面" }));

    fireEvent.change(screen.getByRole("slider", { name: "背景水平焦点" }), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "背景垂直焦点" }), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "颜色" }));
    const accentPicker = screen.getByLabelText("选择主要按钮背景颜色");
    expect(accentPicker).toHaveValue("#f59e0b");
    fireEvent.change(accentPicker, {
      target: { value: "#336699" },
    });
    expect(
      screen.getByRole("textbox", { name: "主要按钮背景颜色" }),
    ).toHaveValue("#336699");
    fireEvent.change(
      screen.getByRole("slider", { name: "主要按钮背景透明度" }),
      {
        target: { value: "42" },
      },
    );
    expect(
      screen.getByRole("textbox", { name: "主要按钮背景颜色" }),
    ).toHaveValue("rgba(51, 102, 153, 0.42)");
    expect(
      screen.getByRole("textbox", { name: "左侧面板文字颜色" }),
    ).toHaveValue("#ffffff");
    fireEvent.change(
      screen.getByRole("slider", { name: "助手回复背景透明度" }),
      { target: { value: "36" } },
    );
    expect(
      screen.getByRole("textbox", { name: "助手回复背景颜色" }),
    ).toHaveValue("rgba(45, 45, 45, 0.36)");
    fireEvent.change(screen.getByLabelText("选择助手回复文字颜色"), {
      target: { value: "#a1b2c3" },
    });
    fireEvent.change(
      screen.getByRole("slider", { name: "文件变更背景透明度" }),
      { target: { value: "44" } },
    );
    fireEvent.change(screen.getByLabelText("选择文件变更文字颜色"), {
      target: { value: "#c4d5e6" },
    });
    fireEvent.change(screen.getByLabelText("选择我的消息文字颜色"), {
      target: { value: "#102030" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "顶部栏背景透明度" }), {
      target: { value: "48" },
    });
    fireEvent.change(screen.getByLabelText("选择顶部栏背景颜色"), {
      target: { value: "#123456" },
    });
    expect(screen.getByRole("textbox", { name: "顶部栏背景颜色" })).toHaveValue(
      "rgba(18, 52, 86, 0.48)",
    );
    expect(screen.getByRole("textbox", { name: "顶部栏文字颜色" })).toHaveValue(
      "rgba(255, 255, 255, .498)",
    );
    const extendedColors = {
      会话标题背景颜色: "rgba(34, 51, 68, 0.55)",
      会话标题文字颜色: "#f0c060",
      首页标题文字颜色: "#aabbcc",
      首页快捷卡片背景颜色: "rgba(51, 68, 85, 0.66)",
      首页快捷卡片文字颜色: "#ddeeff",
      命令与思考背景颜色: "rgba(17, 34, 51, 0.44)",
      命令与思考文字颜色: "#bbddff",
      命令与思考次要文字颜色: "#789abc",
    } as const;
    for (const [name, value] of Object.entries(extendedColors))
      fireEvent.change(screen.getByRole("textbox", { name }), {
        target: { value },
      });

    const background = document.querySelector(
      ".mock-codex > .mock-background",
    ) as HTMLImageElement;
    const preview = document.querySelector(".mock-codex") as HTMLElement;
    expect(background.style.objectPosition).toBe("20% 80%");
    expect(preview.style.getPropertyValue("--preview-accent")).toBe(
      "rgba(51, 102, 153, 0.42)",
    );
    expect(preview.style.getPropertyValue("--preview-sidebar-text")).toBe(
      "#ffffff",
    );
    expect(preview.style.getPropertyValue("--preview-assistant-panel")).toBe(
      "rgba(45, 45, 45, 0.36)",
    );
    expect(
      preview.style.getPropertyValue("--preview-assistant-message-text"),
    ).toBe("#a1b2c3");
    expect(
      preview.style.getPropertyValue("--preview-change-card-background"),
    ).toBe("rgba(45, 45, 45, 0.44)");
    expect(preview.style.getPropertyValue("--preview-change-card-text")).toBe(
      "#c4d5e6",
    );
    expect(preview.style.getPropertyValue("--preview-user-message-text")).toBe(
      "#102030",
    );
    expect(preview.style.getPropertyValue("--preview-top-bar-background")).toBe(
      "rgba(18, 52, 86, 0.48)",
    );
    expect(preview.style.getPropertyValue("--preview-top-bar-text")).toBe(
      "rgba(255, 255, 255, .498)",
    );
    expect(
      preview.style.getPropertyValue("--preview-thread-tab-background"),
    ).toBe("rgba(34, 51, 68, 0.55)");
    expect(preview.style.getPropertyValue("--preview-thread-tab-text")).toBe(
      "#f0c060",
    );
    expect(preview.style.getPropertyValue("--preview-home-title-text")).toBe(
      "#aabbcc",
    );
    expect(
      preview.style.getPropertyValue("--preview-home-card-background"),
    ).toBe("rgba(51, 68, 85, 0.66)");
    expect(preview.style.getPropertyValue("--preview-home-card-text")).toBe(
      "#ddeeff",
    );
    expect(
      preview.style.getPropertyValue("--preview-activity-background"),
    ).toBe("rgba(17, 34, 51, 0.44)");
    expect(preview.style.getPropertyValue("--preview-activity-text")).toBe(
      "#bbddff",
    );
    expect(preview.style.getPropertyValue("--preview-activity-muted")).toBe(
      "#789abc",
    );

    fireEvent.click(screen.getByRole("button", { name: "保存主题" }));
    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
        patch: expect.objectContaining({
          art: expect.objectContaining({ focusX: 0.2, focusY: 0.8 }),
          colors: expect.objectContaining({
            accent: "rgba(51, 102, 153, 0.42)",
            sidebarText: "#ffffff",
            assistantPanel: "rgba(45, 45, 45, 0.36)",
            assistantMessageText: "#a1b2c3",
            userMessageText: "#102030",
            changeCardBackground: "rgba(45, 45, 45, 0.44)",
            changeCardText: "#c4d5e6",
            topBarBackground: "rgba(18, 52, 86, 0.48)",
            topBarText: "rgba(255, 255, 255, .498)",
            threadTabBackground: "rgba(34, 51, 68, 0.55)",
            threadTabText: "#f0c060",
            homeTitleText: "#aabbcc",
            homeCardBackground: "rgba(51, 68, 85, 0.66)",
            homeCardText: "#ddeeff",
            activityBackground: "rgba(17, 34, 51, 0.44)",
            activityText: "#bbddff",
            activityMuted: "#789abc",
          }),
        }),
      }),
    );
  });

  it("groups color controls by visible area and locates them in the preview", async () => {
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("tab", { name: "颜色" }));

    expect(screen.getByText("页面与窗口")).toBeInTheDocument();
    expect(screen.getByText("对话与输入")).toBeInTheDocument();
    expect(screen.getByText("标题与首页")).toBeInTheDocument();
    expect(screen.getByText("命令与思考")).toBeInTheDocument();
    expect(screen.getByText("操作与状态")).toBeInTheDocument();
    expect(screen.getByText("文字与边界")).toBeInTheDocument();
    expect(screen.getByText("29 项 · 均支持透明度")).toBeInTheDocument();
    expect(screen.getByText("主要按钮背景")).toBeInTheDocument();
    expect(screen.getByText("主要按钮文字")).toBeInTheDocument();
    expect(screen.getByText("焦点与按钮边框")).toBeInTheDocument();
    expect(screen.getByText("选区文字")).toBeInTheDocument();
    expect(screen.getByText("输入文字")).toBeInTheDocument();
    expect(screen.getByText("输入框工具栏文字")).toBeInTheDocument();
    expect(screen.getByText("输入占位与说明文字")).toBeInTheDocument();
    expect(screen.queryByText("accentAlt")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "高级" }));
    expect(screen.getByText("accentAlt")).toBeInTheDocument();
    expect(screen.getByText("topBarBackground")).toBeInTheDocument();
    expect(screen.getByText("homeTitleText")).toBeInTheDocument();
    expect(screen.getByText("activityMuted")).toBeInTheDocument();

    const preview = document.querySelector(".mock-codex") as HTMLElement;
    const userMessageText = screen.getByRole("textbox", {
      name: "我的消息文字颜色",
    });
    const assistantPanel = screen.getByRole("textbox", {
      name: "助手回复背景颜色",
    });
    const assistantMessageText = screen.getByRole("textbox", {
      name: "助手回复文字颜色",
    });
    const changeCardBackground = screen.getByRole("textbox", {
      name: "文件变更背景颜色",
    });
    const changeCardText = screen.getByRole("textbox", {
      name: "文件变更文字颜色",
    });
    const muted = screen.getByRole("textbox", {
      name: "输入占位与说明文字颜色",
    });
    const composerText = screen.getByRole("textbox", {
      name: "输入文字颜色",
    });
    const accentText = screen.getByRole("textbox", {
      name: "主要按钮文字颜色",
    });
    const selectionText = screen.getByRole("textbox", {
      name: "选区文字颜色",
    });
    const homeTitleText = screen.getByRole("textbox", {
      name: "首页标题文字颜色",
    });
    const activityText = screen.getByRole("textbox", {
      name: "命令与思考文字颜色",
    });
    fireEvent.change(muted, { target: { value: "#4a90e2" } });
    expect(preview.style.getPropertyValue("--preview-muted")).toBe("#4a90e2");
    fireEvent.change(composerText, { target: { value: "#123456" } });
    expect(preview.style.getPropertyValue("--preview-composer-text")).toBe(
      "#123456",
    );
    fireEvent.change(accentText, { target: { value: "#234567" } });
    expect(preview.style.getPropertyValue("--preview-accent-text")).toBe(
      "#234567",
    );
    fireEvent.change(selectionText, { target: { value: "#345678" } });
    expect(preview.style.getPropertyValue("--preview-selection-text")).toBe(
      "#345678",
    );
    expect(document.querySelector(".mock-composer-input-text")).not.toBeNull();
    expect(document.querySelector(".mock-composer-placeholder")).not.toBeNull();
    expect(
      changeCardBackground.closest(".color-config")?.nextElementSibling,
    ).toBe(changeCardText.closest(".color-config"));
    expect(assistantPanel.closest(".color-config")?.nextElementSibling).toBe(
      assistantMessageText.closest(".color-config"),
    );
    const card = userMessageText.closest(".color-config");
    expect(card).not.toBeNull();

    fireEvent.mouseEnter(card!);
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "userMessageText",
    );
    fireEvent.mouseLeave(card!);
    expect(preview).not.toHaveAttribute("data-preview-color-target");

    fireEvent.click(screen.getByRole("button", { name: "首页" }));
    expect(preview).toHaveAttribute("data-preview-page", "home");
    fireEvent.focus(composerText);
    expect(preview).toHaveAttribute("data-preview-page", "home");
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "composerText",
    );
    fireEvent.blur(composerText, { relatedTarget: null });
    fireEvent.focus(userMessageText);
    expect(preview).toHaveAttribute("data-preview-page", "conversation");
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "userMessageText",
    );
    fireEvent.mouseEnter(card!);
    fireEvent.mouseLeave(card!);
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "userMessageText",
    );
    fireEvent.blur(userMessageText, { relatedTarget: null });
    expect(preview).not.toHaveAttribute("data-preview-color-target");
    expect(document.querySelector(".mock-titlebar")).toHaveAttribute(
      "data-ds-part",
      "titlebar",
    );

    fireEvent.click(screen.getByRole("button", { name: "首页" }));
    fireEvent.focus(assistantMessageText);
    expect(preview).toHaveAttribute("data-preview-page", "conversation");
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "assistantMessageText",
    );

    fireEvent.click(screen.getByRole("button", { name: "首页" }));
    fireEvent.focus(changeCardText);
    expect(preview).toHaveAttribute("data-preview-page", "conversation");
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "changeCardText",
    );

    fireEvent.focus(homeTitleText);
    expect(preview).toHaveAttribute("data-preview-page", "home");
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "homeTitleText",
    );

    fireEvent.focus(activityText);
    expect(preview).toHaveAttribute("data-preview-page", "conversation");
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "activityText",
    );
  });

  it("uses preview hotspots to locate the matching color control", async () => {
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    const preview = document.querySelector(".mock-codex") as HTMLElement;
    const userMessageText = preview.querySelector<HTMLElement>(
      '[data-preview-control-id="userMessageText"]',
    );
    expect(userMessageText).not.toBeNull();
    fireEvent.pointerMove(userMessageText!);
    expect(screen.getByText(/点击定位 · 我的消息文字/u)).toBeInTheDocument();

    fireEvent.click(userMessageText!);

    const control = await screen.findByRole("textbox", {
      name: "我的消息文字颜色",
    });
    await waitFor(() => expect(control).toHaveFocus());
    expect(screen.getByRole("tab", { name: "设计" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "颜色" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(control.closest(".color-config")).toHaveClass(
      "studio-control-located",
    );
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "userMessageText",
    );

    const reviewButton = preview.querySelector<HTMLElement>(
      ".mock-change-review",
    );
    expect(reviewButton).not.toBeNull();
    fireEvent.pointerMove(reviewButton!);
    expect(screen.getByText(/点击定位 · 主要按钮背景/u)).toBeInTheDocument();
    fireEvent.click(reviewButton!);
    const mainButtonBackground = await screen.findByRole("textbox", {
      name: "主要按钮背景颜色",
    });
    await waitFor(() => expect(mainButtonBackground).toHaveFocus());
    expect(preview).toHaveAttribute("data-preview-page", "conversation");
    expect(preview).toHaveAttribute("data-preview-color-target", "accent");

    const reviewLabel = reviewButton!.querySelector<HTMLElement>(
      ".mock-change-review-label",
    );
    fireEvent.click(reviewLabel!);
    const mainButtonText = await screen.findByRole("textbox", {
      name: "主要按钮文字颜色",
    });
    await waitFor(() => expect(mainButtonText).toHaveFocus());
    expect(preview).toHaveAttribute("data-preview-color-target", "accentText");

    const composerTextSample = preview.querySelector<HTMLElement>(
      '[data-preview-control-id="composerText"]',
    );
    expect(composerTextSample).not.toBeNull();
    fireEvent.click(composerTextSample!);
    const composerTextControl = await screen.findByRole("textbox", {
      name: "输入文字颜色",
    });
    await waitFor(() => expect(composerTextControl).toHaveFocus());
    expect(preview).toHaveAttribute(
      "data-preview-color-target",
      "composerText",
    );

    fireEvent.click(screen.getByRole("tab", { name: "组件样式" }));
    expect(screen.getByRole("tab", { name: "组件样式" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "设计" }));
    fireEvent.click(screen.getByRole("tab", { name: "画面" }));
    expect(screen.getByRole("tab", { name: "画面" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.pointerLeave(preview);
    expect(screen.queryByText(/点击定位 · 我的消息文字/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "首页" }));
    const secondCard = preview.querySelector<HTMLElement>(
      '[data-preview-control-id="homeCard1"]',
    );
    fireEvent.click(secondCard!);
    const cardControl = await waitFor(() => {
      const target = document.querySelector<HTMLElement>(
        '[data-studio-control-id="home-card-1"]',
      );
      expect(target).toHaveClass("studio-control-located");
      return target!;
    });
    expect(
      within(cardControl).getByRole("button", { name: "颜色" }),
    ).toHaveFocus();
  });

  it("configures each home shortcut card with an independent color or image", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    const imageDataUrl = "data:image/webp;base64,UklGRg==";
    api.chooseHomeCardImage.mockResolvedValue({
      ok: true,
      data: {
        ...theme,
        revision: 3,
        homeCards: theme.homeCards.map((card, index) =>
          index === 1 ? { ...card, mode: "image", imageDataUrl } : { ...card },
        ) as ThemeDetail["homeCards"],
      },
    });
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("tab", { name: "颜色" }));

    expect(screen.getByText("四张快捷卡片")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "图片" })[1]!);
    await waitFor(() =>
      expect(api.chooseHomeCardImage).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
        cardIndex: 1,
      }),
    );
    await screen.findByRole("button", { name: "更换图片" });
    fireEvent.change(screen.getByLabelText("选择探索并理解代码背景颜色"), {
      target: { value: "#123456" },
    });
    await waitFor(() =>
      expect(
        (
          document.querySelectorAll(
            '.mock-home-suggestions [data-ds-part="home-card"]',
          )[0] as HTMLElement
        ).style.backgroundColor,
      ).toBe("rgb(18, 52, 86)"),
    );
    fireEvent.change(
      screen.getByRole("slider", {
        name: "探索并理解代码背景透明度",
      }),
      { target: { value: "65" } },
    );

    const preview = document.querySelector(".mock-codex") as HTMLElement;
    expect(preview).toHaveAttribute("data-preview-page", "home");
    const cards = document.querySelectorAll(
      '.mock-home-suggestions [data-ds-part="home-card"]',
    );
    expect((cards[0] as HTMLElement).style.backgroundColor).toBe(
      "rgba(18, 52, 86, 0.65)",
    );
    expect((cards[0] as HTMLElement).style.backgroundImage).toBe("none");
    expect(cards[1]).toHaveStyle({ backgroundImage: `url("${imageDataUrl}")` });
  });

  it("offers recipe configuration without requiring CSS source edits", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "组件样式" }));
    fireEvent.click(screen.getByRole("button", { name: "配置生成" }));

    expect(
      screen.queryByRole("textbox", { name: "Safe CSS 编辑器" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /对话消息/ }));
    fireEvent.change(screen.getByRole("slider", { name: "表面圆角" }), {
      target: { value: "24" },
    });
    expect(document.querySelector(".mock-codex")).toHaveAttribute(
      "data-style-mode",
      "configured",
    );
    expect(document.querySelector(".mock-codex")).toHaveAttribute(
      "data-recipe-message",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "保存主题" }));
    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            styleConfig: expect.objectContaining({
              mode: "configured",
              radius: 24,
              recipes: expect.objectContaining({ message: false }),
            }),
          }),
        }),
      ),
    );
  });

  it("previews built-in send icons and includes the selected icon in the patch", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "组件样式" }));
    fireEvent.click(screen.getByRole("button", { name: "配置生成" }));

    const paperPlane = screen.getByRole("button", {
      name: "使用纸飞机发送图标",
    });
    fireEvent.click(paperPlane);

    expect(paperPlane).toHaveAttribute("aria-pressed", "true");
    expect(
      document.querySelector(
        '.mock-send-button [data-send-icon="paper-plane"]',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存主题" }));
    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            styleConfig: expect.objectContaining({ sendIcon: "paper-plane" }),
          }),
        }),
      ),
    );
  });

  it("uploads a custom PNG send icon through the managed file chooser", async () => {
    const iconDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
    const customTheme: ThemeDetail = {
      ...theme,
      revision: 3,
      styleConfig: {
        ...theme.styleConfig,
        mode: "configured",
        sendIcon: "custom",
        sendIconDataUrl: iconDataUrl,
      },
    };
    const api = makeApi();
    api.chooseSendIcon.mockResolvedValue({ ok: true, data: customTheme });
    api.patchDraft.mockResolvedValue({
      ok: true,
      data: { ...customTheme, revision: 4 },
    });
    window.codexStyle = api;
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "组件样式" }));
    fireEvent.click(screen.getByRole("button", { name: "配置生成" }));
    fireEvent.click(screen.getByRole("button", { name: "上传透明 PNG" }));

    await waitFor(() =>
      expect(api.chooseSendIcon).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
      }),
    );
    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedRevision: 3,
          patch: expect.objectContaining({
            styleConfig: expect.objectContaining({
              sendIcon: "custom",
              sendIconDataUrl: iconDataUrl,
            }),
          }),
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "使用自定义发送图标" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      document.querySelector('.mock-send-button [data-send-icon="custom"]'),
    ).toBeInTheDocument();
  });

  it("keeps theme.json inert until the main process validates and applies it", async () => {
    const api = makeApi();
    api.patchDraft.mockImplementation(async (request) => {
      const source = request.patch.themeJson;
      if (!source) return { ok: true, data: { ...theme, revision: 3 } };
      const json = JSON.parse(source) as Record<string, unknown>;
      return {
        ok: true,
        data: {
          ...theme,
          revision: 3,
          name: String(json.name),
          appearance: json.appearance as ThemeDetail["appearance"],
          json,
        },
      };
    });
    window.codexStyle = api;
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "高级配置" }));
    const editor = screen.getByRole("textbox", {
      name: "theme.json 编辑器",
    });
    const json = JSON.parse((editor as HTMLTextAreaElement).value) as Record<
      string,
      unknown
    >;
    json.name = "JSON Applied";
    json.appearance = "light";
    const source = JSON.stringify(json, null, 2);
    fireEvent.change(editor, { target: { value: source } });

    expect(screen.getByRole("button", { name: "保存主题" })).toBeDisabled();
    expect(screen.queryByDisplayValue("JSON Applied")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "校验并应用" }));

    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
        patch: { themeJson: source },
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "设计" }));
    expect(await screen.findByDisplayValue("JSON Applied")).toBeInTheDocument();
  });

  it("rejects malformed theme.json locally without sending a patch", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "高级配置" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "theme.json 编辑器" }),
      { target: { value: "{ broken" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "校验并应用" }));

    expect(
      await screen.findByText("JSON 语法无效，请检查括号、逗号和引号。"),
    ).toBeInTheDocument();
    expect(api.patchDraft).not.toHaveBeenCalled();
  });

  it("patches before commit so revisions cannot go stale", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "组件样式" }));
    const editor = await screen.findByRole("textbox", {
      name: "Safe CSS 编辑器",
    });
    fireEvent.change(editor, {
      target: { value: '[data-ds-part="root"] { color: #22c55e; }' },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存主题" }));
    await waitFor(() => expect(api.patchDraft).toHaveBeenCalled());
    await waitFor(() =>
      expect(api.commit).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevision: 3 }),
      ),
    );
  });

  it("exports the complete current theme package without dropping colors", async () => {
    const api = makeApi();
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("button", { name: "导出主题 ZIP" }));

    await waitFor(() =>
      expect(api.exportZip).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
        format: "simplified",
      }),
    );
  });

  it("exposes original formal export and the unverified-signature warning", async () => {
    const formalTheme: ThemeDetail = {
      ...theme,
      packageFormat: "formal",
      validation: {
        ...theme.validation,
        warnings: ["signature-unverified"],
      },
    };
    const formalSnapshot: ThemeSnapshot = {
      ...snapshot,
      themes: [{ ...snapshot.themes[0], ...formalTheme }],
    };
    const api = makeApi();
    api.getSnapshot.mockResolvedValue({ ok: true, data: formalSnapshot });
    api.getTheme.mockResolvedValue({ ok: true, data: formalTheme });
    api.exportZip.mockResolvedValue({
      ok: true,
      data: { cancelled: false, format: "formal" },
    });
    window.codexStyle = api;

    render(<App />);
    expect(
      await screen.findByText(/当前版本不会验证签名/u),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导出原始正式 ZIP" }));

    await waitFor(() =>
      expect(api.exportZip).toHaveBeenCalledWith({
        libraryId: formalTheme.libraryId,
        expectedRevision: formalTheme.revision,
        format: "formal",
      }),
    );
  });

  it("persists changed draft fields after a background is selected", async () => {
    const api = makeApi();
    api.patchDraft.mockResolvedValue({
      ok: true,
      data: { ...theme, revision: 4, name: "Prepared Copper" },
    });
    api.chooseBackground.mockResolvedValue({
      ok: true,
      data: { ...theme, revision: 3 },
    });
    window.codexStyle = api;

    render(<App />);
    const nameInput = await screen.findByDisplayValue("Midnight Copper");
    fireEvent.change(nameInput, { target: { value: "Prepared Copper" } });
    fireEvent.click(screen.getByRole("tab", { name: "画面" }));
    fireEvent.click(screen.getByRole("button", { name: "选择图片" }));

    await waitFor(() =>
      expect(api.chooseBackground).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
      }),
    );
    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: 3,
        patch: expect.objectContaining({ name: "Prepared Copper" }),
      }),
    );
    expect(api.chooseBackground.mock.invocationCallOrder[0]).toBeLessThan(
      api.patchDraft.mock.invocationCallOrder[0],
    );
  });

  it("does not persist unrelated draft changes when the picker is canceled", async () => {
    const api = makeApi();
    api.chooseBackground.mockResolvedValue({
      ok: false,
      error: { code: "CANCELLED", messageKey: "dialog.cancelled" },
    });
    window.codexStyle = api;
    render(<App />);
    const nameInput = await screen.findByDisplayValue("Midnight Copper");
    fireEvent.change(nameInput, { target: { value: "Still local" } });
    fireEvent.click(screen.getByRole("tab", { name: "画面" }));
    fireEvent.click(screen.getByRole("button", { name: "选择图片" }));

    await waitFor(() => expect(api.chooseBackground).toHaveBeenCalled());
    expect(api.patchDraft).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "＋ 新建主题" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("tab", { name: "基础" }));
    expect(screen.getByDisplayValue("Still local")).toBeInTheDocument();
  });

  it("refreshes the selected theme detail after a studio state event", async () => {
    const refreshedTheme: ThemeDetail = {
      ...theme,
      name: "Refreshed Copper",
      revision: 3,
    };
    const api = makeApi();
    api.getTheme
      .mockResolvedValueOnce({ ok: true, data: theme })
      .mockResolvedValueOnce({ ok: true, data: refreshedTheme });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    const listener = api.onStateChanged.mock.calls[0]?.[0];
    expect(listener).toBeTypeOf("function");

    await act(async () => {
      listener?.({
        ...snapshot,
        themes: [{ ...snapshot.themes[0], revision: refreshedTheme.revision }],
      });
    });

    await waitFor(() =>
      expect(api.getTheme).toHaveBeenLastCalledWith({
        libraryId: theme.libraryId,
      }),
    );
    expect(await screen.findByDisplayValue("Refreshed Copper")).toBeVisible();
  });

  it("creates a local draft and keeps edited form values in the patch request", async () => {
    const draftTheme: ThemeDetail = {
      ...theme,
      libraryId: "22222222-2222-4222-8222-222222222222",
      name: "新主题",
      status: "draft",
      revision: 0,
    };
    const api = makeApi();
    api.createDraft.mockResolvedValue({ ok: true, data: draftTheme });
    api.getTheme.mockImplementation(async ({ libraryId }) => ({
      ok: true,
      data: libraryId === draftTheme.libraryId ? draftTheme : theme,
    }));
    api.patchDraft.mockResolvedValue({
      ok: true,
      data: { ...draftTheme, name: "Personal Studio Theme", revision: 1 },
    });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("button", { name: "＋ 新建主题" }));
    const nameInput = await screen.findByDisplayValue("新主题");
    fireEvent.change(nameInput, {
      target: { value: "Personal Studio Theme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存主题" }));

    await waitFor(() =>
      expect(api.patchDraft).toHaveBeenCalledWith({
        libraryId: draftTheme.libraryId,
        expectedRevision: 0,
        patch: expect.objectContaining({ name: "Personal Studio Theme" }),
      }),
    );
  });

  it("selects a saved theme for the next launch on double click", async () => {
    const api = makeApi();
    api.selectForNextLaunch.mockResolvedValue({
      ok: true,
      data: { ...snapshot, selectedLibraryId: theme.libraryId },
    });
    window.codexStyle = api;

    render(<App />);
    const row = await screen.findByRole("button", { name: /Midnight Copper/u });
    fireEvent.doubleClick(row);

    await waitFor(() =>
      expect(api.selectForNextLaunch).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
      }),
    );
  });

  it("deletes a theme only after explicit confirmation", async () => {
    const api = makeApi();
    api.deleteTheme.mockResolvedValue({
      ok: true,
      data: { ...snapshot, themes: [] },
    });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("button", { name: "删除主题" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Midnight Copper");
    expect(api.deleteTheme).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(api.deleteTheme).toHaveBeenCalledWith({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
      }),
    );
  });

  it("blocks managed-session launch until a theme is explicitly selected", async () => {
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    expect(
      screen.getByRole("region", { name: "Codex 会话启动" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Codex 会话" })).toBeNull();
    expect(screen.getByRole("button", { name: "启动 Codex" })).toBeDisabled();
    expect(
      (window.codexStyle as ReturnType<typeof makeApi>).launchSession,
    ).not.toHaveBeenCalled();
  });

  it("describes recovered ownership state without exposing orphan terminology", async () => {
    const api = makeApi();
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: {
        ...snapshot,
        session: {
          state: "ORPHANED",
          messageKey: "session.orphaned",
          canEnd: false,
          launchedByTool: false,
        },
      },
    });
    window.codexStyle = api;

    render(<App />);
    const launcher = await screen.findByRole("region", {
      name: "Codex 会话启动",
    });
    expect(
      within(launcher).getAllByText("上次会话待确认").length,
    ).toBeGreaterThan(0);
    expect(
      within(launcher).getByText(/当前无法安全确认它仍受控/u),
    ).toBeInTheDocument();
    expect(screen.queryByText(/孤儿/u)).toBeNull();
  });

  it.each([
    {
      state: "LAUNCHING",
      label: "启动中",
      copy: /正在通过 Microsoft Store 注册入口启动 Codex/u,
    },
    {
      state: "INJECTING",
      label: "注入中",
      copy: /正在安全应用所选主题/u,
    },
  ] as const)(
    "shows matching copy while the session is $label",
    async (item) => {
      const api = makeApi();
      api.getSnapshot.mockResolvedValue({
        ok: true,
        data: {
          ...snapshot,
          session: {
            state: item.state,
            messageKey: `session.${item.state.toLowerCase()}`,
            canEnd: false,
            launchedByTool: true,
          },
        },
      });
      window.codexStyle = api;

      render(<App />);
      const launcher = await screen.findByRole("region", {
        name: "Codex 会话启动",
      });
      expect(within(launcher).getAllByText(item.label).length).toBeGreaterThan(
        0,
      );
      expect(within(launcher).getByText(item.copy)).toBeInTheDocument();
    },
  );

  it("allows a selected theme to launch from the theme design page", async () => {
    const api = makeApi();
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, selectedLibraryId: theme.libraryId },
    });
    api.launchSession.mockResolvedValue({
      ok: true,
      data: { ...snapshot, selectedLibraryId: theme.libraryId },
    });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    const launch = screen.getByRole("button", { name: "启动 Codex" });
    expect(launch).toBeEnabled();
    fireEvent.click(launch);

    await waitFor(() => expect(api.launchSession).toHaveBeenCalledTimes(1));
  });

  it("leaves downstream launch checks pending when Store package lookup fails", async () => {
    const api = makeApi();
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: {
        ...snapshot,
        selectedLibraryId: theme.libraryId,
        session: {
          state: "INCOMPATIBLE",
          messageKey: "session.storePackageNotFound",
          canEnd: false,
          launchedByTool: false,
        },
      },
    });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    expect(
      screen.getByText("Store Codex 可启动").closest(".check-row"),
    ).toHaveTextContent("未通过");
    expect(
      screen.getByText("会话可安全管理").closest(".check-row"),
    ).toHaveTextContent("等待");
    expect(
      screen.getByText("主题与当前版本兼容").closest(".check-row"),
    ).toHaveTextContent("等待");
  });

  it("shows a settled launch failure without claiming CDP checks ran", async () => {
    const api = makeApi();
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: {
        ...snapshot,
        selectedLibraryId: theme.libraryId,
        session: {
          state: "INCOMPATIBLE",
          messageKey: "session.launchFailed",
          canEnd: false,
          launchedByTool: false,
        },
      },
    });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    expect(
      screen.getByText("Store Codex 可启动").closest(".check-row"),
    ).toHaveTextContent("未通过");
    expect(
      screen.getByText("会话可安全管理").closest(".check-row"),
    ).toHaveTextContent("等待");
    expect(
      screen.getByText("主题与当前版本兼容").closest(".check-row"),
    ).toHaveTextContent("等待");
    expect(screen.getByText(/Windows 启动调用失败/u)).toBeInTheDocument();
  });

  it.each([
    {
      messageKey: "session.cdpUnavailable",
      message: /未在等待时间内打开可验证的 127\.0\.0\.1 CDP 端口/u,
      ownership: "未通过",
      compatibility: "等待",
    },
    {
      messageKey: "session.identityMismatch",
      message: /PID、用户身份、启动参数或 Browser ID 不匹配/u,
      ownership: "未通过",
      compatibility: "等待",
    },
    {
      messageKey: "session.targetIncompatible",
      message: /本地 CDP 已验证，但当前 Codex 页面结构/u,
      ownership: "通过",
      compatibility: "未通过",
    },
  ])(
    "explains the actionable startup stage for $messageKey",
    async ({ messageKey, message, ownership, compatibility }) => {
      const api = makeApi();
      api.getSnapshot.mockResolvedValue({
        ok: true,
        data: {
          ...snapshot,
          selectedLibraryId: theme.libraryId,
          session: {
            state: "INCOMPATIBLE",
            messageKey,
            canEnd: false,
            launchedByTool: false,
          },
        },
      });
      window.codexStyle = api;

      render(<App />);
      await screen.findByDisplayValue("Midnight Copper");

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(
        screen.getByText("会话可安全管理").closest(".check-row"),
      ).toHaveTextContent(ownership);
      expect(
        screen.getByText("主题与当前版本兼容").closest(".check-row"),
      ).toHaveTextContent(compatibility);
    },
  );

  it("shows a same-ID import conflict and resolves it only after an explicit choice", async () => {
    const conflict: ImportResult = {
      status: "conflict",
      transactionId: "33333333-3333-4333-8333-333333333333",
      name: "Conflict Copper",
      conflictLibraryId: theme.libraryId,
      conflictRevision: theme.revision,
      packageFormat: "simplified",
    };
    const api = makeApi();
    api.importZip.mockResolvedValue({ ok: true, data: conflict });
    api.resolveImport.mockResolvedValue({
      ok: true,
      data: {
        status: "imported",
        libraryId: "44444444-4444-4444-8444-444444444444",
      },
    });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("button", { name: "导入 ZIP" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "发现同 ID 主题",
    );
    expect(api.resolveImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保留两份" }));

    await waitFor(() =>
      expect(api.resolveImport).toHaveBeenCalledWith({
        transactionId: conflict.transactionId,
        action: "keep-both",
      }),
    );
  });

  it("disables competing operations while an import is pending and reports API errors", async () => {
    let settleImport: ((result: Result<ImportResult>) => void) | undefined;
    const api = makeApi();
    api.importZip.mockImplementation(
      () =>
        new Promise<Result<ImportResult>>((resolve) => {
          settleImport = resolve;
        }),
    );
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("button", { name: "导入 ZIP" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "＋ 新建主题" }),
      ).toBeDisabled(),
    );
    settleImport?.({
      ok: false,
      error: { code: "UNSAFE_ARCHIVE", messageKey: "error.unsafe_archive" },
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "ZIP 未通过安全或格式校验。",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "＋ 新建主题" })).toBeEnabled(),
    );
  });

  it("does not place unsaved CSS text into the preview document", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "组件样式" }));
    const editor = await screen.findByRole("textbox", {
      name: "Safe CSS 编辑器",
    });
    const untrusted = '<img src="x" onerror="window.__unsafe = true">';
    fireEvent.change(editor, { target: { value: untrusted } });

    await waitFor(() =>
      expect(screen.getByText("CSS 将在保存时校验")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "保存主题" })).toBeEnabled();
    const previewStyle = document.querySelector(".mock-codex style");
    expect(previewStyle?.textContent).not.toContain(untrusted);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it("blocks CSS that exceeds the UTF-8 patch limit before IPC", async () => {
    const api = window.codexStyle as ReturnType<typeof makeApi>;
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "组件样式" }));
    const editor = await screen.findByRole("textbox", {
      name: "Safe CSS 编辑器",
    });
    fireEvent.change(editor, { target: { value: "你".repeat(90_000) } });

    expect(editor).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("CSS 不能超过 262,144 个字符或 256 KiB。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存主题" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出主题 ZIP" })).toBeDisabled();
    expect(api.patchDraft).not.toHaveBeenCalled();
    expect(api.exportZip).not.toHaveBeenCalled();
  });

  it("offers recovery when the persisted pause has no owned session", async () => {
    const api = makeApi();
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, paused: true },
    });
    api.resumeSession.mockResolvedValue({
      ok: true,
      data: { ...snapshot, paused: false },
    });
    window.codexStyle = api;

    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");
    fireEvent.click(screen.getByRole("button", { name: "恢复后续注入" }));

    await waitFor(() => expect(api.resumeSession).toHaveBeenCalledOnce());
  });
});
