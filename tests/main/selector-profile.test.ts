// @vitest-environment jsdom
// @vitest-environment-options {"url":"app://-/index.html"}

import { describe, expect, it } from "vitest";
import {
  CODEX_SELECTOR_PROFILE,
  SELECTOR_PARTS,
  isCompatibleSelectorProbe,
  selectorProbeExpression,
} from "../../src/main/session/selector-profile";
import { CODEX_STARTUP_VERIFY_TIMEOUT_MS } from "../../src/main/session/session-service";

describe("versioned selector profile", () => {
  it("accepts the stable shell before optional composer controls mount", () => {
    document.body.innerHTML =
      '<div class="_ApplicationMenuTopBar_fixture"></div><aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface><header class="app-header-tint"></header></main>';

    const result = window.eval(selectorProbeExpression());

    expect(result).toEqual({
      protocol: "app:",
      profile: CODEX_SELECTOR_PROFILE,
      compatible: true,
    });
    expect(document.querySelector("[data-codex-composer-root]")).toBeNull();
    expect(CODEX_SELECTOR_PROFILE).toBe("openai-codex-shell/11");
    expect(SELECTOR_PARTS).toContainEqual([
      "titlebar",
      'div[class*="_ApplicationMenuTopBar_"]',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "change-card",
      'div:has(> [class~="group/turn-diff-header"])',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "thread-tab",
      'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"]) [data-app-shell-tab-controller]:has([role="tab"][aria-selected="true"])',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "thread-tab",
      'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"]) [role="tab"][aria-selected="true"]',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "thread-tab",
      'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"]) [data-app-shell-tab-controller]:has([role="tab"][aria-selected="true"]) [class~="group/tab"]:has(> button[role="tab"][aria-selected="true"])',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "thread-tab",
      'header[data-app-shell-header-edge-scroll="true"]:not([data-app-shell-tab-row]) [class*="_Toolbar_"] > [class~="text-md"][class~="flex-1"]:has(button[class~="text-base"][class~="font-medium"])',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "home-title",
      '[role="main"]:has([data-testid="home-icon"]) [data-feature="game-source"]',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "home-card",
      'section[class~="group/home-suggestions"] button[class~="bg-surface"]',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "activity",
      '[class~="group/activity-header"]',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "composer",
      '[data-composer-placement="home"][data-composer-rail-item][data-composer-rail-placement="above"][data-composer-rail-variant="controls"]',
    ]);
  });

  it("rejects a shell when either managed top bar anchor is missing", () => {
    document.body.innerHTML =
      '<aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface><header class="app-header-tint"></header></main>';
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: false,
    });

    document.body.innerHTML =
      '<div class="_ApplicationMenuTopBar_fixture"></div><aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface></main>';
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: false,
    });
  });

  it("keeps a cold Store launch open long enough for the shell to mount", () => {
    expect(CODEX_STARTUP_VERIFY_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(
      isCompatibleSelectorProbe({
        protocol: "app:",
        profile: CODEX_SELECTOR_PROFILE,
        compatible: true,
      }),
    ).toBe(true);
  });
});
