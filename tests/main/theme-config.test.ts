import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIGURED_STYLE,
  DEFAULT_THEME_ART,
  DEFAULT_THEME_COLORS,
  generateConfiguredCss,
  isCompleteThemeStyleConfig,
  isCompatibleThemeColors,
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
    expect(legacy.colors.sidebarText).toBe(DEFAULT_THEME_COLORS.sidebarText);
    expect(legacy.colors.threadTabBackground).toBe(
      DEFAULT_THEME_COLORS.threadTabBackground,
    );
    expect(legacy.colors.threadTabText).toBe(
      DEFAULT_THEME_COLORS.threadTabText,
    );
    expect(legacy.colors.homeTitleText).toBe(
      DEFAULT_THEME_COLORS.homeTitleText,
    );
    expect(legacy.colors.homeCardBackground).toBe(
      DEFAULT_THEME_COLORS.homeCardBackground,
    );
    expect(legacy.colors.homeCardText).toBe(DEFAULT_THEME_COLORS.homeCardText);
    expect(legacy.colors.assistantPanel).toBe(
      DEFAULT_THEME_COLORS.assistantPanel,
    );
    expect(legacy.colors.assistantMessageText).toBe(
      DEFAULT_THEME_COLORS.assistantMessageText,
    );
    expect(legacy.colors.userMessageText).toBe(
      DEFAULT_THEME_COLORS.userMessageText,
    );
    expect(legacy.colors.changeCardBackground).toBe(
      DEFAULT_THEME_COLORS.changeCardBackground,
    );
    expect(legacy.colors.changeCardText).toBe(
      DEFAULT_THEME_COLORS.changeCardText,
    );
    expect(legacy.colors.activityBackground).toBe(
      DEFAULT_THEME_COLORS.activityBackground,
    );
    expect(legacy.colors.activityText).toBe(DEFAULT_THEME_COLORS.activityText);
    expect(legacy.colors.activityMuted).toBe(
      DEFAULT_THEME_COLORS.activityMuted,
    );
    expect(legacy.colors.topBarBackground).toBe("rgba(0, 0, 0, 0)");
    expect(legacy.colors.topBarText).toBe(DEFAULT_THEME_COLORS.topBarText);

    const {
      sidebarText: _sidebarText,
      threadTabBackground: _threadTabBackground,
      threadTabText: _threadTabText,
      homeTitleText: _homeTitleText,
      homeCardBackground: _homeCardBackground,
      homeCardText: _homeCardText,
      assistantPanel: _assistantPanel,
      assistantMessageText: _assistantMessageText,
      userMessageText: _userMessageText,
      changeCardBackground: _changeCardBackground,
      changeCardText: _changeCardText,
      activityBackground: _activityBackground,
      activityText: _activityText,
      activityMuted: _activityMuted,
      topBarBackground: _topBarBackground,
      topBarText: _topBarText,
      ...legacyColors
    } = DEFAULT_THEME_COLORS;
    expect(isCompatibleThemeColors(legacyColors)).toBe(true);
    expect(isCompatibleThemeColors(DEFAULT_THEME_COLORS)).toBe(true);
    expect(
      isCompatibleThemeColors({
        ...legacyColors,
        assistantMessageText: "not-a-color",
      }),
    ).toBe(false);
    expect(
      isCompatibleThemeColors({
        ...legacyColors,
        changeCardBackground: "not-a-color",
      }),
    ).toBe(false);
    expect(
      isCompatibleThemeColors({
        ...legacyColors,
        userMessageText: "not-a-color",
      }),
    ).toBe(false);

    const normalizedCurrentTheme = readThemeConfiguration({
      colors: {
        ...legacyColors,
        sidebarText: "#334455",
        panelAlt: "#445566",
        assistantPanel: "#556677",
        text: "#123456",
        muted: "rgba(10, 20, 30, 0.5)",
      },
    });
    expect(normalizedCurrentTheme.colors.assistantMessageText).toBe("#123456");
    expect(normalizedCurrentTheme.colors.userMessageText).toBe("#123456");
    expect(normalizedCurrentTheme.colors.changeCardBackground).toBe("#445566");
    expect(normalizedCurrentTheme.colors.changeCardText).toBe("#123456");
    expect(normalizedCurrentTheme.colors.threadTabBackground).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(normalizedCurrentTheme.colors.threadTabText).toBe(
      "rgba(10, 20, 30, 0.5)",
    );
    expect(normalizedCurrentTheme.colors.homeTitleText).toBe("#123456");
    expect(normalizedCurrentTheme.colors.homeCardBackground).toBe("#445566");
    expect(normalizedCurrentTheme.colors.homeCardText).toBe("#123456");
    expect(normalizedCurrentTheme.colors.activityBackground).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(normalizedCurrentTheme.colors.activityText).toBe(
      "rgba(10, 20, 30, 0.5)",
    );
    expect(normalizedCurrentTheme.colors.activityMuted).toBe(
      "rgba(10, 20, 30, 0.5)",
    );
    expect(normalizedCurrentTheme.colors.topBarBackground).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(normalizedCurrentTheme.colors.topBarText).toBe(
      "rgba(10, 20, 30, 0.5)",
    );

    const tokens = new Map(
      themeTokenDeclarations({
        appearance: "dark",
        art: { ...DEFAULT_THEME_ART, focusX: 0.25, focusY: 0.75 },
        colors: { ...DEFAULT_THEME_COLORS, accent: "#336699" },
        styleConfig: { ...DEFAULT_CONFIGURED_STYLE, blur: 24 },
      }),
    );
    expect(tokens.get("--ds-theme-color-accent")).toBe("#336699");
    expect(tokens.get("--ds-theme-color-sidebar-text")).toBe("#ffffff");
    expect(tokens.get("--ds-theme-color-thread-tab-background")).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(tokens.get("--ds-theme-color-thread-tab-text")).toBe(
      "rgba(255, 255, 255, .498)",
    );
    expect(tokens.get("--ds-theme-color-home-title-text")).toBe("#ffffff");
    expect(tokens.get("--ds-theme-color-home-card-background")).toBe("#2d2d2d");
    expect(tokens.get("--ds-theme-color-home-card-text")).toBe("#ffffff");
    expect(tokens.get("--ds-theme-color-assistant-panel")).toBe("#2d2d2d");
    expect(tokens.get("--ds-theme-color-assistant-message-text")).toBe(
      "#ffffff",
    );
    expect(tokens.get("--ds-theme-color-user-message-text")).toBe("#ffffff");
    expect(tokens.get("--ds-theme-color-change-card-background")).toBe(
      "#2d2d2d",
    );
    expect(tokens.get("--ds-theme-color-change-card-text")).toBe("#ffffff");
    expect(tokens.get("--ds-theme-color-activity-background")).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(tokens.get("--ds-theme-color-activity-text")).toBe(
      "rgba(255, 255, 255, .498)",
    );
    expect(tokens.get("--ds-theme-color-activity-muted")).toBe(
      "rgba(255, 255, 255, .498)",
    );
    expect(tokens.get("--ds-theme-color-top-bar-background")).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(tokens.get("--ds-theme-color-top-bar-text")).toBe(
      "rgba(255, 255, 255, .498)",
    );
    expect(tokens.get("--ds-theme-image-focus-x")).toBe("25%");
    expect(tokens.get("--ds-theme-image-focus-y")).toBe("75%");
    expect(tokens.get("--ds-theme-surface-blur")).toBe("24px");
  });

  it("accepts only bounded PNG data for a custom send icon", () => {
    const pngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
    expect(
      isCompleteThemeStyleConfig({
        ...DEFAULT_CONFIGURED_STYLE,
        sendIcon: "custom",
        sendIconDataUrl: pngDataUrl,
      }),
    ).toBe(true);
    expect(
      isCompleteThemeStyleConfig({
        ...DEFAULT_CONFIGURED_STYLE,
        sendIcon: "custom",
        sendIconDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
      }),
    ).toBe(false);
    expect(
      isCompleteThemeStyleConfig({
        ...DEFAULT_CONFIGURED_STYLE,
        sendIcon: "custom",
      }),
    ).toBe(false);
  });
});
