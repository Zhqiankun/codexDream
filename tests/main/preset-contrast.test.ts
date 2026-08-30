import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

interface CatalogTheme {
  presetId: string;
  image: string;
  colors: Record<string, string>;
}

describe("bundled preset contrast", () => {
  it("keeps image-aware text, actions, and selections readable", async () => {
    const root = resolve(process.cwd(), "resources", "presets");
    const catalog = JSON.parse(
      await readFile(resolve(root, "catalog.json"), "utf8"),
    ) as { themes: CatalogTheme[] };
    const failures: string[] = [];
    const signatures = new Set<string>();

    for (const theme of catalog.themes) {
      const stats = await sharp(resolve(root, theme.image))
        .resize(64, 64, { fit: "inside" })
        .removeAlpha()
        .stats();
      const image = stats.channels
        .slice(0, 3)
        .map((channel) => channel.mean) as Rgb;
      const colors = theme.colors;
      signatures.add(
        [colors.panelAlt, colors.accent, colors.highlight, colors.text].join(
          "|",
        ),
      );
      const pairs = [
        ["sidebar", colors.sidebarText, colors.panel, 4.5],
        ["thread", colors.threadTabText, colors.threadTabBackground, 4.5],
        ["card", colors.homeCardText, colors.homeCardBackground, 4.5],
        ["composer", colors.composerText, colors.panelAlt, 4.5],
        ["assistant", colors.assistantMessageText, colors.assistantPanel, 4.5],
        ["user", colors.userMessageText, colors.panelAlt, 4.5],
        ["activity", colors.activityText, colors.activityBackground, 4.5],
        ["top", colors.topBarText, colors.topBarBackground, 4.5],
        ["body", colors.text, colors.background, 4.5],
        ["accent", colors.accentText, colors.accent, 4.5],
        ["selection", colors.selectionText, colors.highlight, 4.5],
      ] as const;
      for (const [role, foreground, surface, minimum] of pairs) {
        const ratio = contrastRatio(
          parseColor(foreground).rgb,
          composite(parseColor(surface), image),
        );
        if (ratio < minimum)
          failures.push(theme.presetId + ":" + role + "=" + ratio.toFixed(2));
      }
    }

    expect(signatures.size).toBe(catalog.themes.length);
    expect(failures).toEqual([]);
  });
});

type Rgb = [number, number, number];

function parseColor(value: string): { rgb: Rgb; alpha: number } {
  if (value.startsWith("#")) {
    const source = value.slice(1);
    const hex =
      source.length === 3
        ? [...source].map((character) => character + character).join("")
        : source;
    return {
      rgb: [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ],
      alpha: 1,
    };
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/u);
  if (!match) throw new Error("Unsupported theme color: " + value);
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
