import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_COLORS, type ThemeColors } from "../../src/contracts";
import { validatePaletteContrast } from "../../src/main/assistant/palette-validator";

describe("Codex assistant palette validation", () => {
  it("accepts a complete high-contrast palette", () => {
    const result = validatePaletteContrast(highContrastPalette());
    expect(result.valid).toBe(true);
    expect(result.checks).toHaveLength(15);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("reports the exact foreground and surface for unreadable colors", () => {
    const colors = highContrastPalette();
    colors.accent = "#ffffff";
    colors.accentText = "#ffffff";
    const result = validatePaletteContrast(colors);
    expect(result.valid).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        foreground: "accentText",
        background: "accent",
        passed: false,
      }),
    );
  });

  it("composites a translucent page background exactly once", () => {
    const colors = highContrastPalette();
    colors.background = "rgba(255, 255, 255, 0.2)";
    colors.muted = "#000000";
    const check = validatePaletteContrast(colors).checks.find(
      (candidate) => candidate.foreground === "muted",
    );
    expect(check).toMatchObject({
      background: "background",
      minimum: 3,
      passed: false,
    });
    expect(check!.ratio).toBeLessThan(3);
  });
});

export function highContrastPalette(): ThemeColors {
  return {
    ...DEFAULT_THEME_COLORS,
    background: "#10131a",
    panel: "#151a24",
    sidebarText: "#ffffff",
    threadTabBackground: "#151a24",
    threadTabText: "#ffffff",
    homeTitleText: "#ffffff",
    homeCardBackground: "#151a24",
    homeCardText: "#ffffff",
    panelAlt: "#151a24",
    composerText: "#ffffff",
    assistantPanel: "#151a24",
    assistantMessageText: "#ffffff",
    userMessageText: "#ffffff",
    changeCardBackground: "#151a24",
    changeCardText: "#ffffff",
    activityBackground: "#151a24",
    activityText: "#ffffff",
    activityMuted: "#b8c1d1",
    topBarBackground: "#10131a",
    topBarText: "#ffffff",
    accent: "#f5c451",
    accentText: "#17120a",
    accentAlt: "#ffd985",
    secondary: "#c4cbd8",
    highlight: "#f5c451",
    selectionText: "#17120a",
    text: "#ffffff",
    muted: "#b8c1d1",
    line: "#5f697b",
  };
}
