// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CodexStyleApi,
  ImportResult,
  Result,
  ThemeDetail,
  ThemeSnapshot,
} from "../../src/contracts";
import { App } from "../../src/renderer/app/App";

const theme: ThemeDetail = {
  libraryId: "11111111-1111-4111-8111-111111111111",
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
    panelAlt: "#2d2d2d",
    assistantPanel: "#2d2d2d",
    accent: "#f59e0b",
    accentAlt: "#d9d9d9",
    secondary: "#808080",
    highlight: "#f2f2f2",
    text: "#ffffff",
    muted: "rgba(255, 255, 255, .498)",
    line: "rgba(255, 255, 255, .157)",
  },
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
  hasBackground: true,
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
      hasBackground: true,
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
};

function makeApi() {
  const api = {
    getSnapshot: vi.fn().mockResolvedValue({ ok: true, data: snapshot }),
    getTheme: vi.fn().mockResolvedValue({ ok: true, data: theme }),
    createDraft: vi.fn(),
    patchDraft: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...theme, revision: 3 } }),
    chooseBackground: vi.fn(),
    chooseSendIcon: vi.fn(),
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
  });

  it("offers a verified GitHub release after a manual update check", async () => {
    const api = makeApi();
    const available = {
      configured: true as const,
      status: "available" as const,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.1.0",
      checkedAt: "2026-08-26T08:00:00.000Z",
    };
    api.requestUpdate.mockResolvedValue({ ok: true, data: available });
    api.getSnapshot.mockResolvedValue({
      ok: true,
      data: { ...snapshot, update: available },
    });
    api.openUpdatePage.mockResolvedValue({ ok: true, data: available });
    window.codexStyle = api;

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "检查更新" }));

    expect(await screen.findByText("新版本 v1.1.0 已发布")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开下载页面" }));
    await waitFor(() => expect(api.openUpdatePage).toHaveBeenCalledOnce());
    expect(
      await screen.findByText("已打开 GitHub Release 下载页面。"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "检查更新" })).toBeEnabled(),
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

  it("applies a built-in theme preset without replacing theme identity", async () => {
    render(<App />);
    await screen.findByDisplayValue("Midnight Copper");

    const auroraPreset = screen.getByRole("button", {
      name: "应用极光青预设",
    });
    fireEvent.click(auroraPreset);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "应用极光青预设" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "颜色" }));

    await waitFor(() =>
      expect(screen.getByLabelText("背景颜色")).toHaveValue("#071b22"),
    );
    expect(screen.getByLabelText("强调颜色")).toHaveValue("#5eead4");
    fireEvent.click(screen.getByRole("tab", { name: "基础" }));
    expect(screen.getByDisplayValue("Midnight Copper")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "应用极光青预设" }),
    ).toHaveAttribute("aria-pressed", "true");
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
    const accentPicker = screen.getByLabelText("选择强调颜色");
    expect(accentPicker).toHaveValue("#f59e0b");
    fireEvent.change(accentPicker, {
      target: { value: "#336699" },
    });
    expect(screen.getByRole("textbox", { name: "强调颜色" })).toHaveValue(
      "#336699",
    );
    fireEvent.change(screen.getByRole("slider", { name: "强调透明度" }), {
      target: { value: "42" },
    });
    expect(screen.getByRole("textbox", { name: "强调颜色" })).toHaveValue(
      "rgba(51, 102, 153, 0.42)",
    );
    expect(screen.getByRole("textbox", { name: "侧栏文字颜色" })).toHaveValue(
      "#ffffff",
    );
    fireEvent.change(screen.getByRole("slider", { name: "助手面板透明度" }), {
      target: { value: "36" },
    });
    expect(screen.getByRole("textbox", { name: "助手面板颜色" })).toHaveValue(
      "rgba(45, 45, 45, 0.36)",
    );

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
          }),
        }),
      }),
    );
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

  it("exports an edited formal import as a simplified compatibility package", async () => {
    const formalTheme: ThemeDetail = {
      ...theme,
      packageFormat: "formal",
      name: "Signed Copper",
    };
    const formalSnapshot: ThemeSnapshot = {
      ...snapshot,
      themes: [{ ...snapshot.themes[0], ...formalTheme }],
    };
    const api = makeApi();
    api.getSnapshot.mockResolvedValue({ ok: true, data: formalSnapshot });
    api.getTheme.mockResolvedValue({ ok: true, data: formalTheme });
    api.patchDraft.mockResolvedValue({
      ok: true,
      data: { ...formalTheme, revision: 3 },
    });
    window.codexStyle = api;

    render(<App />);
    const nameInput = await screen.findByDisplayValue("Signed Copper");
    fireEvent.change(nameInput, { target: { value: "Edited Copper" } });
    fireEvent.click(screen.getByRole("button", { name: "导出兼容 ZIP" }));

    await waitFor(() => expect(api.patchDraft).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(api.exportZip).toHaveBeenCalledWith(
        expect.objectContaining({
          libraryId: formalTheme.libraryId,
          expectedRevision: 3,
          format: "simplified",
        }),
      ),
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
    fireEvent.click(screen.getByRole("tab", { name: "Codex 会话" }));

    expect(screen.getByRole("button", { name: "启动 Codex" })).toBeDisabled();
    expect(
      (window.codexStyle as ReturnType<typeof makeApi>).launchSession,
    ).not.toHaveBeenCalled();
  });

  it("allows a selected theme to launch only from the managed-session view", async () => {
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
    fireEvent.click(screen.getByRole("tab", { name: "Codex 会话" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Codex 会话" }));

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
    fireEvent.click(screen.getByRole("tab", { name: "Codex 会话" }));

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
      expect(screen.getByText("需要修正 CSS")).toBeInTheDocument(),
    );
    const previewStyle = document.querySelector(".mock-codex style");
    expect(previewStyle?.textContent).not.toContain(untrusted);
    expect(document.querySelector('img[src="x"]')).toBeNull();
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
    fireEvent.click(screen.getByRole("tab", { name: "Codex 会话" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复后续注入" }));

    await waitFor(() => expect(api.resumeSession).toHaveBeenCalledOnce());
  });
});
