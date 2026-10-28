// @vitest-environment jsdom
// @vitest-environment-options {"url":"app://-/index.html"}

import { describe, expect, it } from "vitest";
import {
  CODEX_SELECTOR_PROFILE,
  SELECTOR_PARTS,
  THREAD_BOTTOM_FADE_SELECTOR,
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
    expect(CODEX_SELECTOR_PROFILE).toBe("openai-codex-shell/26");
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
    expect(SELECTOR_PARTS).toContainEqual([
      "page-search-rail",
      'div[class~="sticky"][class~="bg-surface"]:has(input#plugins-page-search, input#scheduled-page-search)',
    ]);
    expect(SELECTOR_PARTS).toContainEqual([
      "page-search-rail",
      '[data-app-shell-inline-page-header] > div > div[data-sticky][class*="_shell_"]:has(> div[class*="_content_"] > div[class*="_headerRow_"] > div[class*="_title_"] > div[class*="_titleContent_"])',
    ]);
  });

  it("limits legacy and module fades to the transcript's direct sticky slot", () => {
    const paintClasses = "pointer-events-none absolute inset-x-0 from-surface";
    document.body.innerHTML = `
      <div class="group/thread-scroll-layout"><div class="thread-scroll-container">
        <div class="[container-name:thread-content]">
          <div aria-hidden="true" class="pointer-events-none sticky bottom-0">
            <div id="legacy" aria-hidden="true" class="${paintClasses} bg-gradient-to-t"></div>
            <div id="module" aria-hidden="true" class="${paintClasses} _background_future_2 _fade_future_2"></div>
            <div id="missing-background" aria-hidden="true" class="${paintClasses} _fade_future_2"></div>
            <div id="surface" aria-hidden="true" class="${paintClasses} _background_future_2 _surface_future_2"></div>
          </div>
          <section><div aria-hidden="true" class="pointer-events-none sticky bottom-0"><div id="card-fade" aria-hidden="true" class="${paintClasses} _background_future_2 _fade_future_2"></div></div></section>
        </div>
      </div></div>
      <div id="outside-fade" aria-hidden="true" class="${paintClasses} _background_future_2 _fade_future_2"></div>`;

    expect(
      [...document.querySelectorAll(THREAD_BOTTOM_FADE_SELECTOR)].map(
        (node) => node.id,
      ),
    ).toEqual(["legacy", "module"]);
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
