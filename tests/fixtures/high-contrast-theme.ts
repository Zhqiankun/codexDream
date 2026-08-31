import type { BackgroundScope, ThemeConfiguration } from "../../src/contracts";

/**
 * Cross-layer acceptance fixture owned by the theme tests. Every color uses a
 * distinct value and an explicit alpha so a dropped field or flattened
 * transparency is observable in Studio, persistence, and the runtime payload.
 */
export const HIGH_CONTRAST_THEME: ThemeConfiguration = {
  appearance: "dark",
  art: {
    focusX: 0.17,
    focusY: 0.83,
    safeArea: "right",
    taskMode: "full",
  },
  colors: {
    background: "rgba(8, 17, 31, 0.96)",
    panel: "rgba(76, 29, 149, 0.72)",
    sidebarText: "rgba(248, 250, 252, 0.98)",
    threadTabBackground: "rgba(88, 28, 135, 0.78)",
    threadTabText: "rgba(255, 247, 237, 0.98)",
    homeTitleText: "rgba(207, 250, 254, 0.98)",
    homeCardBackground: "rgba(124, 45, 18, 0.7)",
    homeCardText: "rgba(255, 247, 237, 0.98)",
    panelAlt: "rgba(30, 64, 175, 0.72)",
    composerText: "rgba(239, 246, 255, 0.98)",
    assistantPanel: "rgba(6, 78, 59, 0.72)",
    assistantMessageText: "rgba(236, 253, 245, 0.98)",
    userMessageText: "rgba(219, 234, 254, 0.98)",
    changeCardBackground: "rgba(127, 29, 29, 0.74)",
    changeCardText: "rgba(254, 242, 242, 0.98)",
    activityBackground: "rgba(69, 26, 3, 0.72)",
    activityText: "rgba(255, 251, 235, 0.98)",
    activityMuted: "rgba(252, 211, 77, 0.95)",
    topBarBackground: "rgba(15, 23, 42, 0.82)",
    topBarText: "rgba(226, 232, 240, 0.98)",
    accent: "rgba(251, 191, 36, 0.96)",
    accentText: "rgba(17, 24, 39, 0.98)",
    accentAlt: "rgba(251, 113, 133, 0.9)",
    secondary: "rgba(196, 181, 253, 0.92)",
    highlight: "rgba(250, 204, 21, 0.96)",
    selectionText: "rgba(17, 24, 39, 0.98)",
    text: "rgba(248, 250, 252, 0.98)",
    muted: "rgba(174, 185, 202, 0.94)",
    line: "rgba(125, 211, 252, 0.55)",
  },
  homeCards: [
    { mode: "color", color: "rgba(76, 29, 149, 0.72)" },
    { mode: "color", color: "rgba(127, 29, 29, 0.74)" },
    { mode: "color", color: "rgba(6, 78, 59, 0.72)" },
    { mode: "color", color: "rgba(30, 64, 175, 0.72)" },
  ],
  styleConfig: {
    mode: "configured",
    recipes: {
      sidebar: true,
      composer: true,
      message: true,
      dialog: true,
    },
    sendIcon: "paper-plane",
    blur: 9,
    radius: 17,
    borderWidth: 3,
    shadow: "strong",
  },
};

export const HIGH_CONTRAST_BACKGROUND_SCOPE: BackgroundScope = "window";
export const HIGH_CONTRAST_SIDEBAR_OVERLAY_OPACITY = 17;
