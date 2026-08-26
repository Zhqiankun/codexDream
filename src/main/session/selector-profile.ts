export const CODEX_SELECTOR_PROFILE = "openai-codex-shell/5" as const;

export const SELECTOR_PARTS = [
  ["sidebar", "aside.app-shell-left-panel"],
  [
    "main",
    'main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])',
  ],
  [
    "header",
    'header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"])',
  ],
  ["main-top-fade", "[data-app-shell-main-content-top-fade]"],
  ["home", '[role="main"]:has([data-testid="home-icon"])'],
  ["home-hero", '[data-testid="home-icon"]'],
  ["project-list", '[class*="project-selector" i]'],
  ["thread", ".thread-scroll-container"],
  [
    "message",
    ':is([data-user-message-bubble="true"], [data-markdown-text-style="assistant-message"])',
  ],
  ["composer", "[data-codex-composer-root] [data-composer-surface-variant]"],
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
    return {
      protocol: location.protocol,
      profile: ${JSON.stringify(CODEX_SELECTOR_PROFILE)},
      compatible: Boolean(shell && sidebar),
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
