import {
  DEFAULT_BACKGROUND_SCOPE,
  DEFAULT_SIDEBAR_OVERLAY_OPACITY,
  readThemeConfiguration,
  themeTokenDeclarations,
  builtInSendIconMask,
  type BackgroundScope,
  type ThemeConfiguration,
} from "../../contracts";
import { SELECTOR_PARTS } from "./selector-profile";

interface PayloadConfig {
  marker: string;
  css: string;
  artDataUrl: string;
  backgroundScope: BackgroundScope;
  sidebarOverlayOpacity: number;
  configuredRecipes?: ThemeConfiguration["styleConfig"]["recipes"];
  sendIcon: ThemeConfiguration["styleConfig"]["sendIcon"];
  sendIconDataUrl?: string;
  sendIconMask?: string;
  appearance: ThemeConfiguration["appearance"];
  art: ThemeConfiguration["art"];
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
    configuredRecipes:
      settings.styleConfig.mode === "configured"
        ? settings.styleConfig.recipes
        : undefined,
    sendIcon: settings.styleConfig.sendIcon,
    sendIconDataUrl: settings.styleConfig.sendIconDataUrl,
    sendIconMask: builtInSendIconMask(settings.styleConfig.sendIcon),
    appearance: settings.appearance,
    art: settings.art,
    tokens: themeTokenDeclarations(settings),
    parts: SELECTOR_PARTS,
  };
  return `(() => {
    const config = ${JSON.stringify(config)};
    const ownerAttribute = "data-codexstyle-owner";
    const partAttribute = "data-ds-part";
    const partMarkerAttribute = "data-codexstyle-part";
    const styleMarkerAttribute = "data-codexstyle-style";
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
          node.removeAttribute(ownerAttribute);
          assigned.delete(node);
        }
      }
      for (const [node, part] of desired) setPart(node, part);
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
      const sidebarFallbackColor = 'color-mix(in srgb, var(--ds-theme-color-panel) ' + config.sidebarOverlayOpacity + '%, transparent)';
      const sidebarAbsoluteColor = 'rgb(from var(--ds-theme-color-panel) r g b / ' + config.sidebarOverlayOpacity + '%)';
      const sidebarBridge = config.backgroundScope === "window"
        ? '\\n[data-ds-part="sidebar"][data-codexstyle-owner="' + config.marker + '"] { background-color: ' + sidebarFallbackColor + ' !important; background-color: ' + sidebarAbsoluteColor + ' !important; }'
        : "";
      const sidebarTextSelector = '[data-ds-part="sidebar"][data-codexstyle-owner="' + config.marker + '"]';
      const sidebarTextBridge = '\\n' + sidebarTextSelector + ' { color: var(--ds-theme-color-sidebar-text) !important; }' +
        '\\n' + sidebarTextSelector + ' :where(a, button, label, p, small, strong, span, [role="button"], [role="treeitem"], [class*="text-"]) { color: var(--ds-theme-color-sidebar-text) !important; }';
      const topBarSelector = ':is([data-ds-part="titlebar"], [data-ds-part="header"])[data-codexstyle-owner="' + config.marker + '"]';
      const topBarBridge = '\\n' + topBarSelector + ' { background-color: var(--ds-theme-color-top-bar-background) !important; color: var(--ds-theme-color-top-bar-text) !important; }' +
        '\\n' + topBarSelector + ' :where(a, button, label, p, small, strong, span, [role="button"], [class*="text-"]) { color: var(--ds-theme-color-top-bar-text) !important; }';
      const threadTabSelector = '[data-ds-part="thread-tab"][data-codexstyle-owner="' + config.marker + '"]';
      const threadTabBridge = '\\n' + threadTabSelector + ' { background-color: var(--ds-theme-color-thread-tab-background) !important; border-color: var(--ds-theme-color-line) !important; color: var(--ds-theme-color-thread-tab-text) !important; }' +
        '\\n' + threadTabSelector + ' :where(a, button, label, p, small, strong, span, svg, [role="button"], [class*="text-"]) { color: var(--ds-theme-color-thread-tab-text) !important; }';
      const homeTitleSelector = '[data-ds-part="home-title"][data-codexstyle-owner="' + config.marker + '"]';
      const homeTitleBridge = '\\n' + homeTitleSelector + ' { color: var(--ds-theme-color-home-title-text) !important; }' +
        '\\n' + homeTitleSelector + ' :where(a, code, em, span, strong, [class*="text-"]) { color: var(--ds-theme-color-home-title-text) !important; }';
      const homeCardSelector = '[data-ds-part="home-card"][data-codexstyle-owner="' + config.marker + '"]';
      const homeCardBridge = '\\n' + homeCardSelector + ' { background-color: var(--ds-theme-color-home-card-background) !important; border-color: var(--ds-theme-color-line) !important; color: var(--ds-theme-color-home-card-text) !important; }' +
        '\\n' + homeCardSelector + ' :where(a, button, code, em, label, p, small, strong, span, [class*="text-"]) { color: var(--ds-theme-color-home-card-text) !important; }';
      const userMessageSelector = '[data-ds-part="message"][data-user-message-bubble="true"][data-codexstyle-owner="' + config.marker + '"]';
      const userMessageTextBridge = '\\n' + userMessageSelector + ' { color: var(--ds-theme-color-user-message-text) !important; }' +
        '\\n' + userMessageSelector + ' :where(a, code, em, p, span, strong) { color: var(--ds-theme-color-user-message-text) !important; }';
      const assistantMessageSelector = '[data-ds-part="message"][data-markdown-text-style="assistant-message"][data-codexstyle-owner="' + config.marker + '"]';
      const assistantMessageTextBridge = '\\n' + assistantMessageSelector + ' { color: var(--ds-theme-color-assistant-message-text) !important; }' +
        '\\n' + assistantMessageSelector + ' :where(blockquote, em, h1, h2, h3, h4, h5, h6, li, p, small, strong, td, th) { color: var(--ds-theme-color-assistant-message-text) !important; }';
      const changeCardSelector = '[data-ds-part="change-card"][data-codexstyle-owner="' + config.marker + '"]';
      const changeCardBridge = '\\n' + changeCardSelector + ' { --codex-diffs-surface-override: var(--ds-theme-color-change-card-background) !important; background-color: var(--ds-theme-color-change-card-background) !important; color: var(--ds-theme-color-change-card-text) !important; }' +
        '\\n' + changeCardSelector + ' :where(button, [class~="text-default"], [class~="text-secondary"]) { color: var(--ds-theme-color-change-card-text) !important; }';
      const activitySelector = '[data-ds-part="activity"][data-codexstyle-owner="' + config.marker + '"]';
      const activityBridge = '\\n' + activitySelector + ' { background-color: var(--ds-theme-color-activity-background) !important; border-radius: var(--ds-theme-surface-radius); box-shadow: inset 0 0 0 1px var(--ds-theme-color-line); color: var(--ds-theme-color-activity-text) !important; }' +
        '\\n' + activitySelector + ' :where(a, button, code, em, p, span, strong, svg) { color: var(--ds-theme-color-activity-text) !important; }' +
        '\\n' + activitySelector + ' :where(small, [class*="text-secondary"], [class*="text-tertiary"], [class*="text-text/"], [class*="text-codex-description"]) { color: var(--ds-theme-color-activity-muted) !important; }';
      const composerSelector = '[data-ds-part="composer"][data-codexstyle-owner="' + config.marker + '"]';
      const composerToolbarSelector = '[data-ds-part="composer-toolbar"][data-codexstyle-owner="' + config.marker + '"]';
      const composerPlaceholderSelector = composerSelector + ' :where([data-placeholder], [aria-placeholder])';
      const composerPlaceholderNodeSelector = composerSelector + ' :where([data-placeholder], [aria-placeholder]):not([contenteditable="true"]):not(input):not(textarea)';
      const composerMutedBridge = '\\n' + composerPlaceholderNodeSelector + ' { color: var(--ds-theme-color-muted) !important; }' +
        '\\n' + composerPlaceholderSelector + '::before, ' + composerPlaceholderSelector + '::after { color: var(--ds-theme-color-muted) !important; }' +
        '\\n' + composerSelector + ' :where(input, textarea)::placeholder { color: var(--ds-theme-color-muted) !important; opacity: 1 !important; }';
      const composerPermissionSelector = composerToolbarSelector + ' [data-permission-mode]';
      const configuredSurfaceBridge = config.configuredRecipes
        ? '\\n' + rootSelector + ' ::selection { background-color: var(--ds-theme-color-highlight); color: var(--ds-theme-color-background); }' +
          (config.configuredRecipes.sidebar && config.backgroundScope === "content"
            ? '\\n' + sidebarTextSelector + ' { background-color: var(--ds-theme-color-panel) !important; }'
            : '') +
          (config.configuredRecipes.composer
            ? '\\n' + composerSelector + ' { background-color: color-mix(in srgb, var(--ds-theme-color-panel-alt) 88%, transparent) !important; }' +
              '\\n' + composerSelector + ':focus-within { border-color: var(--ds-theme-color-accent-alt) !important; }' +
              '\\n' + composerToolbarSelector + ' :where(button, span) { color: var(--ds-theme-color-secondary) !important; }' +
              '\\n' + composerPermissionSelector + ' { color: var(--ds-theme-color-accent) !important; }' +
              '\\n[data-ds-part="composer-submit"][data-codexstyle-owner="' + config.marker + '"] { background-color: var(--ds-theme-color-accent) !important; color: var(--ds-theme-color-background) !important; }'
            : '') +
          (config.configuredRecipes.message
            ? '\\n' + userMessageSelector + ' { background-color: color-mix(in srgb, var(--ds-theme-color-panel-alt) 92%, transparent) !important; }'
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
              ? '\\n' + sendIconSelector + '::after { content: ""; display: block; width: 20px; height: 20px; background-color: var(--ds-theme-color-background); -webkit-mask-image: url("' + config.sendIconMask + '"); mask-image: url("' + config.sendIconMask + '"); -webkit-mask-position: center; mask-position: center; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-size: contain; mask-size: contain; }'
              : "");
      const source = config.css + "\\n" + tokenBridge + "\\n" + backgroundBridge + mainSurfaceBridge + edgeFadeBridge + sidebarBridge + sidebarTextBridge + topBarBridge + threadTabBridge + homeTitleBridge + homeCardBridge + userMessageTextBridge + assistantMessageTextBridge + changeCardBridge + activityBridge + composerMutedBridge + configuredSurfaceBridge + assistantMessageBridge + sendIconBridge;
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
        attributeFilter: ["aria-label", "class"],
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
