export const CODEX_SELECTOR_PROFILE = "openai-codex-shell/12" as const;

export const EDGE_SCROLL_THREAD_TITLE_SELECTOR =
  'header[data-app-shell-header-edge-scroll="true"]:not([data-app-shell-tab-row]) [class*="_Toolbar_"] > [class~="text-md"][class~="flex-1"]:has(button[class~="text-base"][class~="font-medium"])' as const;

export const HOME_COMPOSER_RAIL_SELECTOR =
  '[data-composer-placement="home"][data-composer-rail-item][data-composer-rail-placement="above"][data-composer-rail-variant="controls"]' as const;

export const PLUGIN_SEARCH_RAIL_SELECTOR =
  'div[class~="sticky"][class~="bg-surface"]:has(input#plugins-page-search)' as const;

export const SELECTOR_PARTS = [
  ["sidebar", "aside.app-shell-left-panel"],
  [
    "main",
    'main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])',
  ],
  ["titlebar", 'div[class*="_ApplicationMenuTopBar_"]'],
  [
    "header",
    'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"])',
  ],
  [
    "thread-tab",
    'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"]) [data-app-shell-tab-controller]:has([role="tab"][aria-selected="true"])',
  ],
  [
    "thread-tab",
    'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"]) [role="tab"][aria-selected="true"]',
  ],
  [
    "thread-tab",
    'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"]) [data-app-shell-tab-controller]:has([role="tab"][aria-selected="true"]) [class~="group/tab"]:has(> button[role="tab"][aria-selected="true"])',
  ],
  ["thread-tab", EDGE_SCROLL_THREAD_TITLE_SELECTOR],
  ["main-top-fade", "[data-app-shell-main-content-top-fade]"],
  ["home", '[role="main"]:has([data-testid="home-icon"])'],
  ["home-hero", '[data-testid="home-icon"]'],
  [
    "home-title",
    '[role="main"]:has([data-testid="home-icon"]) :is(h1, h2, h3)',
  ],
  [
    "home-title",
    '[role="main"]:has([data-testid="home-icon"]) [data-feature="game-source"]',
  ],
  [
    "home-title",
    '[role="main"]:has([data-testid="home-icon"]) [class~="group/title"]',
  ],
  [
    "home-card",
    'section[class~="group/home-suggestions"] button[class~="bg-surface"]',
  ],
  ["project-list", '[class*="project-selector" i]'],
  ["thread", ".thread-scroll-container"],
  [
    "message",
    ':is([data-user-message-bubble="true"], [data-markdown-text-style="assistant-message"])',
  ],
  ["change-card", 'div:has(> [class~="group/turn-diff-header"])'],
  ["activity", '[class~="group/activity-header"]'],
  ["composer", "[data-codex-composer-root] [data-composer-surface-variant]"],
  ["composer", HOME_COMPOSER_RAIL_SELECTOR],
  [
    "composer-toolbar",
    "[data-codex-composer-root] [data-composer-footer-responsive]",
  ],
  [
    "composer-submit",
    '[data-codex-composer-root] button[class~="bg-primary-solid"]:not([aria-label*="停止"]):not([aria-label*="Stop"])',
  ],
  [
    "composer-backdrop",
    '.thread-scroll-container [aria-hidden="true"][class~="bg-gradient-to-t"][class~="from-surface"][class~="via-surface"]',
  ],
  ["plugins-search-rail", PLUGIN_SEARCH_RAIL_SELECTOR],
  ["dialog", '[role="dialog"]'],
] as const;

/**
 * The profile is deliberately small and versioned. A target must expose the
 * app protocol plus both stable shell anchors before any style is injected.
 */
export function selectorProbeExpression(): string {
  return `(() => {
    const shell = document.querySelector('main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])');
    const sidebar = document.querySelector('aside.app-shell-left-panel');
    const titlebar = document.querySelector('div[class*="_ApplicationMenuTopBar_"]');
    const header = document.querySelector('header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"])');
    return {
      protocol: location.protocol,
      profile: ${JSON.stringify(CODEX_SELECTOR_PROFILE)},
      compatible: Boolean(shell && sidebar && titlebar && header),
    };
  })()`;
}

export function isCompatibleSelectorProbe(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    result.protocol === "app:" &&
    result.profile === CODEX_SELECTOR_PROFILE &&
    result.compatible === true
  );
}
