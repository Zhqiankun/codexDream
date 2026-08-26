// @vitest-environment jsdom
// @vitest-environment-options {"url":"app://codex/"}

import { describe, expect, it } from "vitest";
import { readThemeConfiguration } from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

const defaultConfiguration = readThemeConfiguration({});

describe("theme payload", () => {
  it("maps the selector profile without invoking page-owned cleanup", () => {
    resetDocument();
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
      const sidebar = document.querySelector("aside");
      const style = document.querySelector(
        `style[data-codexstyle-owner="${marker}"]`,
      );
      expect(cleanupCalls).toBe(0);
      expect(root.getAttribute("data-ds-part")).toBe("root");
      expect(sidebar?.getAttribute("data-ds-part")).toBe("sidebar");
      expect(style?.getAttribute("data-codexstyle-style")).toBe("1");
      expect(style?.textContent).toContain("data:image/png;base64,AA==");
      expect(style?.textContent).toContain('data-ds-part="root"');
      expect(style?.textContent).toContain(
        "background-color: rgb(15 23 42 / 0.75) !important",
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
      '[data-ds-part="sidebar"][data-codexstyle-owner=',
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
      "background-color: rgb(15 23 42 / 0.42) !important",
    );
    expect(style?.textContent?.lastIndexOf("0.42")).toBeGreaterThan(
      style?.textContent?.lastIndexOf("#fff") ?? -1,
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
  body = '<aside class="app-shell-left-panel"></aside><main class="main-surface"></main>',
) {
  document.head.innerHTML = "";
  document.body.innerHTML = body;
  document.documentElement.removeAttribute("data-ds-part");
  document.documentElement.removeAttribute("data-codexstyle-owner");
  document.documentElement.removeAttribute("data-codexstyle-part");
}
