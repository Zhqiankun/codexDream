import type {
  ThemeAppearance,
  ThemeColors,
  ThemeDetail,
  ThemeStyleConfig,
} from "../../../contracts";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  appearance: Exclude<ThemeAppearance, "auto">;
  colors: ThemeColors;
  styleConfig: Omit<ThemeStyleConfig, "sendIcon" | "sendIconDataUrl">;
}

const enabledRecipes: ThemeStyleConfig["recipes"] = {
  sidebar: true,
  composer: true,
  message: true,
  dialog: true,
};

export const THEME_PRESETS = [
  {
    id: "paper-light",
    name: "纸张白",
    description: "温暖、克制的明亮工作台",
    appearance: "light",
    colors: {
      background: "#f6f3ec",
      panel: "#ebe7dd",
      sidebarText: "#42464d",
      panelAlt: "#ffffff",
      assistantPanel: "#ffffff",
      accent: "#1f6feb",
      accentAlt: "#3b82f6",
      secondary: "#7d8795",
      highlight: "#e7f0ff",
      text: "#25262a",
      muted: "#72777f",
      line: "#d6d2c8",
    },
    styleConfig: {
      mode: "configured",
      recipes: enabledRecipes,
      blur: 8,
      radius: 12,
      borderWidth: 1,
      shadow: "soft",
    },
  },
  {
    id: "graphite",
    name: "石墨灰",
    description: "低干扰的中性深色界面",
    appearance: "dark",
    colors: {
      background: "#171918",
      panel: "#202321",
      sidebarText: "#d7ddd7",
      panelAlt: "#292d2a",
      assistantPanel: "#292d2a",
      accent: "#eef0ed",
      accentAlt: "#b8beb8",
      secondary: "#717973",
      highlight: "#353a36",
      text: "#f4f6f3",
      muted: "#9aa19b",
      line: "#3a403b",
    },
    styleConfig: {
      mode: "configured",
      recipes: enabledRecipes,
      blur: 6,
      radius: 10,
      borderWidth: 1,
      shadow: "none",
    },
  },
  {
    id: "midnight-copper",
    name: "午夜铜",
    description: "深蓝底色与温暖铜金强调",
    appearance: "dark",
    colors: {
      background: "#101621",
      panel: "#151e2d",
      sidebarText: "#dce6f6",
      panelAlt: "#1d293a",
      assistantPanel: "#1d293a",
      accent: "#f2a65a",
      accentAlt: "#d9823b",
      secondary: "#50627a",
      highlight: "#2f4057",
      text: "#f4eee6",
      muted: "#9aa8ba",
      line: "#31415a",
    },
    styleConfig: {
      mode: "configured",
      recipes: enabledRecipes,
      blur: 18,
      radius: 14,
      borderWidth: 1,
      shadow: "soft",
    },
  },
  {
    id: "aurora-cyan",
    name: "极光青",
    description: "冷冽青蓝与通透磨砂表面",
    appearance: "dark",
    colors: {
      background: "#071b22",
      panel: "#0c2730",
      sidebarText: "#d5f7f4",
      panelAlt: "#123640",
      assistantPanel: "#123640",
      accent: "#5eead4",
      accentAlt: "#38bdf8",
      secondary: "#3c6770",
      highlight: "#174d58",
      text: "#e6fffb",
      muted: "#84aeb2",
      line: "#25515a",
    },
    styleConfig: {
      mode: "configured",
      recipes: enabledRecipes,
      blur: 22,
      radius: 16,
      borderWidth: 1,
      shadow: "strong",
    },
  },
  {
    id: "sakura-mist",
    name: "樱雾粉",
    description: "柔和粉白与清晰深色文字",
    appearance: "light",
    colors: {
      background: "#fff7f8",
      panel: "#f8e8ec",
      sidebarText: "#513841",
      panelAlt: "#fffdfd",
      assistantPanel: "#fffdfd",
      accent: "#d85b7d",
      accentAlt: "#a53e63",
      secondary: "#a98b94",
      highlight: "#f8dbe4",
      text: "#412b33",
      muted: "#846a73",
      line: "#ead0d7",
    },
    styleConfig: {
      mode: "configured",
      recipes: enabledRecipes,
      blur: 12,
      radius: 18,
      borderWidth: 1,
      shadow: "soft",
    },
  },
  {
    id: "terminal-green",
    name: "终端绿",
    description: "硬朗、紧凑的复古终端气质",
    appearance: "dark",
    colors: {
      background: "#07100a",
      panel: "#0b1a10",
      sidebarText: "#b9f7ca",
      panelAlt: "#102318",
      assistantPanel: "#102318",
      accent: "#71f79f",
      accentAlt: "#2fd56d",
      secondary: "#3d6b4d",
      highlight: "#153c24",
      text: "#d8ffe3",
      muted: "#78a785",
      line: "#214d31",
    },
    styleConfig: {
      mode: "configured",
      recipes: enabledRecipes,
      blur: 0,
      radius: 6,
      borderWidth: 1,
      shadow: "none",
    },
  },
] as const satisfies ReadonlyArray<ThemePreset>;

export function applyThemePreset(
  draft: ThemeDetail,
  preset: ThemePreset,
): ThemeDetail {
  return {
    ...draft,
    appearance: preset.appearance,
    colors: { ...preset.colors },
    styleConfig: {
      ...draft.styleConfig,
      ...preset.styleConfig,
      recipes: { ...preset.styleConfig.recipes },
    },
  };
}

export function isThemePresetActive(
  draft: ThemeDetail,
  preset: ThemePreset,
): boolean {
  return (
    draft.appearance === preset.appearance &&
    equalRecord(draft.colors, preset.colors) &&
    draft.styleConfig.mode === preset.styleConfig.mode &&
    draft.styleConfig.blur === preset.styleConfig.blur &&
    draft.styleConfig.radius === preset.styleConfig.radius &&
    draft.styleConfig.borderWidth === preset.styleConfig.borderWidth &&
    draft.styleConfig.shadow === preset.styleConfig.shadow &&
    equalRecord(draft.styleConfig.recipes, preset.styleConfig.recipes)
  );
}

function equalRecord<T extends object>(left: T, right: T) {
  return (Object.keys(left) as Array<keyof T>).every(
    (key) => left[key] === right[key],
  );
}
