import {
  DEFAULT_BACKGROUND_SCOPE,
  DEFAULT_SIDEBAR_OVERLAY_OPACITY,
  SIDEBAR_OVERLAY_RGB,
  readThemeConfiguration,
  themeTokenDeclarations,
  builtInSendIconMask,
  type BackgroundScope,
  type ThemeConfiguration,
} from "../../contracts";
import {
  EDGE_SCROLL_THREAD_TITLE_SELECTOR,
  HOME_COMPOSER_RAIL_SELECTOR,
  PLUGIN_SEARCH_RAIL_SELECTOR,
  SELECTOR_PARTS,
} from "./selector-profile";

interface PayloadConfig {
  marker: string;
  css: string;
  artDataUrl: string;
  backgroundScope: BackgroundScope;
  sidebarOverlayOpacity: number;
  sidebarOverlayRgb: string;
  configuredRecipes?: ThemeConfiguration["styleConfig"]["recipes"];
  sendIcon: ThemeConfiguration["styleConfig"]["sendIcon"];
  sendIconDataUrl?: string;
  sendIconMask?: string;
  appearance: ThemeConfiguration["appearance"];
  art: ThemeConfiguration["art"];
  homeCards: ThemeConfiguration["homeCards"];
  edgeScrollThreadTitleSelector: string;
  homeComposerRailSelector: string;
  pluginSearchRailSelector: string;
  tokens: Array<readonly [string, string]>;
  parts: ReadonlyArray<readonly [string, string]>;
}

export interface ThemePayloadSettings extends ThemeConfiguration {
  backgroundScope: BackgroundScope;
  sidebarOverlayOpacity: number;
}

/**
 * Builds the only renderer-side mutation performed by the main process. Its
 * caller has already revalidated CSS, image bytes, target identity, and the
 * selector profile. It only mutates attributes and styles carrying its marker.
 */
export function buildThemePayload(
  marker: string,
  css: string,
  artDataUrl: string,
  settings: ThemePayloadSettings = defaultPayloadSettings(),
): string {
  const config: PayloadConfig = {
    marker,
    css,
    artDataUrl,
    backgroundScope: settings.backgroundScope,
    sidebarOverlayOpacity: settings.sidebarOverlayOpacity,
    sidebarOverlayRgb: SIDEBAR_OVERLAY_RGB,
    configuredRecipes:
      settings.styleConfig.mode === "configured"
        ? settings.styleConfig.recipes
        : undefined,
    sendIcon: settings.styleConfig.sendIcon,
    sendIconDataUrl: settings.styleConfig.sendIconDataUrl,
    sendIconMask: builtInSendIconMask(settings.styleConfig.sendIcon),
    appearance: settings.appearance,
    art: settings.art,
    homeCards: settings.homeCards,
    edgeScrollThreadTitleSelector: EDGE_SCROLL_THREAD_TITLE_SELECTOR,
    homeComposerRailSelector: HOME_COMPOSER_RAIL_SELECTOR,
    pluginSearchRailSelector: PLUGIN_SEARCH_RAIL_SELECTOR,
    tokens: themeTokenDeclarations(settings),
    parts: SELECTOR_PARTS,
  };
  return `(() => {
    const config = ${JSON.stringify(config)};
    const ownerAttribute = "data-codexstyle-owner";
    const partAttribute = "data-ds-part";
    const partMarkerAttribute = "data-codexstyle-part";
    const styleMarkerAttribute = "data-codexstyle-style";
    const homeCardIndexAttribute = "data-codexstyle-home-card-index";
    const observingAttribute = "data-codexstyle-observing";
    const styleSelector = 'style[' + styleMarkerAttribute + '="1"][' + ownerAttribute + '="' + config.marker + '"]';
    const assigned = new Set();
    let timer;

    const setPart = (node, part) => {
      if (!node || typeof node.setAttribute !== "function") return;
      if (node.hasAttribute(partAttribute) && node.getAttribute(ownerAttribute) !== config.marker) return;
      if (node.getAttribute(ownerAttribute) !== config.marker) {
        node.setAttribute(ownerAttribute, config.marker);
      }
      if (node.getAttribute(partAttribute) !== part) node.setAttribute(partAttribute, part);
      node.setAttribute(partMarkerAttribute, "1");
      assigned.add(node);
    };

    const ownedStyle = () => document.querySelector(styleSelector);

    const ensureStyle = (root) => {
      let style = ownedStyle();
      if (style) return style;
      style = document.createElement("style");
      style.setAttribute(ownerAttribute, config.marker);
      style.setAttribute(styleMarkerAttribute, "1");
      (document.head || root).appendChild(style);
      return style;
    };

    const apply = () => {
      if (location.protocol !== "app:") return false;
      const root = document.documentElement;
      if (!root) return false;
      if (root.hasAttribute(partAttribute) && root.getAttribute(ownerAttribute) !== config.marker) return false;
      const desired = new Map();
      desired.set(root, "root");
      if (document.body) desired.set(document.body, "canvas");
      for (const [part, selector] of config.parts) {
        try {
          for (const node of document.querySelectorAll(selector)) {
            if (!desired.has(node)) desired.set(node, part);
          }
        } catch {}
      }
      for (const node of [...assigned]) {
        if (!desired.has(node) && node.getAttribute(ownerAttribute) === config.marker) {
          node.removeAttribute(partAttribute);
          node.removeAttribute(partMarkerAttribute);
          node.removeAttribute(homeCardIndexAttribute);
          node.removeAttribute(ownerAttribute);
          assigned.delete(node);
        }
      }
      for (const [node, part] of desired) setPart(node, part);
      const ownedHomeCards = Array.from(document.querySelectorAll('[data-ds-part="home-card"][data-codexstyle-owner="' + config.marker + '"]'));
      for (const [index, node] of ownedHomeCards.entries()) {
        if (index < config.homeCards.length) node.setAttribute(homeCardIndexAttribute, String(index));
        else node.removeAttribute(homeCardIndexAttribute);
      }
      const style = ensureStyle(root);
      root.setAttribute("data-codexstyle-appearance", config.appearance);
      root.setAttribute("data-codexstyle-safe-area", config.art.safeArea);
      root.setAttribute("data-codexstyle-task-mode", config.art.taskMode);
      const rootSelector = '[data-ds-part="root"][data-codexstyle-owner="' + config.marker + '"]';
      const canvasSelector = '[data-ds-part="canvas"][data-codexstyle-owner="' + config.marker + '"]';
      const mainSelector = '[data-ds-part="main"][data-codexstyle-owner="' + config.marker + '"]';
      const tokenDeclarations = config.tokens.map(([property, value]) => property + ': ' + value + ';').join(' ');
      const colorScheme = config.appearance === "auto" ? "light dark" : config.appearance;
      const tokenBridge = rootSelector + ' { ' + tokenDeclarations + ' color-scheme: ' + colorScheme + '; accent-color: var(--ds-theme-color-accent); }';
      const taskLayer = config.art.taskMode === "ambient"
        ? 'linear-gradient(rgb(2 6 23 / 0.18), rgb(2 6 23 / 0.36)), '
        : '';
      const safeAreaLayer = config.art.safeArea === "left"
        ? 'linear-gradient(90deg, rgb(2 6 23 / 0.42), transparent 38%), '
        : config.art.safeArea === "right"
          ? 'linear-gradient(270deg, rgb(2 6 23 / 0.42), transparent 38%), '
          : '';
      const backgroundImage = config.art.taskMode === "off"
        ? 'none'
        : taskLayer + safeAreaLayer + 'url("' + config.artDataUrl + '")';
      const backgroundTargets = config.backgroundScope === "window"
        ? rootSelector + ', ' + canvasSelector
        : mainSelector;
      const backgroundAttachment = config.backgroundScope === "window"
        ? ' background-attachment: fixed !important;'
        : '';
      const backgroundBridge = backgroundTargets + ' { background-image: ' + backgroundImage + ' !important; background-size: cover !important; background-position: ' + (config.art.focusX * 100) + '% ' + (config.art.focusY * 100) + '% !important; background-repeat: no-repeat !important;' + backgroundAttachment + ' }';
      const mainSurfaceBridge = config.backgroundScope === "window" && config.art.taskMode !== "off"
        ? '\\n[data-ds-part="main"][data-codexstyle-owner="' + config.marker + '"] { background-color: var(--ds-theme-color-background) !important; }'
        : "";
      const edgeFadeBridge = config.backgroundScope === "window" && config.art.taskMode !== "off"
        ? '\\n[data-ds-part="main-top-fade"][data-codexstyle-owner="' + config.marker + '"] { background-color: transparent !important; background-image: none !important; }' +
          '\\n.thread-scroll-container [aria-hidden="true"][class~="bg-gradient-to-t"][class~="from-surface"][class~="via-surface"] { background-color: transparent !important; background-image: none !important; }'
        : "";
      const pluginSearchRailPartSelector = '[data-ds-part="plugins-search-rail"][data-codexstyle-owner="' + config.marker + '"]';
      const instantPluginSearchRailSelector = rootSelector + ' ' + config.pluginSearchRailSelector;
      const pluginSearchRailBridge = '\\n' + pluginSearchRailPartSelector + ', ' + instantPluginSearchRailSelector + ' { background-color: var(--ds-theme-color-background) !important; }' +
        '\\n' + pluginSearchRailPartSelector + '::after, ' + instantPluginSearchRailSelector + '::after { background-image: linear-gradient(to bottom, var(--ds-theme-color-background), transparent) !important; }';
      // Keep the panel color's own alpha independent from the legacy overlay
      // strength. The shorthand also clears native background layers, while the
      // paired ::after rule prevents Codex's inherited edge surface from staying opaque.
      const sidebarOverlayLayer = 'linear-gradient(rgb(' + config.sidebarOverlayRgb + ' / ' + config.sidebarOverlayOpacity + '%), rgb(' + config.sidebarOverlayRgb + ' / ' + config.sidebarOverlayOpacity + '%))';
      const sidebarBackground = sidebarOverlayLayer + ', var(--ds-theme-color-panel)';
      const sidebarSelector = '[data-ds-part="sidebar"][data-codexstyle-owner="' + config.marker + '"]';
      const sidebarBridge = config.backgroundScope === "window"
        ? '\\n' + sidebarSelector + ', ' + sidebarSelector + '::after { background: ' + sidebarBackground + ' !important; }'
        : "";
      const sidebarTextSelector = sidebarSelector;
      const sidebarTextBridge = '\\n' + sidebarTextSelector + ' { color: var(--ds-theme-color-sidebar-text) !important; }' +
        '\\n' + sidebarTextSelector + ' :where(a, button, label, p, small, strong, span, [role="button"], [role="treeitem"], [class*="text-"]) { color: var(--ds-theme-color-sidebar-text) !important; }';
      const topBarSelector = ':is([data-ds-part="titlebar"], [data-ds-part="header"])[data-codexstyle-owner="' + config.marker + '"]';
      const topBarBridge = '\\n' + topBarSelector + ' { background-color: var(--ds-theme-color-top-bar-background) !important; color: var(--ds-theme-color-top-bar-text) !important; }' +
        '\\n' + topBarSelector + ' :where(a, button, label, p, small, strong, span, [role="button"], [class*="text-"]) { color: var(--ds-theme-color-top-bar-text) !important; }';
      const threadTabSelector = '[data-ds-part="thread-tab"][data-codexstyle-owner="' + config.marker + '"]';
      const threadTabBridge = '\\n' + threadTabSelector + ' { --app-shell-tab-background: var(--ds-theme-color-thread-tab-background) !important; background-color: var(--ds-theme-color-thread-tab-background) !important; border-color: var(--ds-theme-color-line) !important; color: var(--ds-theme-color-thread-tab-text) !important; }' +
        '\\n' + threadTabSelector + ' :where(a, button, label, p, small, strong, span, svg, [role="button"], [class*="text-"]) { color: var(--ds-theme-color-thread-tab-text) !important; }';
      const instantThreadTitleSelector = rootSelector + ' ' + config.edgeScrollThreadTitleSelector;
      const instantThreadTitleBridge = '\\n' + instantThreadTitleSelector + ' { background-color: var(--ds-theme-color-thread-tab-background) !important; border-color: var(--ds-theme-color-line) !important; color: var(--ds-theme-color-thread-tab-text) !important; }' +
        '\\n' + instantThreadTitleSelector + ' :where(a, button, label, p, small, strong, span, svg, [role="button"], [class*="text-"]) { color: var(--ds-theme-color-thread-tab-text) !important; }';
      const homeTitleSelector = '[data-ds-part="home-title"][data-codexstyle-owner="' + config.marker + '"]';
      const homeTitleBridge = '\\n' + homeTitleSelector + ' { color: var(--ds-theme-color-home-title-text) !important; }' +
        '\\n' + homeTitleSelector + ' :where(a, code, em, span, strong, [class*="text-"]) { color: var(--ds-theme-color-home-title-text) !important; }';
      const homeCardSelector = '[data-ds-part="home-card"][data-codexstyle-owner="' + config.marker + '"]';
      const homeCardBridge = config.homeCards.map((card, index) => {
        const selector = homeCardSelector + '[' + homeCardIndexAttribute + '="' + index + '"]';
        const image = card.mode === "image" && card.imageDataUrl ? 'url("' + card.imageDataUrl + '")' : 'none';
        return '\\n' + selector + ' { background-color: ' + card.color + ' !important; background-image: ' + image + ' !important; background-position: center !important; background-repeat: no-repeat !important; background-size: cover !important; border-color: var(--ds-theme-color-line) !important; color: var(--ds-theme-color-home-card-text) !important; }';
      }).join('') +
        '\\n' + homeCardSelector + ' :where(a, button, code, em, label, p, small, strong, span, [class*="text-"]) { color: var(--ds-theme-color-home-card-text) !important; }';
      const userMessageSelector = '[data-ds-part="message"][data-user-message-bubble="true"][data-codexstyle-owner="' + config.marker + '"]';
      const userMessageTextBridge = '\\n' + userMessageSelector + ' { color: var(--ds-theme-color-user-message-text) !important; }' +
        '\\n' + userMessageSelector + ' :where(a, code, em, p, span, strong) { color: var(--ds-theme-color-user-message-text) !important; }';
      const assistantMessageSelector = '[data-ds-part="message"][data-markdown-text-style="assistant-message"][data-codexstyle-owner="' + config.marker + '"]';
      const assistantMessageOrdinaryTextSelector = assistantMessageSelector + ' :where(blockquote, em, h1, h2, h3, h4, h5, h6, li, p, small, strong, td, th)';
      const assistantMessageAnimatedTextSelector = assistantMessageOrdinaryTextSelector + ' > span[class*="_FadeIn_"]:not(:has(a, code, pre, [data-markdown-copy="inline-code"]))';
      const assistantMessageTextBridge = '\\n' + assistantMessageSelector + ' { color: var(--ds-theme-color-assistant-message-text) !important; }' +
        '\\n' + assistantMessageOrdinaryTextSelector + ' { color: var(--ds-theme-color-assistant-message-text) !important; }' +
        '\\n' + assistantMessageAnimatedTextSelector + ' { color: var(--ds-theme-color-assistant-message-text) !important; }';
      const changeCardSelector = '[data-ds-part="change-card"][data-codexstyle-owner="' + config.marker + '"]';
      const changeCardListSelector = changeCardSelector + ' > [class*="--codex-diffs-surface-override"]';
      const changeCardRowButtonSelector = changeCardSelector + ' [class~="group/turn-diff-file-row"] button';
      const changeCardListActionSelector = changeCardListSelector + ' > button';
      const changeCardDiffSelector = changeCardSelector + ' [class~="group/file-diff"]';
      const changeCardOrdinaryTextSelector = changeCardSelector + ' :where([class~="text-default"], [class~="text-secondary"], [class~="text-codex-description"], [class*="text-codex-description/"]):not([class~="text-codex-git-added"]):not([class~="text-codex-git-deleted"])';
      const changeCardPrimaryActionSelector = changeCardSelector + ' [class~="group/turn-diff-header"] button:is([class~="bg-primary-solid"], [class~="bg-primary-soft-alpha"], [data-variant="primary"])';
      const changeCardPlainActionSelector = changeCardSelector + ' [class~="group/turn-diff-header"] button:not(:is([class~="bg-primary-solid"], [class~="bg-primary-soft-alpha"], [data-variant="primary"]))';
      // The Store card's list, row buttons, and optional inline diff all paint
      // their own surfaces. Make the owned root the only themed translucent layer
      // so alpha is not compounded, while preserving semantic added/deleted colors.
      const changeCardTransparentSurface = '--codex-diffs-surface-override: transparent !important; --codex-diffs-surface: transparent !important; --codex-diffs-header-surface: transparent !important;';
      const changeCardBridge = '\\n' + changeCardSelector + ' { ' + changeCardTransparentSurface + ' background: var(--ds-theme-color-change-card-background) !important; color: var(--ds-theme-color-change-card-text) !important; }' +
        '\\n' + changeCardListSelector + ' { ' + changeCardTransparentSurface + ' background: transparent !important; }' +
        '\\n' + changeCardDiffSelector + ' { background-color: transparent !important; }' +
        '\\n' + changeCardRowButtonSelector + ', ' + changeCardListActionSelector + ' { background-color: transparent !important; color: var(--ds-theme-color-change-card-text) !important; }' +
        '\\n' + changeCardRowButtonSelector + ':hover, ' + changeCardListActionSelector + ':hover { background-color: color-mix(in srgb, var(--ds-theme-color-change-card-text) 8%, transparent) !important; }' +
        '\\n' + changeCardOrdinaryTextSelector + ' { color: var(--ds-theme-color-change-card-text) !important; }' +
        '\\n' + changeCardListActionSelector + ' :where(span, svg, [class*="text-"]) { color: var(--ds-theme-color-change-card-text) !important; -webkit-text-fill-color: var(--ds-theme-color-change-card-text) !important; }' +
        '\\n' + changeCardPlainActionSelector + ', ' + changeCardPlainActionSelector + ' :where(span, svg, [class*="text-"]) { color: var(--ds-theme-color-change-card-text) !important; -webkit-text-fill-color: var(--ds-theme-color-change-card-text) !important; }' +
        '\\n' + changeCardPrimaryActionSelector + ' { background-color: var(--ds-theme-color-accent) !important; border-color: var(--ds-theme-color-accent-alt) !important; color: var(--ds-theme-color-accent-text) !important; -webkit-text-fill-color: var(--ds-theme-color-accent-text) !important; }' +
        '\\n' + changeCardPrimaryActionSelector + ' :where(span, svg, [class*="text-"]) { color: var(--ds-theme-color-accent-text) !important; -webkit-text-fill-color: var(--ds-theme-color-accent-text) !important; }' +
        '\\n' + changeCardPrimaryActionSelector + ':hover { background-color: color-mix(in srgb, var(--ds-theme-color-accent) 84%, var(--ds-theme-color-accent-text)) !important; color: var(--ds-theme-color-accent-text) !important; -webkit-text-fill-color: var(--ds-theme-color-accent-text) !important; }';
      const activitySelector = '[data-ds-part="activity"][data-codexstyle-owner="' + config.marker + '"]';
      const activityOwnedSelector = rootSelector + ' ' + activitySelector + '[data-codexstyle-part="1"]';
      const activityBridge = '\\n' + activityOwnedSelector + ' { background-color: var(--ds-theme-color-activity-background) !important; border-radius: var(--ds-theme-surface-radius); box-shadow: inset 0 0 0 1px var(--ds-theme-color-line); color: var(--ds-theme-color-activity-text) !important; -webkit-text-fill-color: var(--ds-theme-color-activity-text) !important; }' +
        '\\n' + activityOwnedSelector + ' :where(a, button, code, em, p, span, strong, svg) { color: var(--ds-theme-color-activity-text) !important; -webkit-text-fill-color: var(--ds-theme-color-activity-text) !important; }' +
        '\\n' + activityOwnedSelector + ' :where(small, [class*="text-secondary"], [class*="text-tertiary"], [class*="text-text/40"], [class*="text-codex-description"]) { color: var(--ds-theme-color-activity-muted) !important; -webkit-text-fill-color: var(--ds-theme-color-activity-muted) !important; }';
      const composerSelector = '[data-ds-part="composer"][data-codexstyle-owner="' + config.marker + '"]';
      const composerToolbarSelector = '[data-ds-part="composer-toolbar"][data-codexstyle-owner="' + config.marker + '"]';
      const instantHomeComposerRailSelector = rootSelector + ' ' + config.homeComposerRailSelector;
      const composerBodySelector = composerSelector + ' > [data-composer-layout]:not([data-composer-surface-variant])';
      const composerInputSelector = composerSelector + ' :where([data-codex-composer][contenteditable="true"], input[data-codex-composer], textarea[data-codex-composer])';
      const composerPlaceholderSelector = composerSelector + ' :where([data-placeholder], [aria-placeholder])';
      const composerPlaceholderNodeSelector = composerSelector + ' :where([data-placeholder], [aria-placeholder]):not([contenteditable="true"]):not(input):not(textarea)';
      const composerMutedBridge = '\\n' + composerPlaceholderNodeSelector + ' { color: var(--ds-theme-color-muted) !important; }' +
        '\\n' + composerPlaceholderSelector + '::before, ' + composerPlaceholderSelector + '::after { color: var(--ds-theme-color-muted) !important; }' +
        '\\n' + composerSelector + ' :where(input, textarea)::placeholder { color: var(--ds-theme-color-muted) !important; opacity: 1 !important; }';
      const composerTextBridge = '\\n' + composerInputSelector + ' { color: var(--ds-theme-color-composer-text) !important; caret-color: var(--ds-theme-color-composer-text) !important; }';
      const composerPermissionSelector = composerToolbarSelector + ' [data-permission-mode]';
      const configuredSurfaceBridge = config.configuredRecipes
        ? '\\n' + rootSelector + ' ::selection { background-color: var(--ds-theme-color-highlight); color: var(--ds-theme-color-selection-text); }' +
          (config.configuredRecipes.sidebar && config.backgroundScope === "content"
            ? '\\n' + sidebarTextSelector + ' { background-color: var(--ds-theme-color-panel) !important; }'
            : '') +
          (config.configuredRecipes.composer
            ? '\\n' + composerSelector + ' { background-color: var(--ds-theme-color-panel-alt) !important; }' +
              '\\n' + composerBodySelector + ' { background-color: transparent !important; color: var(--ds-theme-color-composer-text) !important; }' +
              '\\n' + instantHomeComposerRailSelector + ' { background-color: var(--ds-theme-color-panel-alt) !important; border-color: var(--ds-theme-color-line) !important; }' +
              '\\n' + instantHomeComposerRailSelector + ' :where(button, span, svg, [class*="text-"]) { color: var(--ds-theme-color-secondary) !important; }' +
              '\\n' + composerSelector + ':focus-within { border-color: var(--ds-theme-color-accent-alt) !important; }' +
              '\\n' + composerToolbarSelector + ' :where(button, span) { color: var(--ds-theme-color-secondary) !important; }' +
              '\\n' + composerPermissionSelector + ' { color: var(--ds-theme-color-accent) !important; }' +
              '\\n[data-ds-part="composer-submit"][data-codexstyle-owner="' + config.marker + '"] { background-color: var(--ds-theme-color-accent) !important; color: var(--ds-theme-color-accent-text) !important; }'
            : '') +
          (config.configuredRecipes.message
            ? '\\n' + userMessageSelector + ' { background-color: var(--ds-theme-color-panel-alt) !important; }'
            : '') +
          (config.configuredRecipes.dialog
            ? '\\n[data-ds-part="dialog"][data-codexstyle-owner="' + config.marker + '"] { background-color: var(--ds-theme-color-panel) !important; }'
            : '')
        : '';
      const assistantMessageBridge = config.configuredRecipes?.message
        ? '\\n' + assistantMessageSelector + ' { box-sizing: border-box; background-color: color-mix(in srgb, var(--ds-theme-color-assistant-panel) 92%, transparent) !important; padding: 12px 16px; }'
        : "";
      const sendIconSelector = '[data-ds-part="composer-submit"][data-codexstyle-owner="' + config.marker + '"]';
      const sendIconBridge = config.sendIcon === "native"
        ? ""
        : '\\n' + sendIconSelector + ' > svg { display: none !important; }' +
          (config.sendIcon === "custom" && config.sendIconDataUrl
            ? '\\n' + sendIconSelector + '::after { content: ""; display: block; width: 20px; height: 20px; background-image: url("' + config.sendIconDataUrl + '"); background-position: center; background-repeat: no-repeat; background-size: contain; }'
            : config.sendIconMask
              ? '\\n' + sendIconSelector + '::after { content: ""; display: block; width: 20px; height: 20px; background-color: var(--ds-theme-color-accent-text); -webkit-mask-image: url("' + config.sendIconMask + '"); mask-image: url("' + config.sendIconMask + '"); -webkit-mask-position: center; mask-position: center; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-size: contain; mask-size: contain; }'
              : "");
      const source = config.css + "\\n" + tokenBridge + "\\n" + backgroundBridge + mainSurfaceBridge + edgeFadeBridge + pluginSearchRailBridge + sidebarBridge + sidebarTextBridge + topBarBridge + threadTabBridge + instantThreadTitleBridge + homeTitleBridge + homeCardBridge + userMessageTextBridge + assistantMessageTextBridge + changeCardBridge + activityBridge + composerTextBridge + composerMutedBridge + configuredSurfaceBridge + assistantMessageBridge + sendIconBridge;
      if (style.textContent !== source) style.textContent = source;
      return true;
    };

    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; apply(); }, 80);
    };
    if (!apply()) return false;
    const style = ownedStyle();
    if (
      typeof MutationObserver === "function" &&
      document.documentElement &&
      style?.getAttribute(observingAttribute) !== config.marker
    ) {
      style?.setAttribute(observingAttribute, config.marker);
      const observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-label", "aria-selected", "class"],
      });
    }
    return true;
  })()`;
}

function defaultPayloadSettings(): ThemePayloadSettings {
  return {
    ...readThemeConfiguration({}),
    backgroundScope: DEFAULT_BACKGROUND_SCOPE,
    sidebarOverlayOpacity: DEFAULT_SIDEBAR_OVERLAY_OPACITY,
  };
}
