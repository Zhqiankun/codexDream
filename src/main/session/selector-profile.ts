export const CODEX_SELECTOR_PROFILE = "openai-codex-shell/17" as const;

// Store 26.924.2738.0 collapsed-turn-disclosure renders duration and previous
// message count through the same button. Keep expanded state and locale agnostic.
export const COLLAPSED_TURN_DISCLOSURE_SELECTOR =
  '.thread-scroll-container div[class~="text-size-chat"][class~="text-secondary"] > button[aria-expanded][class~="inline-flex"][class~="flex-wrap"][class~="text-size-chat"]:has(> svg[class~="text-text/40"])' as const;

// Store 26.1002.7124.0 keeps fade state on a container, but paints its child.
export const MAIN_TOP_FADE_SELECTOR =
  ':is([data-app-shell-main-content-top-fade][aria-hidden="true"], [data-app-shell-main-content-top-fade] [aria-hidden="true"][class*="_MainContentTopFade_"])' as const;

// New thread layout separates the scroll fade from the footer's solid plate.
// Do not match gradients in message cards, shared previews, or detail panels.
export const THREAD_BOTTOM_FADE_SELECTOR =
  '.thread-scroll-container > [aria-hidden="true"][class~="sticky"][class~="bottom-0"] > [aria-hidden="true"][class~="pointer-events-none"][class~="absolute"][class~="inset-x-0"][class~="bg-gradient-to-t"][class~="from-surface"]' as const;
export const THREAD_FOOTER_SELECTOR =
  '[class~="group/thread-scroll-layout"] > [data-thread-scroll-footer="true"]' as const;
export const THREAD_FOOTER_BACKDROP_SELECTOR =
  `${THREAD_FOOTER_SELECTOR} > [aria-hidden="true"][class~="pointer-events-none"][class~="absolute"][class~="inset-x-0"][class~="bg-surface"]` as const;

export const EDGE_SCROLL_THREAD_TITLE_SELECTOR =
  'header[data-app-shell-header-edge-scroll="true"]:not([data-app-shell-tab-row]) [class*="_Toolbar_"] > [class~="text-md"][class~="flex-1"]:has(button[class~="text-base"][class~="font-medium"])' as const;

export const HOME_COMPOSER_RAIL_SELECTOR =
  '[data-composer-placement="home"][data-composer-rail-item][data-composer-rail-placement="above"][data-composer-rail-variant="controls"]' as const;

// Verified in Store 26.901.2854.0 and 26.901.6511.0: plugins and scheduled
// tasks share this surface. Its input capsule is a separate descendant.
// Keep the verified search IDs explicit so unrelated sticky surfaces stay native.
export const PAGE_SEARCH_RAIL_SELECTOR =
  'div[class~="sticky"][class~="bg-surface"]:has(input#plugins-page-search, input#scheduled-page-search)' as const;

// The Markdown document viewer uses CodeMirror, not the chat MarkdownRoot.
// Own the viewport (including empty space) and exclude source/other languages.
export const MARKDOWN_DOCUMENT_SELECTOR =
  '[data-editor-search-surface]:has(> .cm-editor > .cm-scroller > .cm-content[data-language="markdown"])' as const;

// Store 26.901.6511.0 replaces the user bubble with this form on edit.
// RichTextInput here omits data-codex-composer (reserved for the primary input).
// Match structure, not translated labels; keep the form owned while disabled.
export const USER_MESSAGE_EDITOR_SELECTOR =
  '[data-local-conversation-user-anchor="true"] form[class~="bg-text/5"]:has([data-rich-text-layout] > [contenteditable]):has(button[type="submit"])' as const;

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
  ["main-top-fade", MAIN_TOP_FADE_SELECTOR],
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
  ["message-editor", USER_MESSAGE_EDITOR_SELECTOR],
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
  ["composer-backdrop", THREAD_BOTTOM_FADE_SELECTOR],
  ["composer-backdrop", THREAD_FOOTER_BACKDROP_SELECTOR],
  ["page-search-rail", PAGE_SEARCH_RAIL_SELECTOR],
  ["markdown-document", MARKDOWN_DOCUMENT_SELECTOR],
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
