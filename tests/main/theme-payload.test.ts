// @vitest-environment jsdom
// @vitest-environment-options {"url":"app://codex/"}

import { describe, expect, it } from "vitest";
import { readThemeConfiguration } from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

const defaultConfiguration = readThemeConfiguration({});

describe("theme payload", () => {
  it("maps the selector profile without invoking page-owned cleanup", () => {
    resetDocument();
    expect(defaultConfiguration.styleConfig.mode).toBe("advanced");
    let cleanupCalls = 0;
    const mutationObserver = Object.getOwnPropertyDescriptor(
      window,
      "MutationObserver",
    );
    Object.defineProperty(window, "MutationObserver", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "__CODEXSTYLE_THEME_STATE__", {
      configurable: true,
      value: { cleanup: () => (cleanupCalls += 1) },
    });
    try {
      const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
      window.eval(
        buildThemePayload(
          marker,
          '[data-ds-part="root"] { color: #fff; }',
          "data:image/png;base64,AA==",
        ),
      );

      const root = document.documentElement;
      const canvas = document.body;
      const sidebar = document.querySelector("aside");
      const titlebar = document.querySelector(
        '[class*="_ApplicationMenuTopBar_"]',
      );
      const header = document.querySelector("header");
      const composer = document.querySelector(
        "[data-composer-surface-variant]",
      );
      const composerToolbar = document.querySelector(
        "[data-composer-footer-responsive]",
      );
      const composerSubmit = document.querySelector(
        'button[class~="bg-primary-solid"]',
      );
      const mainTopFade = document.querySelector(
        "[data-app-shell-main-content-top-fade]",
      );
      const composerBackdrop = document.querySelector(
        '[class~="bg-gradient-to-t"]',
      );
      const userMessage = document.querySelector(
        '[data-user-message-bubble="true"]',
      );
      const assistantMessage = document.querySelector(
        '[data-markdown-text-style="assistant-message"]',
      );
      const legacyMessageWrapper = document.querySelector(
        "[data-local-conversation-final-assistant]",
      );
      const style = document.querySelector(
        `style[data-codexstyle-owner="${marker}"]`,
      );
      expect(cleanupCalls).toBe(0);
      expect(root.getAttribute("data-ds-part")).toBe("root");
      expect(canvas.getAttribute("data-ds-part")).toBe("canvas");
      expect(sidebar?.getAttribute("data-ds-part")).toBe("sidebar");
      expect(titlebar?.getAttribute("data-ds-part")).toBe("titlebar");
      expect(header?.getAttribute("data-ds-part")).toBe("header");
      expect(composer?.getAttribute("data-ds-part")).toBe("composer");
      expect(composerToolbar?.getAttribute("data-ds-part")).toBe(
        "composer-toolbar",
      );
      expect(composerSubmit?.getAttribute("data-ds-part")).toBe(
        "composer-submit",
      );
      expect(mainTopFade?.getAttribute("data-ds-part")).toBe("main-top-fade");
      expect(composerBackdrop?.getAttribute("data-ds-part")).toBe(
        "composer-backdrop",
      );
      expect(userMessage?.getAttribute("data-ds-part")).toBe("message");
      expect(assistantMessage?.getAttribute("data-ds-part")).toBe("message");
      expect(legacyMessageWrapper?.getAttribute("data-ds-part")).toBeNull();
      expect(style?.getAttribute("data-codexstyle-style")).toBe("1");
      expect(style?.textContent).toContain("data:image/png;base64,AA==");
      expect(style?.textContent).toContain('data-ds-part="root"');
      expect(style?.textContent).toContain('data-ds-part="canvas"');
      expect(style?.textContent).toContain(
        "background-attachment: fixed !important",
      );
      expect(style?.textContent).toContain(
        "background-color: color-mix(in srgb, var(--ds-theme-color-panel) 75%, transparent) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-sidebar-text) !important",
      );
      expect(style?.textContent).toContain(
        "background-color: var(--ds-theme-color-top-bar-background) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-user-message-text) !important",
      );
    } finally {
      if (mutationObserver)
        Object.defineProperty(window, "MutationObserver", mutationObserver);
      else
        delete (window as Window & { MutationObserver?: unknown })
          .MutationObserver;
      delete (window as Window & { __CODEXSTYLE_THEME_STATE__?: unknown })
        .__CODEXSTYLE_THEME_STATE__;
    }
  });

  it("targets only the main surface in content mode", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";

    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          backgroundScope: "content",
          sidebarOverlayOpacity: 30,
        },
      ),
    );

    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).toContain(
      `[data-ds-part="main"][data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).not.toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-panel) 30%, transparent)",
    );
    expect(style?.textContent).not.toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-background) 88%, transparent)",
    );
    expect(style?.textContent).not.toContain('data-ds-part="main-top-fade"');
  });

  it("uses the configured sidebar overlay in window mode", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";

    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="sidebar"] { background-color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          backgroundScope: "window",
          sidebarOverlayOpacity: 42,
        },
      ),
    );

    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-panel) 42%, transparent) !important",
    );
    expect(style?.textContent).toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-background) 88%, transparent) !important",
    );
    expect(style?.textContent).toContain('data-ds-part="main-top-fade"');
    expect(style?.textContent).toContain(
      '.thread-scroll-container [aria-hidden="true"][class~="bg-gradient-to-t"]',
    );
    expect(style?.textContent).toContain(
      "background-color: transparent !important; background-image: none !important",
    );
    expect(style?.textContent).not.toContain("linear-gradient(to top");
    expect(style?.textContent?.lastIndexOf("42%")).toBeGreaterThan(
      style?.textContent?.lastIndexOf("#fff") ?? -1,
    );
  });

  it("places window artwork on the body canvas above its fallback color", () => {
    resetDocument();
    document.body.style.backgroundColor = "rgb(12, 34, 56)";
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";

    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          art: { ...defaultConfiguration.art, taskMode: "full" },
          backgroundScope: "window",
          sidebarOverlayOpacity: 75,
        },
      ),
    );

    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(document.body.getAttribute("data-ds-part")).toBe("canvas");
    expect(style?.textContent).toContain(
      `[data-ds-part="root"][data-codexstyle-owner="${marker}"], [data-ds-part="canvas"][data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).toContain(
      'url("data:image/png;base64,AA==") !important',
    );
    expect(getComputedStyle(document.body).backgroundImage).toContain(
      "data:image/png;base64,AA==",
    );
  });

  it("covers a recreated bottom fade before selector remapping runs", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
      ),
    );

    const selector =
      '.thread-scroll-container [aria-hidden="true"][class~="bg-gradient-to-t"][class~="from-surface"][class~="via-surface"]';
    document.querySelector(selector)?.remove();
    const replacement = document.createElement("div");
    replacement.setAttribute("aria-hidden", "true");
    replacement.className = "bg-gradient-to-t from-surface via-surface";
    document.querySelector(".thread-scroll-container")?.append(replacement);

    expect(replacement.getAttribute("data-ds-part")).toBeNull();
    expect(replacement.matches(selector)).toBe(true);
    expect(
      document.querySelector(`style[data-codexstyle-owner="${marker}"]`)
        ?.textContent,
    ).toContain(selector);
  });

  it("adds balanced padding to configured assistant message cards", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";

    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="message"] { background-color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          backgroundScope: "window",
          sidebarOverlayOpacity: 75,
          styleConfig: {
            ...defaultConfiguration.styleConfig,
            mode: "configured",
          },
        },
      ),
    );

    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).toContain(
      'data-markdown-text-style="assistant-message"',
    );
    expect(style?.textContent).toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-assistant-panel) 92%, transparent) !important",
    );
    expect(style?.textContent).toContain("padding: 12px 16px");
    expect(style?.textContent).toContain(
      "background-color: var(--ds-theme-color-top-bar-background) !important",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-top-bar-text) !important",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-user-message-text) !important",
    );
    expect(style?.textContent).toContain(
      "--ds-theme-color-top-bar-background: rgba(0, 0, 0, 0)",
    );
  });

  it("keeps top bar and user message text controls active when message surfaces are disabled", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          backgroundScope: "window",
          sidebarOverlayOpacity: 75,
          styleConfig: {
            ...defaultConfiguration.styleConfig,
            mode: "configured",
            recipes: {
              ...defaultConfiguration.styleConfig.recipes,
              message: false,
            },
          },
        },
      ),
    );

    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).toContain(
      "background-color: var(--ds-theme-color-top-bar-background) !important",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-user-message-text) !important",
    );
    expect(style?.textContent).not.toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-panel-alt) 92%, transparent) !important",
    );
    expect(style?.textContent).not.toContain(
      'data-markdown-text-style="assistant-message"',
    );
  });

  it("replaces only the send-state glyph for a built-in icon", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          backgroundScope: "window",
          sidebarOverlayOpacity: 75,
          styleConfig: {
            ...defaultConfiguration.styleConfig,
            mode: "configured",
            sendIcon: "paper-plane",
          },
        },
      ),
    );

    const submit = document.querySelector('button[class~="bg-primary-solid"]');
    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(submit?.getAttribute("data-ds-part")).toBe("composer-submit");
    expect(style?.textContent).toContain('data-ds-part="composer-submit"');
    expect(style?.textContent).toContain("mask-image: url(");
    expect(style?.textContent).toContain("svg { display: none");
    expect(style?.textContent).not.toContain('aria-label*="停止"');
    expect(style?.textContent).toContain(
      "background-color: var(--ds-theme-color-accent) !important",
    );
    expect(style?.textContent).toContain(
      "border-color: var(--ds-theme-color-accent-alt) !important",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-secondary) !important",
    );
    expect(style?.textContent).toContain(
      "background-color: var(--ds-theme-color-highlight)",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-top-bar-text) !important",
    );
  });

  it("applies appearance, focus, safe area, and task mode to the real payload", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";

    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          appearance: "light",
          art: {
            focusX: 0.23,
            focusY: 0.81,
            safeArea: "right",
            taskMode: "full",
          },
          backgroundScope: "window",
          sidebarOverlayOpacity: 75,
        },
      ),
    );

    const root = document.documentElement;
    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(root.getAttribute("data-codexstyle-appearance")).toBe("light");
    expect(root.getAttribute("data-codexstyle-safe-area")).toBe("right");
    expect(root.getAttribute("data-codexstyle-task-mode")).toBe("full");
    expect(style?.textContent).toContain("background-position: 23% 81%");
    expect(style?.textContent).toContain("linear-gradient(270deg");
    expect(style?.textContent).toContain("color-scheme: light");
    expect(style?.textContent).toContain("--ds-theme-color-accent:");
  });

  it("removes the background layer when task artwork is disabled", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          art: { ...defaultConfiguration.art, taskMode: "off" },
          backgroundScope: "content",
          sidebarOverlayOpacity: 75,
        },
      ),
    );
    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).toContain("background-image: none");
  });

  it("keeps the main surface opaque when window artwork is disabled", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="main"] { background-color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          art: { ...defaultConfiguration.art, taskMode: "off" },
          backgroundScope: "window",
          sidebarOverlayOpacity: 75,
        },
      ),
    );
    const style = document.querySelector(
      `style[data-codexstyle-owner="${marker}"]`,
    );
    expect(style?.textContent).toContain("background-image: none");
    expect(style?.textContent).not.toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-background) 88%, transparent)",
    );
  });

  it("fails closed when the target already owns the root mapping", () => {
    resetDocument("");
    document.documentElement.setAttribute("data-ds-part", "host-root");
    try {
      const result = window.eval(
        buildThemePayload(
          "codexstyle-00000000-0000-4000-8000-000000000000",
          '[data-ds-part="root"] { color: #fff; }',
          "data:image/png;base64,AA==",
        ),
      );
      expect(result).toBe(false);
      expect(document.querySelector("style[data-codexstyle-style]")).toBeNull();
    } finally {
      document.documentElement.removeAttribute("data-ds-part");
    }
  });
});

function resetDocument(
  body = '<div class="_ApplicationMenuTopBar_fixture"><button>文件</button></div><aside class="app-shell-left-panel"></aside><main class="main-surface"><header class="app-header-tint"><span>主题会话</span></header><div data-app-shell-main-content-top-fade="full-bleed"></div><div class="thread-scroll-container"><div aria-hidden="true" class="bg-gradient-to-t from-surface via-surface"></div></div><div data-local-conversation-user-anchor="true"><div data-user-message-bubble="true"><span>用户消息</span></div></div><div data-local-conversation-final-assistant="true"><div data-markdown-text-style="assistant-message"></div></div><div data-codex-composer-root><div data-composer-surface-variant="default"><div data-composer-footer-responsive></div><button class="bg-primary-solid" aria-label="发送"><svg></svg></button></div></div></main>',
) {
  document.head.innerHTML = "";
  document.body.innerHTML = body;
  document.documentElement.removeAttribute("data-ds-part");
  document.documentElement.removeAttribute("data-codexstyle-owner");
  document.documentElement.removeAttribute("data-codexstyle-part");
  document.body.removeAttribute("data-ds-part");
  document.body.removeAttribute("data-codexstyle-owner");
  document.body.removeAttribute("data-codexstyle-part");
  document.body.removeAttribute("style");
}
