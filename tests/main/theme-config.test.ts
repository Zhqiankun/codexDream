import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIGURED_STYLE,
  DEFAULT_THEME_ART,
  DEFAULT_THEME_COLORS,
  generateConfiguredCss,
  readThemeConfiguration,
  themeTokenDeclarations,
  type ThemeShadow,
} from "../../src/contracts";
import { validateSafeCss } from "../../src/main/infra/safe-css";

describe("structured theme configuration", () => {
  it("generates non-empty Safe CSS across every bounded surface extreme", () => {
    const shadows: ThemeShadow[] = ["none", "soft", "strong"];
    for (const shadow of shadows) {
      for (const edge of [0, 1]) {
        const css = generateConfiguredCss({
          ...DEFAULT_CONFIGURED_STYLE,
          recipes: {
            sidebar: true,
            composer: true,
            message: true,
            dialog: true,
          },
          blur: edge ? 30 : 0,
          radius: edge ? 28 : 0,
          borderWidth: edge ? 4 : 0,
          shadow,
        });
        const result = validateSafeCss(css);
        expect(result.valid, result.errors.join(", ")).toBe(true);
        expect(result.empty).toBe(false);
      }
    }
  });

  it("keeps legacy themes in advanced mode and exposes stable token names", () => {
    const legacy = readThemeConfiguration({ accent: "#ff00aa" });
    expect(legacy.styleConfig.mode).toBe("advanced");
    expect(legacy.colors.accent).toBe("#ff00aa");

    const tokens = new Map(
      themeTokenDeclarations({
        appearance: "dark",
        art: { ...DEFAULT_THEME_ART, focusX: 0.25, focusY: 0.75 },
        colors: { ...DEFAULT_THEME_COLORS, accent: "#336699" },
        styleConfig: { ...DEFAULT_CONFIGURED_STYLE, blur: 24 },
      }),
    );
    expect(tokens.get("--ds-theme-color-accent")).toBe("#336699");
    expect(tokens.get("--ds-theme-image-focus-x")).toBe("25%");
    expect(tokens.get("--ds-theme-image-focus-y")).toBe("75%");
    expect(tokens.get("--ds-theme-surface-blur")).toBe("24px");
  });
});
