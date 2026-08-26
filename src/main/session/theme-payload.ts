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
  configuredMessagePadding: boolean;
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
    configuredMessagePadding:
      settings.styleConfig.mode === "configured" &&
      settings.styleConfig.recipes.message,
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
      const backgroundPart = config.backgroundScope === "window" ? "root" : "main";
      const rootSelector = '[data-ds-part="root"][data-codexstyle-owner="' + config.marker + '"]';
      const tokenDeclarations = config.tokens.map(([property, value]) => property + ': ' + value + ';').join(' ');
      const colorScheme = config.appearance === "auto" ? "light dark" : config.appearance;
      const tokenBridge = rootSelector + ' { ' + tokenDeclarations + ' color-scheme: ' + colorScheme + '; }';
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
      const backgroundBridge = '[data-ds-part="' + backgroundPart + '"][data-codexstyle-owner="' + config.marker + '"] { background-image: ' + backgroundImage + '; background-size: cover; background-position: ' + (config.art.focusX * 100) + '% ' + (config.art.focusY * 100) + '%; background-repeat: no-repeat; }';
      const mainSurfaceBridge = config.backgroundScope === "window" && config.art.taskMode !== "off"
        ? '\\n[data-ds-part="main"][data-codexstyle-owner="' + config.marker + '"] { background-color: color-mix(in srgb, var(--ds-theme-color-background) 88%, transparent) !important; }'
        : "";
      const edgeFadeBridge = config.backgroundScope === "window" && config.art.taskMode !== "off"
        ? '\\n[data-ds-part="main-top-fade"][data-codexstyle-owner="' + config.marker + '"] { background-color: transparent !important; background-image: none !important; }' +
          '\\n.thread-scroll-container [aria-hidden="true"][class~="bg-gradient-to-t"][class~="from-surface"][class~="via-surface"] { background-color: transparent !important; background-image: none !important; }'
        : "";
      const sidebarColor = 'color-mix(in srgb, var(--ds-theme-color-panel) ' + config.sidebarOverlayOpacity + '%, transparent)';
      const sidebarBridge = config.backgroundScope === "window"
        ? '\\n[data-ds-part="sidebar"][data-codexstyle-owner="' + config.marker + '"] { background-color: ' + sidebarColor + ' !important; }'
        : "";
      const sidebarTextSelector = '[data-ds-part="sidebar"][data-codexstyle-owner="' + config.marker + '"]';
      const sidebarTextBridge = '\\n' + sidebarTextSelector + ' { color: var(--ds-theme-color-sidebar-text) !important; }' +
        '\\n' + sidebarTextSelector + ' :where(a, button, label, p, small, strong, span, [role="button"], [role="treeitem"], [class*="text-"]) { color: var(--ds-theme-color-sidebar-text) !important; }';
      const assistantMessageBridge = config.configuredMessagePadding
        ? '\\n[data-ds-part="message"][data-markdown-text-style="assistant-message"][data-codexstyle-owner="' + config.marker + '"] { box-sizing: border-box; background-color: var(--ds-theme-color-assistant-panel) !important; padding: 12px 16px; }'
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
      const source = config.css + "\\n" + tokenBridge + "\\n" + backgroundBridge + mainSurfaceBridge + edgeFadeBridge + sidebarBridge + sidebarTextBridge + assistantMessageBridge + sendIconBridge;
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
