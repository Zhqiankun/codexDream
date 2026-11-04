// @vitest-environment jsdom
// @vitest-environment-options {"url":"app://-/index.html"}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CODEX_SELECTOR_PROFILE,
  MAIN_TOP_FADE_SELECTOR,
  SELECTOR_PARTS,
  THREAD_BOTTOM_FADE_SELECTOR,
  THREAD_FOOTER_BACKDROP_SELECTOR,
  isCompatibleSelectorProbe,
  selectorProbeExpression,
} from "../../src/main/session/selector-profile";
import { CODEX_STARTUP_VERIFY_TIMEOUT_MS } from "../../src/main/session/session-service";

const mainEntry = "app://-/index.html";
const stableFrame =
  '<div data-app-shell-frame="true"><div data-app-shell-workspace-row="true"><section data-app-shell-active-page="true"><main data-app-shell-main-surface="default"></main></section></div></div>';
const legacyShell =
  '<div class="_ApplicationMenuTopBar_fixture"></div><aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface><header class="app-header-tint"></header></main>';

function navigate(url: string) {
  // Vitest exposes its isolated JSDOM instance. Reconfigure avoids treating
  // an app: entry as an HTTP history navigation or mutating global URL parsing.
  (
    globalThis as typeof globalThis & {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

beforeEach(() => {
  navigate(mainEntry);
  document.documentElement.removeAttribute("data-codex-window-type");
  document.documentElement.className = "";
});
afterEach(() => navigate(mainEntry));

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
    expect(CODEX_SELECTOR_PROFILE).toBe("openai-codex-shell/30");
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

  it("accepts the merged Store titlebar without changing its header part", () => {
    document.body.innerHTML =
      '<aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface="default"><header data-app-shell-titlebar="true" data-pip-obstacle="app-shell-header" data-app-shell-header-edge-scroll="false"></header></main>';

    expect(window.eval(selectorProbeExpression())).toEqual({
      protocol: "app:",
      profile: CODEX_SELECTOR_PROFILE,
      compatible: true,
    });
    const header = document.querySelector("header")!;
    expect(
      SELECTOR_PARTS.find(([, selector]) => header.matches(selector))?.[0],
    ).toBe("header");
    expect(document.querySelector("[data-codex-composer-root]")).toBeNull();
  });

  it.each(["main", "aside", "header"])(
    "rejects the merged shell without its %s anchor",
    (selector) => {
      document.body.innerHTML =
        '<aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface="default"><header data-app-shell-titlebar="true" data-pip-obstacle="app-shell-header" data-app-shell-header-edge-scroll="false"></header></main>';
      document.querySelector(selector)!.remove();

      expect(window.eval(selectorProbeExpression())).toMatchObject({
        compatible: false,
      });
    },
  );

  it.each(["data-app-shell-titlebar", "data-pip-obstacle"])(
    "rejects a generic header missing the titlebar's %s marker",
    (attribute) => {
      document.body.innerHTML =
        '<aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface="default"><header data-app-shell-titlebar="true" data-pip-obstacle="app-shell-header" data-app-shell-header-edge-scroll="false"></header></main>';
      document.querySelector("header")!.removeAttribute(attribute);

      expect(window.eval(selectorProbeExpression())).toMatchObject({
        compatible: false,
      });
    },
  );

  it("limits legacy and module fades to the transcript's direct sticky slot", () => {
    const paintClasses = "pointer-events-none absolute inset-x-0 from-surface";
    document.body.innerHTML = `
      <div class="group/thread-scroll-layout"><div class="thread-scroll-container">
        <div class="[container-name:thread-content]">
          <div aria-hidden="true" class="pointer-events-none sticky bottom-0">
            <div id="legacy" aria-hidden="true" class="${paintClasses} bg-gradient-to-t"></div>
            <div id="module" aria-hidden="true" class="${paintClasses} _background_future_2 _fade_future_2"></div>
            <div id="current" aria-hidden="true" class="background-uNUrfY fade-AcMqqj ${paintClasses}"></div>
            <div id="current-reordered" aria-hidden="true" class="${paintClasses} fade-AcMqqj background-uNUrfY"></div>
            <div id="missing-background" aria-hidden="true" class="${paintClasses} _fade_future_2"></div>
            <div id="missing-current-background" aria-hidden="true" class="${paintClasses} fade-AcMqqj"></div>
            <div id="unrelated-prefix" aria-hidden="true" class="${paintClasses} card-background-uNUrfY card-fade-AcMqqj"></div>
            <div id="surface" aria-hidden="true" class="${paintClasses} _background_future_2 _surface_future_2"></div>
          </div>
          <section><div aria-hidden="true" class="pointer-events-none sticky bottom-0"><div id="card-fade" aria-hidden="true" class="${paintClasses} _background_future_2 _fade_future_2"></div></div></section>
          <section><div aria-hidden="true" class="pointer-events-none sticky bottom-0"><div id="current-card-fade" aria-hidden="true" class="background-uNUrfY fade-AcMqqj ${paintClasses}"></div></div></section>
        </div>
      </div></div>
      <div id="outside-fade" aria-hidden="true" class="${paintClasses} _background_future_2 _fade_future_2"></div>`;

    expect(
      [...document.querySelectorAll(THREAD_BOTTOM_FADE_SELECTOR)].map(
        (node) => node.id,
      ),
    ).toEqual(["legacy", "module", "current", "current-reordered"]);
  });

  it("matches current top fades only inside their shell paint container", () => {
    document.body.innerHTML = `
      <div id="parent" data-app-shell-main-content-top-fade="visible">
        <div id="old" aria-hidden="true" class="_MainContentTopFade_old"></div>
        <div id="current" aria-hidden="true" class="MainContentTopFade-T6W4RS background-j0etS7"></div>
        <div id="reordered" aria-hidden="true" class="background-j0etS7 MainContentTopFade-T6W4RS"></div>
        <div aria-hidden="true" class="UnrelatedMainContentTopFade-T6W4RS"></div>
        <div class="MainContentTopFade-T6W4RS"></div>
      </div>
      <div aria-hidden="true" class="MainContentTopFade-T6W4RS"></div>`;
    expect(
      [...document.querySelectorAll(MAIN_TOP_FADE_SELECTOR)].map(
        (node) => node.id,
      ),
    ).toEqual(["old", "current", "reordered"]);
  });

  it("limits current footer surfaces to the direct footer paint slot", () => {
    const paintClasses = "pointer-events-none absolute bg-surface";
    document.body.innerHTML = `
      <div class="group/thread-scroll-layout"><div class="thread-scroll-container">
        <div data-thread-scroll-footer="true">
          <div id="current" aria-hidden="true" class="background-uNUrfY surface-nr8PSS ${paintClasses}"></div>
          <div id="reordered" aria-hidden="true" class="${paintClasses} surface-nr8PSS background-uNUrfY"></div>
          <div aria-hidden="true" class="${paintClasses} surface-nr8PSS"></div>
          <div aria-hidden="true" class="${paintClasses} card-background-uNUrfY card-surface-nr8PSS"></div>
          <section><div aria-hidden="true" class="background-uNUrfY surface-nr8PSS ${paintClasses}"></div></section>
        </div>
        <section><div data-thread-scroll-footer="true"><div aria-hidden="true" class="background-uNUrfY surface-nr8PSS ${paintClasses}"></div></div></section>
      </div></div>`;
    expect(
      [...document.querySelectorAll(THREAD_FOOTER_BACKDROP_SELECTOR)].map(
        (node) => node.id,
      ),
    ).toEqual(["current", "reordered"]);
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

describe("main-window identity gate", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-codex-window-type", "electron");
    document.body.innerHTML = stableFrame;
  });

  it("accepts the active frame without optional sidebar, titlebar, header or composer", () => {
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: true,
    });
    document
      .querySelector("main")!
      .setAttribute("data-app-shell-main-surface", "panel");
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: true,
    });
  });

  it("ignores inactive cached pages but rejects a second active main", () => {
    const row = document.querySelector("[data-app-shell-workspace-row]")!;
    row.insertAdjacentHTML(
      "beforeend",
      '<section id="cached" data-app-shell-active-page="false"><main data-app-shell-main-surface="default"></main></section>',
    );
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: true,
    });
    document
      .querySelector("#cached")!
      .setAttribute("data-app-shell-active-page", "true");
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: false,
    });
  });

  it.each([
    "<main data-app-shell-main-surface></main>",
    '<div data-app-shell-frame="true"></div>',
  ])("rejects ambiguous shell structure %s", (extra) => {
    document.body.insertAdjacentHTML("beforeend", extra);
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: false,
    });
  });

  it.each([
    ["[data-app-shell-frame]", "data-app-shell-frame"],
    ["[data-app-shell-workspace-row]", "data-app-shell-workspace-row"],
    ["main", "data-app-shell-main-surface"],
    ["html", "data-codex-window-type"],
  ])("requires the %s anchor's %s marker", (selector, attribute) => {
    document.querySelector(selector)!.removeAttribute(attribute);
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: false,
    });
  });

  it("requires a direct workspace row and an active main inside that row", () => {
    const row = document.querySelector("[data-app-shell-workspace-row]")!;
    const wrapper = document.createElement("div");
    row.replaceWith(wrapper);
    wrapper.append(row);
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: false,
    });
    document.body.innerHTML = stableFrame;
    document
      .querySelector("[data-app-shell-active-page]")!
      .setAttribute("data-app-shell-active-page", "false");
    expect(window.eval(selectorProbeExpression())).toMatchObject({
      compatible: false,
    });
  });

  for (const skeleton of ["frame", "legacy"] as const) {
    it.each([
      "app://-/",
      "app://-/index.html?initialRoute=%2Fthread%2Ffixture%3Fmode%3Dchat&theme=dark",
    ])(`accepts a main entry with ${skeleton} skeleton: %s`, (url) => {
      if (skeleton === "legacy") document.body.innerHTML = legacyShell;
      navigate(url);
      expect(window.eval(selectorProbeExpression())).toMatchObject({
        compatible: true,
      });
    });

    it.each([
      "app://test/index.html",
      "https://-/index.html",
      "app://-:123/index.html",
      "app://user:password@-/index.html",
      "app://-/avatar-overlay",
      "app://-/index.html?window=page",
      ...[
        "/avatar-overlay",
        "/spotlight",
        "/global-dictation",
        "/global-dictation/recording",
        "/hotkey-window",
        "/hotkey-window/settings",
        "/thread/fixture?window=page",
        "https://example.test/thread/fixture",
        "app://foreign/thread/fixture",
        "app://-:123/thread/fixture",
        "app://user:password@-/thread/fixture",
      ].map(
        (route) => `${mainEntry}?initialRoute=${encodeURIComponent(route)}`,
      ),
    ])(
      `rejects an auxiliary or foreign entry with ${skeleton} skeleton: %s`,
      (url) => {
        if (skeleton === "legacy") document.body.innerHTML = legacyShell;
        navigate(url);
        expect(window.eval(selectorProbeExpression())).toMatchObject({
          compatible: false,
        });
      },
    );

    it(`rejects compact windows even with a complete ${skeleton} skeleton`, () => {
      if (skeleton === "legacy") document.body.innerHTML = legacyShell;
      document.documentElement.classList.add("compact-window");
      expect(window.eval(selectorProbeExpression())).toMatchObject({
        compatible: false,
      });
    });
  }
});
