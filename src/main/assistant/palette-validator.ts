import type {
  PaletteContrastCheck,
  PaletteValidationResult,
  ThemeColors,
} from "../../contracts";

type Rgb = [number, number, number];

const CHECKS = [
  ["sidebarText", "panel", 4.5],
  ["threadTabText", "threadTabBackground", 4.5],
  ["homeTitleText", "background", 4.5],
  ["homeCardText", "homeCardBackground", 4.5],
  ["composerText", "panelAlt", 4.5],
  ["assistantMessageText", "assistantPanel", 4.5],
  ["userMessageText", "panelAlt", 4.5],
  ["changeCardText", "changeCardBackground", 4.5],
  ["activityText", "activityBackground", 4.5],
  ["activityMuted", "activityBackground", 3],
  ["topBarText", "topBarBackground", 4.5],
  ["accentText", "accent", 4.5],
  ["selectionText", "highlight", 4.5],
  ["text", "background", 4.5],
  ["muted", "background", 3],
] as const satisfies ReadonlyArray<
  readonly [keyof ThemeColors, keyof ThemeColors, number]
>;

export function validatePaletteContrast(
  colors: ThemeColors,
): PaletteValidationResult {
  const page = composite(parseColor(colors.background), [11, 16, 32]);
  const checks: PaletteContrastCheck[] = CHECKS.map(
    ([foregroundKey, backgroundKey, minimum]) => {
      const background =
        backgroundKey === "background"
          ? page
          : composite(parseColor(colors[backgroundKey]), page);
      const foreground = composite(
        parseColor(colors[foregroundKey]),
        background,
      );
      const ratio = round(contrastRatio(foreground, background));
      return {
        foreground: foregroundKey,
        background: backgroundKey,
        ratio,
        minimum,
        passed: ratio >= minimum,
      };
    },
  );
  return { valid: checks.every((check) => check.passed), checks };
}

function parseColor(value: string): { rgb: Rgb; alpha: number } {
  if (value.startsWith("#")) {
    const source = value.slice(1);
    const expanded =
      source.length === 3 || source.length === 4
        ? [...source].map((character) => character + character).join("")
        : source;
    return {
      rgb: [
        Number.parseInt(expanded.slice(0, 2), 16),
        Number.parseInt(expanded.slice(2, 4), 16),
        Number.parseInt(expanded.slice(4, 6), 16),
      ],
      alpha:
        expanded.length === 8
          ? Number.parseInt(expanded.slice(6, 8), 16) / 255
          : 1,
    };
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/u);
  if (!match) throw new Error("INVALID_PALETTE:unsupported-color");
  const channels = match[1].split(",").map((channel) => Number(channel.trim()));
  return {
    rgb: [channels[0], channels[1], channels[2]],
    alpha: channels[3] ?? 1,
  };
}

function composite(color: { rgb: Rgb; alpha: number }, base: Rgb): Rgb {
  return color.rgb.map(
    (channel, index) => channel * color.alpha + base[index] * (1 - color.alpha),
  ) as Rgb;
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
