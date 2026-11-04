export const CODEX_SELECTOR_PROFILE = "openai-codex-shell/30" as const;

// 回合提示在 26.1016.6573.0 移除了箭头的淡色类；保留按钮结构约束，
// 用两版共有的图标尺寸标记识别，避免颜色类变化使整段用时失配。
export const COLLAPSED_TURN_DISCLOSURE_SELECTOR =
  '.thread-scroll-container div[class~="text-size-chat"][class~="text-secondary"] > button[aria-expanded][class~="inline-flex"][class~="flex-wrap"][class~="text-size-chat"]:has(> svg[class~="icon-2xs"])' as const;

// 思考标签包含带图标的行和独立占位两种形态；限于对话中的已核对结构，
// 不依赖闪光是否开启，也不命中侧栏、引导页或普通加载文字。
export const THINKING_LABEL_SELECTOR =
  ':is(.thread-scroll-container div[class~="inline-flex"][class~="text-text/60"][class~="[&_*:not(button)]:!text-text/60"] > span[aria-hidden][class~="min-w-0"][class~="flex-1"][class~="truncate"][class~="select-none"], .thread-scroll-container span[class~="text-size-chat"][class~="select-none"][class~="truncate"][class~="leading-[calc(var(--codex-chat-font-size)_+_8px)]"])' as const;
const workDividerSelector =
  '.thread-scroll-container div[class~="min-h-0"][class~="flex-col"][class~="items-start"][class~="gap-2"][class~="text-size-chat"][class~="text-secondary"]:has(> div[class~="w-full"][class~="border-t"][class~="border-default"])';
// 实时、完成与中止用时复用同一标签；可选前导图标不能扩大到整行染色。
export const WORK_DURATION_SELECTOR =
  `:is(${workDividerSelector} > span[class~="tabular-nums"], ${workDividerSelector} > div[class~="flex"][class~="items-start"][class~="gap-2"] > span[class~="tabular-nums"])` as const;

// 已确认的新旧外观以兼容数组并存，任一项命中即可；仍须满足对应区域的层级。
// 连字符分支只匹配完整类名前缀，兼容类顺序，不绑定每次构建变化的哈希后缀。
const mainTopFadeCompatibilitySelectors = [
  // 旧版直接在状态节点绘制；Store 26.1002.7124.0 改为容器内的绘制子层。
  '[data-app-shell-main-content-top-fade][aria-hidden="true"]',
  '[data-app-shell-main-content-top-fade] [aria-hidden="true"][class*="_MainContentTopFade_"]',
  // Store 26.1029.7803.0：CSS 模块由 _名称_哈希 改为 名称-哈希。
  '[data-app-shell-main-content-top-fade] [aria-hidden="true"][class^="MainContentTopFade-"]',
  '[data-app-shell-main-content-top-fade] [aria-hidden="true"][class*=" MainContentTopFade-"]',
] as const;
export const MAIN_TOP_FADE_SELECTOR = `:is(${mainTopFadeCompatibilitySelectors.join(", ")})`;

// Store 26.1002.7124.0 起，底部渐变固定在 transcript 的直接 sticky 子层。
// 所有兼容项共用此层级，消息卡片中的渐变不属于该装饰层。
const threadBottomFadePaintSlot =
  '[class~="group/thread-scroll-layout"] > .thread-scroll-container > [class~="[container-name:thread-content]"] > [aria-hidden="true"][class~="pointer-events-none"][class~="sticky"][class~="bottom-0"] > [aria-hidden="true"][class~="pointer-events-none"][class~="absolute"][class~="inset-x-0"][class~="from-surface"]';
const threadBottomFadeCompatibilitySelectors = [
  // 旧版 utility 渐变；Store 26.1013.4894.0 改为下划线格式的 CSS 模块。
  '[class~="bg-gradient-to-t"]',
  '[class*="_background_"][class*="_fade_"]',
  // Store 26.1029.7803.0 的连字符格式，同样要求 background 与 fade 同时存在。
  '[class^="background-"][class*=" fade-"]',
  '[class*=" background-"][class^="fade-"]',
  '[class*=" background-"][class*=" fade-"]',
] as const;
export const THREAD_BOTTOM_FADE_SELECTOR = `${threadBottomFadePaintSlot}:is(${threadBottomFadeCompatibilitySelectors.join(", ")})`;

// default/panel 的 footer 位于滚动容器内，compact 则直接位于布局根节点。
export const THREAD_FOOTER_SELECTOR =
  ':is([class~="group/thread-scroll-layout"], [class~="group/thread-scroll-layout"] > .thread-scroll-container) > [data-thread-scroll-footer="true"]' as const;
const threadFooterBackdropCompatibilitySelectors = [
  // 旧版 utility 背景；Store 26.1023.6123.0 将水平 inset 移入 CSS 模块。
  '[class~="inset-x-0"]',
  '[class*="_background_"][class*="_surface_"]',
  // Store 26.1029.7803.0 的连字符格式，仍限定为 footer 的直接绘制子层。
  '[class^="background-"][class*=" surface-"]',
  '[class*=" background-"][class^="surface-"]',
  '[class*=" background-"][class*=" surface-"]',
] as const;
export const THREAD_FOOTER_BACKDROP_SELECTOR = `${THREAD_FOOTER_SELECTOR} > [aria-hidden="true"][class~="pointer-events-none"][class~="absolute"][class~="bg-surface"]:is(${threadFooterBackdropCompatibilitySelectors.join(", ")})`;

export const THREAD_USER_MESSAGE_NAVIGATION_RAIL_SELECTOR =
  "[data-thread-user-message-navigation-rail-list]" as const;

export const EDGE_SCROLL_THREAD_TITLE_SELECTOR =
  'header[data-app-shell-header-edge-scroll="true"]:not([data-app-shell-tab-row]) [class*="_Toolbar_"] > [class~="text-md"][class~="flex-1"]:has(button[class~="text-base"][class~="font-medium"])' as const;

export const HOME_COMPOSER_RAIL_SELECTOR =
  '[data-composer-placement="home"][data-composer-rail-item][data-composer-rail-placement="above"][data-composer-rail-variant="controls"]' as const;

// Store 26.1027.3384.0 原生控件直接提供当前档位；不依赖本地化标签或隐藏的动画文案。
// 26.1029.7803.0 将 trigger 标记替换为 reasoning 导航目标，仍限定在主输入区。
export const REASONING_EFFORT_CONTROL_SELECTOR =
  '[data-codex-composer-root] :is([data-codex-intelligence-trigger], [data-composer-navigation-target="reasoning"])[data-selected-reasoning-effort]' as const;

// Legacy search rails still need their page-specific anchors. Store
// 26.1007.2314.0 changes the Plugins search ID and omits search in some states;
// its shared sticky header paints ::before independently of those controls.
// Identify that component by its direct shell/content/row/title hierarchy so
// optional search, card contents and nested headers cannot change its scope.
export const PAGE_SEARCH_RAIL_SELECTOR =
  'div[class~="sticky"][class~="bg-surface"]:has(input#plugins-page-search, input#scheduled-page-search)' as const;
export const INLINE_PAGE_HEADER_SELECTOR =
  '[data-app-shell-inline-page-header] > div > div[data-sticky][class*="_shell_"]:has(> div[class*="_content_"] > div[class*="_headerRow_"] > div[class*="_title_"] > div[class*="_titleContent_"])' as const;

// Store 26.1023.6123.0 keeps native foregrounds on these transparent surfaces.
// Keep title copy separate from search/actions; some layouts move the subtitle
// to the component's immediate next sibling without changing the header shell.
const inlinePageTitleContentSelector = `${INLINE_PAGE_HEADER_SELECTOR} > div[class*="_content_"] > div[class*="_headerRow_"] > div[class*="_title_"] > div[class*="_titleContent_"]`;
export const INLINE_PAGE_TITLE_SELECTOR = `${inlinePageTitleContentSelector} > h1[class~="text-default"]`;
export const INLINE_PAGE_SUBTITLE_SELECTOR = `:is(${inlinePageTitleContentSelector} > div[class~="text-secondary"], ${INLINE_PAGE_HEADER_SELECTOR} + div:is([class~="contents"], [class~="@container/searchable-header"]) > div[class~="text-secondary"][class~="text-base"][class~="leading-6"]:has(> div[class~="max-w-lg"][class~="-translate-y-1.5"]))`;

const homeSuggestionListItemSelector =
  'section[class~="group/home-suggestions"] [class~="group/home-suggestion-list-item"]';
// Interactive labels use a separate pointer-events-none copy layer above the
// hit target. Color either native copy shape without touching nested actions.
export const HOME_SUGGESTION_TEXT_SELECTOR = `:is(${homeSuggestionListItemSelector} > button, ${homeSuggestionListItemSelector} > div[class~="relative"] > div)[data-composer-mode][class~="text-start"][class~="text-size-chat"]`;
export const HOME_SUGGESTION_CAPTION_SELECTOR =
  'section[class~="group/home-suggestions"] > p[class~="text-codex-description"]' as const;
export const ASSISTANT_ACTION_BUTTON_SELECTOR =
  '.thread-scroll-container .turn-action-controls > div > button[class~="no-drag"][class~="cursor-interaction"][class~="border-transparent"]:is([class~="text-tertiary"], [class~="text-default"])' as const;

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
  ["page-search-rail", INLINE_PAGE_HEADER_SELECTOR],
  ["markdown-document", MARKDOWN_DOCUMENT_SELECTOR],
  ["dialog", '[role="dialog"]'],
] as const;

/**
 * 主窗口身份与可选样式分开：新版用已核对的 frame/workspace/main 骨架，
 * 旧版保留完整 shell 分支。标题栏或侧栏失配不能否定新版主窗口；辅助窗口
 * 即使使用同一入口也不授权注入，多个候选仍由 session 层拒绝。
 */
export function selectorProbeExpression(): string {
  return `(() => {
    const entry = new URL(location.href);
    const route = new URL(entry.searchParams.get("initialRoute") || "/", "app://-");
    const isMainEntry = entry.protocol === "app:" && entry.hostname === "-" &&
      !entry.port && !entry.username && !entry.password &&
      ["/", "/index.html"].includes(entry.pathname) &&
      route.protocol === "app:" && route.hostname === "-" && !route.port && !route.username && !route.password &&
      !/^\\/(?:avatar-overlay|spotlight|global-dictation|hotkey-window)(?:\\/|$)/u.test(route.pathname) &&
      entry.searchParams.get("window") !== "page" && route.searchParams.get("window") !== "page" &&
      !document.documentElement.classList.contains("compact-window");
    const active = (node) => !node.closest('[data-app-shell-active-page="false"]');
    const shells = Array.from(document.querySelectorAll('main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])')).filter(active);
    const sidebar = document.querySelector('aside.app-shell-left-panel');
    const titlebar = document.querySelector('div[class*="_ApplicationMenuTopBar_"], header[data-app-shell-titlebar="true"][data-pip-obstacle="app-shell-header"]');
    const header = document.querySelector('header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"])');
    const frames = document.querySelectorAll('[data-app-shell-frame="true"]');
    const rows = frames.length === 1 ? frames[0].querySelectorAll(':scope > [data-app-shell-workspace-row="true"]') : [];
    const mainSurfaces = rows.length === 1 ? Array.from(rows[0].querySelectorAll('main[data-app-shell-main-surface]')).filter(active) : [];
    const stableFrame = document.documentElement.getAttribute("data-codex-window-type") === "electron" && mainSurfaces.length === 1 && shells.length === 1;
    const legacyShell = shells.length === 1 && sidebar && titlebar && header;
    return {
      protocol: location.protocol,
      profile: ${JSON.stringify(CODEX_SELECTOR_PROFILE)},
      compatible: Boolean(isMainEntry && (stableFrame || legacyShell)),
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
