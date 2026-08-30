import { describe, expect, it } from "vitest";
import { THEME_PRESETS } from "../../src/renderer/features/studio/theme-presets";

describe("luxury theme presets", () => {
  it("provides fifteen distinct presets with the requested translucent frame", () => {
    expect(THEME_PRESETS).toHaveLength(15);
    expect(new Set(THEME_PRESETS.map((preset) => preset.id)).size).toBe(15);
    expect(new Set(THEME_PRESETS.map((preset) => preset.name)).size).toBe(15);
    for (const preset of THEME_PRESETS) {
      expect(preset.colors.background).toMatch(/, 0\.2\)$/u);
      expect(preset.colors.panel).toMatch(/, 0\.2\)$/u);
      expect(preset.colors.line).toMatch(/, 0\.2\)$/u);
    }
  });

  it("keeps every foreground pair readable instead of reusing page colors", () => {
    const failures: string[] = [];
    for (const preset of THEME_PRESETS) {
      const pairs = [
        ["composer", preset.colors.composerText, preset.colors.panelAlt, 7],
        [
          "assistant",
          preset.colors.assistantMessageText,
          preset.colors.assistantPanel,
          7,
        ],
        [
          "card",
          preset.colors.homeCardText,
          preset.colors.homeCardBackground,
          7,
        ],
        ["accent", preset.colors.accentText, preset.colors.accent, 4.5],
        [
          "selection",
          preset.colors.selectionText,
          preset.colors.highlight,
          4.5,
        ],
        ["secondary", preset.colors.secondary, preset.colors.panelAlt, 3],
      ] as const;
      for (const [role, foreground, background, minimum] of pairs) {
        const ratio = contrastRatio(foreground, background);
        if (ratio < minimum)
          failures.push(preset.id + ":" + role + "=" + ratio.toFixed(2));
      }
    }
    expect(failures).toEqual([]);
  });
});

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseColor(foreground));
  const backgroundLuminance = relativeLuminance(parseColor(background));
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function parseColor(value: string): [number, number, number] {
  if (value.startsWith("#")) {
    const source = value.slice(1);
    const hex =
      source.length === 3
        ? [...source].map((character) => character + character).join("")
        : source;
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/u);
  if (!match) throw new Error("Unsupported theme color: " + value);
  const channels = match[1].split(",").map((channel) => Number(channel.trim()));
  return [channels[0], channels[1], channels[2]];
}

function relativeLuminance([red, green, blue]: [
  number,
  number,
  number,
]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
