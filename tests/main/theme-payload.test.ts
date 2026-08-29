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
      const threadTab = document.querySelector('[role="tab"]');
      const threadTabController = document.querySelector(
        "[data-app-shell-tab-controller]",
      );
      const threadTabSurface = document.querySelector('[class~="group/tab"]');
      const threadTitleSurface = document.querySelector(
        '[data-testid="thread-title-surface"]',
      );
      const homeTitle = document.querySelector('[data-feature="game-source"]');
      const homeCards = document.querySelectorAll(
        'section[class~="group/home-suggestions"] button',
      );
      const activity = document.querySelector(
        '[class~="group/activity-header"]',
      );
      const composer = document.querySelector(
        "[data-composer-surface-variant]",
      );
      const homeComposerRail = document.querySelector(
        "[data-composer-rail-item]",
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
      expect(threadTab?.getAttribute("data-ds-part")).toBe("thread-tab");
      expect(threadTabController?.getAttribute("data-ds-part")).toBe(
        "thread-tab",
      );
      expect(threadTabSurface?.getAttribute("data-ds-part")).toBe("thread-tab");
      expect(threadTitleSurface?.getAttribute("data-ds-part")).toBe(
        "thread-tab",
      );
      expect(homeTitle?.getAttribute("data-ds-part")).toBe("home-title");
      expect(homeCards).toHaveLength(4);
      expect(
        [...homeCards].map((card) =>
          card.getAttribute("data-codexstyle-home-card-index"),
        ),
      ).toEqual(["0", "1", "2", "3"]);
      expect(activity?.getAttribute("data-ds-part")).toBe("activity");
      expect(composer?.getAttribute("data-ds-part")).toBe("composer");
      expect(homeComposerRail?.getAttribute("data-ds-part")).toBe("composer");
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
        "background-color: var(--ds-theme-color-thread-tab-background) !important",
      );
      expect(style?.textContent).toContain(
        "--app-shell-tab-background: var(--ds-theme-color-thread-tab-background) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-thread-tab-text) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-home-title-text) !important",
      );
      expect(style?.textContent).toContain(
        'data-codexstyle-home-card-index="0"] { background-color: #2d2d2d !important; background-image: none !important',
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-home-card-text) !important",
      );
      expect(style?.textContent).toContain(
        "background-color: var(--ds-theme-color-activity-background) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-activity-text) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-activity-muted) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-user-message-text) !important",
      );
      expect(style?.textContent).toContain(
        "color: var(--ds-theme-color-assistant-message-text) !important",
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

  it("remaps a recreated edge-scroll thread title surface", async () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
      ),
    );

    const toolbar = document.querySelector('[class*="_Toolbar_"]');
    document.querySelector('[data-testid="thread-title-surface"]')?.remove();
    toolbar?.insertAdjacentHTML(
      "afterbegin",
      '<div class="text-md flex flex-1" data-testid="replacement-thread-title"><button class="text-base font-medium">切换后的会话</button></div>',
    );
    const replacement = document.querySelector(
      '[data-testid="replacement-thread-title"]',
    );
    expect(replacement?.getAttribute("data-ds-part")).toBeNull();
    expect(
      document.querySelector(`style[data-codexstyle-owner="${marker}"]`)
        ?.textContent,
    ).toContain(
      'header[data-app-shell-header-edge-scroll="true"]:not([data-app-shell-tab-row]) [class*="_Toolbar_"] > [class~="text-md"][class~="flex-1"]:has(button[class~="text-base"][class~="font-medium"]) { background-color: var(--ds-theme-color-thread-tab-background) !important',
    );

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(replacement?.getAttribute("data-ds-part")).toBe("thread-tab");
    expect(replacement?.getAttribute("data-codexstyle-owner")).toBe(marker);
  });

  it("applies independent color and image surfaces to the four home cards", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    const imageDataUrl = "data:image/webp;base64,UklGRg==";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
        {
          ...defaultConfiguration,
          backgroundScope: "window",
          sidebarOverlayOpacity: 75,
          homeCards: [
            { mode: "color", color: "#112233" },
            { mode: "image", color: "#223344", imageDataUrl },
            { mode: "color", color: "rgba(51, 68, 85, 0.7)" },
            { mode: "color", color: "#445566" },
          ],
        },
      ),
    );

    const source =
      document.querySelector(`style[data-codexstyle-owner="${marker}"]`)
        ?.textContent ?? "";
    expect(source).toContain(
      'data-codexstyle-home-card-index="0"] { background-color: #112233 !important; background-image: none !important',
    );
    expect(source).toContain(
      'data-codexstyle-home-card-index="1"] { background-color: #223344 !important; background-image: url("data:image/webp;base64,UklGRg==") !important',
    );
    expect(source).toContain(
      'data-codexstyle-home-card-index="2"] { background-color: rgba(51, 68, 85, 0.7) !important',
    );
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
      "background-color: rgb(from var(--ds-theme-color-panel) r g b / 42%) !important",
    );
    expect(style?.textContent).toContain(
      "background-color: var(--ds-theme-color-background) !important",
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
      "background-color: var(--ds-theme-color-panel) !important",
    );
    expect(style?.textContent).toContain(
      "background-color: var(--ds-theme-color-panel-alt) !important",
    );
    expect(style?.textContent).toContain(
      '[data-composer-placement="home"][data-composer-rail-item][data-composer-rail-placement="above"][data-composer-rail-variant="controls"] { background-color: var(--ds-theme-color-panel-alt) !important',
    );
    expect(style?.textContent).not.toContain(
      "var(--ds-theme-color-panel-alt) 88%, transparent",
    );
    expect(style?.textContent).not.toContain(
      "var(--ds-theme-color-panel-alt) 92%, transparent",
    );
    expect(style?.textContent).not.toContain(
      "var(--ds-theme-color-panel) 88%, transparent",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-top-bar-text) !important",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-user-message-text) !important",
    );
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-assistant-message-text) !important",
    );
    expect(style?.textContent).toContain(
      "--ds-theme-color-top-bar-background: rgba(0, 0, 0, 0)",
    );
  });

  it("keeps top bar and message text controls active when message surfaces are disabled", () => {
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
    expect(style?.textContent).toContain(
      "color: var(--ds-theme-color-assistant-message-text) !important",
    );
    expect(style?.textContent).not.toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-panel-alt) 92%, transparent) !important",
    );
    expect(style?.textContent).toContain(
      'data-markdown-text-style="assistant-message"',
    );
    expect(style?.textContent).not.toContain(
      "background-color: color-mix(in srgb, var(--ds-theme-color-assistant-panel) 92%, transparent) !important",
    );
  });

  it("scopes assistant text color to its container and common descendants", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
      ),
    );

    const source =
      document.querySelector(`style[data-codexstyle-owner="${marker}"]`)
        ?.textContent ?? "";
    const assistantSelector = `[data-ds-part="message"][data-markdown-text-style="assistant-message"][data-codexstyle-owner="${marker}"]`;
    const userSelector = `[data-ds-part="message"][data-user-message-bubble="true"][data-codexstyle-owner="${marker}"]`;

    expect(source).toContain(
      `${assistantSelector} { color: var(--ds-theme-color-assistant-message-text) !important; }`,
    );
    expect(source).toContain(
      `${assistantSelector} :where(blockquote, em, h1, h2, h3, h4, h5, h6, li, p, small, strong, td, th) { color: var(--ds-theme-color-assistant-message-text) !important; }`,
    );
    expect(source).toContain(
      `${userSelector} { color: var(--ds-theme-color-user-message-text) !important; }`,
    );
    expect(source).not.toContain(
      `${userSelector} { color: var(--ds-theme-color-assistant-message-text)`,
    );
    expect(source).not.toContain(
      `${userSelector} :where(blockquote, em, h1, h2, h3, h4, h5, h6, li, p, small, strong, td, th)`,
    );
    expect(source).not.toContain(`${assistantSelector} :where(a,`);
    expect(source).not.toContain(`${assistantSelector} :where(code,`);
    expect(source).not.toContain(`${assistantSelector} :where(pre,`);
    expect(source).not.toContain(`${assistantSelector} :where(span,`);
  });

  it("styles change cards without overriding addition and deletion colors", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    const card = document.querySelector('[data-testid="change-card"]');
    // JSDOM's selector engine cannot parse the slash-bearing class token inside
    // :has(), so selector-profile.test.ts owns that exact selector contract.
    card?.setAttribute("data-ds-part", "change-card");
    card?.setAttribute("data-codexstyle-owner", marker);
    window.eval(
      buildThemePayload(
        marker,
        '[data-ds-part="root"] { color: #fff; }',
        "data:image/png;base64,AA==",
      ),
    );

    const source =
      document.querySelector(`style[data-codexstyle-owner="${marker}"]`)
        ?.textContent ?? "";
    const cardSelector = `[data-ds-part="change-card"][data-codexstyle-owner="${marker}"]`;
    const ordinaryTextSelector =
      ':where(button, [class~="text-default"], [class~="text-secondary"])';

    expect(card?.getAttribute("data-ds-part")).toBe("change-card");
    expect(source).toContain(
      `${cardSelector} { --codex-diffs-surface-override: var(--ds-theme-color-change-card-background) !important; background-color: var(--ds-theme-color-change-card-background) !important; color: var(--ds-theme-color-change-card-text) !important; }`,
    );
    expect(source).toContain(
      `${cardSelector} ${ordinaryTextSelector} { color: var(--ds-theme-color-change-card-text) !important; }`,
    );
    expect(source).toContain("--ds-theme-color-change-card-background:");
    expect(source).toContain("--ds-theme-color-change-card-text:");
    expect(
      card?.querySelector(".text-default")?.matches(ordinaryTextSelector),
    ).toBe(true);
    expect(
      card?.querySelector(".text-secondary")?.matches(ordinaryTextSelector),
    ).toBe(true);
    expect(
      card?.querySelector(".diff-added")?.matches(ordinaryTextSelector),
    ).toBe(false);
    expect(
      card?.querySelector(".diff-removed")?.matches(ordinaryTextSelector),
    ).toBe(false);
  });

  it("bridges muted placeholders without changing toolbar and primary action roles", () => {
    resetDocument();
    const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
    const composer = document.querySelector("[data-composer-surface-variant]");
    composer?.insertAdjacentHTML(
      "afterbegin",
      '<span data-placeholder="true">Data placeholder</span><span aria-placeholder="Prompt">ARIA placeholder</span><span class="composer-placeholder-copy">Class placeholder</span><textarea placeholder="Native placeholder"></textarea>',
    );
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
          },
        },
      ),
    );

    const source =
      document.querySelector(`style[data-codexstyle-owner="${marker}"]`)
        ?.textContent ?? "";
    expect(source).toContain(
      ':where([data-placeholder], [aria-placeholder]):not([contenteditable="true"]):not(input):not(textarea) { color: var(--ds-theme-color-muted) !important; }',
    );
    expect(source).toContain(
      ":where([data-placeholder], [aria-placeholder])::before",
    );
    expect(source).toContain(
      ":where(input, textarea)::placeholder { color: var(--ds-theme-color-muted) !important; opacity: 1 !important; }",
    );
    expect(source).toContain(
      ":where(button, span) { color: var(--ds-theme-color-secondary) !important; }",
    );
    expect(source).toContain(
      '[data-ds-part="composer-toolbar"][data-codexstyle-owner="' +
        marker +
        '"] [data-permission-mode]',
    );
    expect(source).toContain(
      "{ color: var(--ds-theme-color-accent) !important; }",
    );
    expect(source).toContain(
      "background-color: var(--ds-theme-color-accent) !important; color: var(--ds-theme-color-background) !important;",
    );
    expect(composer?.querySelector('[data-placeholder="true"]')).not.toBeNull();
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
  body = '<div class="_ApplicationMenuTopBar_fixture"><button>文件</button></div><aside class="app-shell-left-panel"></aside><main class="main-surface" role="main"><header class="app-header-tint" data-app-shell-header-edge-scroll="true"><div class="_Toolbar_fixture"><div class="text-md flex flex-1" data-testid="thread-title-surface"><button class="text-base font-medium">当前会话</button></div></div><div data-app-shell-tab-controller><div class="group/tab" style="--app-shell-tab-background:#fff"><div class="pointer-events-none absolute inset-0"></div><button role="tab" aria-selected="true">主题会话</button></div></div></header><div data-testid="home-icon"></div><div class="heading-xl text-default" data-feature="game-source"><span class="group/title"><span class="text-default">首页标题</span></span></div><section class="group/home-suggestions"><div><button class="bg-surface"><span class="text-secondary">探索代码</span></button><button class="bg-surface"><span class="text-secondary">构建功能</span></button><button class="bg-surface"><span class="text-secondary">审查代码</span></button><button class="bg-surface"><span class="text-secondary">修复问题</span></button></div></section><div class="group/activity-header"><strong>运行命令</strong><small class="text-secondary">npm test</small></div><div data-app-shell-main-content-top-fade="full-bleed"></div><div class="thread-scroll-container"><div aria-hidden="true" class="bg-gradient-to-t from-surface via-surface"></div></div><div data-local-conversation-user-anchor="true"><div data-user-message-bubble="true"><span>用户消息</span></div></div><div data-local-conversation-final-assistant="true"><div data-markdown-text-style="assistant-message"></div></div><div data-testid="change-card" class="bg-surface-elevated-secondary/50 text-default"><div class="group/turn-diff-header"><button><span class="text-secondary">审核</span></button></div><span class="text-default">src/main.ts</span><small class="text-secondary">已编辑</small><span class="diff-added" style="color: green">+4</span><span class="diff-removed" style="color: red">-1</span></div><div data-composer-placement="home" data-composer-rail-item="present" data-composer-rail-placement="above" data-composer-rail-variant="controls"></div><div data-codex-composer-root><div data-composer-surface-variant="default"><div data-composer-footer-responsive></div><button class="bg-primary-solid" aria-label="发送"><svg></svg></button></div></div></main>',
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
