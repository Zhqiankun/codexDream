import {
  isThemeIconDataUrl,
  isThemeSendIcon,
  type ThemeSendIcon,
} from "./send-icon";

export type ThemeAppearance = "auto" | "light" | "dark";
export type ThemeSafeArea = "none" | "left" | "right";
export type ThemeTaskMode = "ambient" | "full" | "off";
export type ThemeShadow = "none" | "soft" | "strong";
export type ThemeStyleMode = "configured" | "advanced";

export interface ThemeArt {
  focusX: number;
  focusY: number;
  safeArea: ThemeSafeArea;
  taskMode: ThemeTaskMode;
}

export interface ThemeColors {
  background: string;
  panel: string;
  sidebarText: string;
  panelAlt: string;
  assistantPanel: string;
  assistantMessageText: string;
  userMessageText: string;
  changeCardBackground: string;
  changeCardText: string;
  topBarBackground: string;
  topBarText: string;
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
  text: string;
  muted: string;
  line: string;
}

export interface ThemeStyleRecipes {
  sidebar: boolean;
  composer: boolean;
  message: boolean;
  dialog: boolean;
}

export interface ThemeStyleConfig {
  mode: ThemeStyleMode;
  recipes: ThemeStyleRecipes;
  sendIcon: ThemeSendIcon;
  sendIconDataUrl?: string;
  blur: number;
  radius: number;
  borderWidth: number;
  shadow: ThemeShadow;
}

export interface ThemeConfiguration {
  appearance: ThemeAppearance;
  art: ThemeArt;
  colors: ThemeColors;
  styleConfig: ThemeStyleConfig;
}

export const THEME_COLOR_KEYS = [
  "background",
  "panel",
  "sidebarText",
  "panelAlt",
  "assistantPanel",
  "assistantMessageText",
  "userMessageText",
  "changeCardBackground",
  "changeCardText",
  "topBarBackground",
  "topBarText",
  "accent",
  "accentAlt",
  "secondary",
  "highlight",
  "text",
  "muted",
  "line",
] as const satisfies ReadonlyArray<keyof ThemeColors>;

const OPTIONAL_THEME_COLOR_KEYS = new Set<keyof ThemeColors>([
  "sidebarText",
  "assistantPanel",
  "assistantMessageText",
  "userMessageText",
  "changeCardBackground",
  "changeCardText",
  "topBarBackground",
  "topBarText",
]);

const LEGACY_THEME_COLOR_KEYS = THEME_COLOR_KEYS.filter(
  (key) => !OPTIONAL_THEME_COLOR_KEYS.has(key),
);

export const DEFAULT_THEME_ART: ThemeArt = {
  focusX: 0.5,
  focusY: 0.5,
  safeArea: "none",
  taskMode: "ambient",
};

export const DEFAULT_THEME_COLORS: ThemeColors = {
  background: "#181818",
  panel: "#282828",
  sidebarText: "#ffffff",
  panelAlt: "#2d2d2d",
  assistantPanel: "#2d2d2d",
  assistantMessageText: "#ffffff",
  userMessageText: "#ffffff",
  changeCardBackground: "#2d2d2d",
  changeCardText: "#ffffff",
  topBarBackground: "rgba(0, 0, 0, 0)",
  topBarText: "rgba(255, 255, 255, .498)",
  accent: "#ffffff",
  accentAlt: "#d9d9d9",
  secondary: "#808080",
  highlight: "#f2f2f2",
  text: "#ffffff",
  muted: "rgba(255, 255, 255, .498)",
  line: "rgba(255, 255, 255, .157)",
};

export const DEFAULT_CONFIGURED_STYLE: ThemeStyleConfig = {
  mode: "configured",
  recipes: {
    sidebar: true,
    composer: true,
    message: true,
    dialog: true,
  },
  sendIcon: "native",
  blur: 18,
  radius: 12,
  borderWidth: 1,
  shadow: "soft",
};

export const DEFAULT_ADVANCED_STYLE: ThemeStyleConfig = {
  ...DEFAULT_CONFIGURED_STYLE,
  mode: "advanced",
  recipes: { ...DEFAULT_CONFIGURED_STYLE.recipes },
};

const COLOR_PATTERN =
  /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|#[0-9a-fA-F]{3,4}|rgb\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*\)|rgba\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*(?:0|1|1\.0|0?\.[0-9]{1,6})\s*\))$/u;

const SHADOW_VALUES: Record<ThemeShadow, string> = {
  none: "none",
  soft: "0 8px 24px rgba(0, 0, 0, 0.18)",
  strong: "0 12px 36px rgba(0, 0, 0, 0.32)",
};

export function readThemeConfiguration(
  json: Record<string, unknown>,
): ThemeConfiguration {
  const appearance = isThemeAppearance(json.appearance)
    ? json.appearance
    : "auto";
  const art = normalizeThemeArt(json.art);
  const colors = normalizeThemeColors(json.colors, json.accent);
  const styleConfig = normalizeThemeStyleConfig(json.style, "advanced");
  return { appearance, art, colors, styleConfig };
}

export function writeThemeConfiguration(
  json: Record<string, unknown>,
  configuration: ThemeConfiguration,
): Record<string, unknown> {
  return {
    ...json,
    appearance: configuration.appearance,
    art: { ...configuration.art },
    colors: { ...configuration.colors },
    style: {
      ...configuration.styleConfig,
      recipes: { ...configuration.styleConfig.recipes },
    },
  };
}

export function normalizeThemeArt(value: unknown): ThemeArt {
  if (!isRecord(value)) return { ...DEFAULT_THEME_ART };
  return {
    focusX: boundedNumber(value.focusX, 0, 1, DEFAULT_THEME_ART.focusX),
    focusY: boundedNumber(value.focusY, 0, 1, DEFAULT_THEME_ART.focusY),
    safeArea: isThemeSafeArea(value.safeArea)
      ? value.safeArea
      : DEFAULT_THEME_ART.safeArea,
    taskMode: isThemeTaskMode(value.taskMode)
      ? value.taskMode
      : DEFAULT_THEME_ART.taskMode,
  };
}

export function normalizeThemeColors(
  value: unknown,
  legacyAccent?: unknown,
): ThemeColors {
  const source = isRecord(value) ? value : {};
  const result = { ...DEFAULT_THEME_COLORS };
  for (const key of THEME_COLOR_KEYS) {
    if (isThemeColor(source[key])) result[key] = source[key];
  }
  if (!isThemeColor(source.assistantPanel) && isThemeColor(source.panelAlt)) {
    result.assistantPanel = source.panelAlt;
  }
  if (!isThemeColor(source.assistantMessageText) && isThemeColor(source.text)) {
    result.assistantMessageText = source.text;
  }
  if (!isThemeColor(source.userMessageText) && isThemeColor(source.text)) {
    result.userMessageText = source.text;
  }
  if (
    !isThemeColor(source.changeCardBackground) &&
    isThemeColor(source.panelAlt)
  ) {
    result.changeCardBackground = source.panelAlt;
  }
  if (!isThemeColor(source.changeCardText) && isThemeColor(source.text)) {
    result.changeCardText = source.text;
  }
  if (!isThemeColor(source.topBarText) && isThemeColor(source.muted)) {
    result.topBarText = source.muted;
  }
  if (!isRecord(value) && isThemeColor(legacyAccent))
    result.accent = legacyAccent;
  return result;
}

export function normalizeThemeStyleConfig(
  value: unknown,
  fallbackMode: ThemeStyleMode = "advanced",
): ThemeStyleConfig {
  const fallback =
    fallbackMode === "configured"
      ? DEFAULT_CONFIGURED_STYLE
      : DEFAULT_ADVANCED_STYLE;
  if (!isRecord(value)) return cloneStyleConfig(fallback);
  const recipes = isRecord(value.recipes) ? value.recipes : {};
  const sendIconDataUrl = isThemeIconDataUrl(value.sendIconDataUrl)
    ? value.sendIconDataUrl
    : undefined;
  const configuredSendIcon = isThemeSendIcon(value.sendIcon)
    ? value.sendIcon
    : fallback.sendIcon;
  const sendIcon =
    configuredSendIcon === "custom" && !sendIconDataUrl
      ? fallback.sendIcon
      : configuredSendIcon;
  return {
    mode: isThemeStyleMode(value.mode) ? value.mode : fallback.mode,
    recipes: {
      sidebar: booleanValue(recipes.sidebar, fallback.recipes.sidebar),
      composer: booleanValue(recipes.composer, fallback.recipes.composer),
      message: booleanValue(recipes.message, fallback.recipes.message),
      dialog: booleanValue(recipes.dialog, fallback.recipes.dialog),
    },
    sendIcon,
    ...(sendIconDataUrl ? { sendIconDataUrl } : {}),
    blur: boundedInteger(value.blur, 0, 30, fallback.blur),
    radius: boundedInteger(value.radius, 0, 28, fallback.radius),
    borderWidth: boundedInteger(value.borderWidth, 0, 4, fallback.borderWidth),
    shadow: isThemeShadow(value.shadow) ? value.shadow : fallback.shadow,
  };
}

export function isThemeAppearance(value: unknown): value is ThemeAppearance {
  return value === "auto" || value === "light" || value === "dark";
}

export function isThemeSafeArea(value: unknown): value is ThemeSafeArea {
  return value === "none" || value === "left" || value === "right";
}

export function isThemeTaskMode(value: unknown): value is ThemeTaskMode {
  return value === "ambient" || value === "full" || value === "off";
}

export function isThemeShadow(value: unknown): value is ThemeShadow {
  return value === "none" || value === "soft" || value === "strong";
}

export function isThemeStyleMode(value: unknown): value is ThemeStyleMode {
  return value === "configured" || value === "advanced";
}

export function isThemeColor(value: unknown): value is string {
  return typeof value === "string" && COLOR_PATTERN.test(value);
}

export function isCompleteThemeArt(value: unknown): value is ThemeArt {
  return (
    isRecord(value) &&
    typeof value.focusX === "number" &&
    Number.isFinite(value.focusX) &&
    value.focusX >= 0 &&
    value.focusX <= 1 &&
    typeof value.focusY === "number" &&
    Number.isFinite(value.focusY) &&
    value.focusY >= 0 &&
    value.focusY <= 1 &&
    isThemeSafeArea(value.safeArea) &&
    isThemeTaskMode(value.taskMode) &&
    Object.keys(value).every((key) =>
      ["focusX", "focusY", "safeArea", "taskMode"].includes(key),
    )
  );
}

export function isCompleteThemeColors(value: unknown): value is ThemeColors {
  return (
    isRecord(value) &&
    Object.keys(value).length === THEME_COLOR_KEYS.length &&
    THEME_COLOR_KEYS.every((key) => isThemeColor(value[key]))
  );
}

export function isCompatibleThemeColors(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) =>
      (THEME_COLOR_KEYS as readonly string[]).includes(key),
    ) &&
    LEGACY_THEME_COLOR_KEYS.every((key) => isThemeColor(value[key])) &&
    [...OPTIONAL_THEME_COLOR_KEYS].every(
      (key) => value[key] === undefined || isThemeColor(value[key]),
    )
  );
}

export function isCompleteThemeStyleConfig(
  value: unknown,
): value is ThemeStyleConfig {
  if (!isRecord(value) || !isRecord(value.recipes)) return false;
  const recipes = value.recipes;
  const recipeKeys = ["sidebar", "composer", "message", "dialog"];
  return (
    Object.keys(value).every((key) =>
      [
        "mode",
        "recipes",
        "sendIcon",
        "sendIconDataUrl",
        "blur",
        "radius",
        "borderWidth",
        "shadow",
      ].includes(key),
    ) &&
    Object.keys(recipes).length === recipeKeys.length &&
    recipeKeys.every((key) => typeof recipes[key] === "boolean") &&
    isThemeStyleMode(value.mode) &&
    (value.sendIcon === undefined || isThemeSendIcon(value.sendIcon)) &&
    (value.sendIconDataUrl === undefined ||
      isThemeIconDataUrl(value.sendIconDataUrl)) &&
    (value.sendIcon !== "custom" ||
      isThemeIconDataUrl(value.sendIconDataUrl)) &&
    isBoundedInteger(value.blur, 0, 30) &&
    isBoundedInteger(value.radius, 0, 28) &&
    isBoundedInteger(value.borderWidth, 0, 4) &&
    isThemeShadow(value.shadow)
  );
}

export function generateConfiguredCss(style: ThemeStyleConfig): string {
  const rules = [
    `[data-ds-part="root"] {\n  color: var(--ds-theme-color-text);\n}`,
    `[data-ds-part="main"] {\n  background-color: var(--ds-theme-color-background);\n}`,
  ];
  const surface = surfaceDeclarations(style);
  if (style.recipes.sidebar)
    rules.push(
      `[data-ds-part="sidebar"] {\n  background-color: var(--ds-theme-color-panel);\n  border-right-color: var(--ds-theme-color-line);\n  border-right-style: solid;\n  border-right-width: ${style.borderWidth}px;\n${surface}\n}`,
    );
  if (style.recipes.composer) {
    rules.push(
      `[data-ds-part="composer"] {\n  background-color: var(--ds-theme-color-panel-alt);\n  border-color: var(--ds-theme-color-line);\n  border-style: solid;\n  border-width: ${style.borderWidth}px;\n${surface}\n}`,
    );
    rules.push(
      `[data-ds-part="composer"]:focus-visible {\n  border-color: var(--ds-theme-color-accent);\n}`,
    );
  }
  if (style.recipes.message)
    rules.push(
      `[data-ds-part="message"] {\n  background-color: var(--ds-theme-color-panel-alt);\n  border-radius: var(--ds-theme-surface-radius);\n  box-shadow: ${SHADOW_VALUES[style.shadow]};\n}`,
    );
  if (style.recipes.dialog)
    rules.push(
      `[data-ds-part="dialog"] {\n  background-color: var(--ds-theme-color-panel);\n  border-color: var(--ds-theme-color-line);\n  border-style: solid;\n  border-width: ${style.borderWidth}px;\n${surface}\n}`,
    );
  return rules.join("\n");
}

export function themeTokenRule(
  selector: string,
  configuration: ThemeConfiguration,
): string {
  const declarations = themeTokenDeclarations(configuration)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join("\n");
  return `${selector} {\n${declarations}\n}`;
}

export function themeTokenDeclarations(
  configuration: ThemeConfiguration,
): Array<readonly [string, string]> {
  const { art, colors, styleConfig } = configuration;
  const taskIntensity =
    art.taskMode === "off" ? "0" : art.taskMode === "full" ? "1" : "0.45";
  return [
    ...THEME_COLOR_KEYS.map(
      (key) => [`--ds-theme-color-${kebabCase(key)}`, colors[key]] as const,
    ),
    ["--ds-theme-font-family", "system-ui"],
    ["--ds-theme-font-scale", "1"],
    ["--ds-theme-surface-opacity", "1"],
    ["--ds-theme-surface-blur", `${styleConfig.blur}px`],
    ["--ds-theme-surface-radius", `${styleConfig.radius}px`],
    ["--ds-theme-surface-border-alpha", "0.18"],
    ["--ds-theme-surface-shadow", SHADOW_VALUES[styleConfig.shadow]],
    ["--ds-theme-image-focus-x", `${percentage(art.focusX)}%`],
    ["--ds-theme-image-focus-y", `${percentage(art.focusY)}%`],
    ["--ds-theme-image-zoom", "1"],
    ["--ds-theme-image-dim", "0"],
    ["--ds-theme-image-task-intensity", taskIntensity],
    ["--ds-theme-density-scale", "1"],
    ["--ds-theme-motion-level", "1"],
  ];
}

export function cloneThemeConfiguration(
  configuration: ThemeConfiguration,
): ThemeConfiguration {
  return {
    appearance: configuration.appearance,
    art: { ...configuration.art },
    colors: { ...configuration.colors },
    styleConfig: cloneStyleConfig(configuration.styleConfig),
  };
}

function surfaceDeclarations(style: ThemeStyleConfig): string {
  return `  border-radius: var(--ds-theme-surface-radius);\n  box-shadow: ${SHADOW_VALUES[style.shadow]};\n  backdrop-filter: blur(var(--ds-theme-surface-blur));`;
}

function cloneStyleConfig(style: ThemeStyleConfig): ThemeStyleConfig {
  return { ...style, recipes: { ...style.recipes } };
}

function percentage(value: number): string {
  return String(Math.round(value * 10000) / 100);
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return isBoundedInteger(value, minimum, maximum) ? value : fallback;
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
