import { describe, expect, it } from "vitest";
import { toSummary, type ThemeRecord } from "../../src/main/domain/theme";

const baseTheme: ThemeRecord = {
  libraryId: "00000000-0000-4000-8000-000000000000",
  themeId: "local-theme",
  name: "Theme",
  description: "",
  css: '[data-ds-part="root"] { color: #fff; }',
  backgroundScope: "window",
  sidebarOverlayOpacity: 75,
  json: {},
  status: "ready",
  revision: 1,
  updatedAt: "2026-08-06T00:00:00.000Z",
  fingerprint: "a".repeat(64),
  packageFormat: "simplified",
  signed: false,
  validation: {
    css: "valid",
    image: "valid",
    package: "ready",
    warnings: [],
  },
};

describe("theme summary", () => {
  it("does not expose imported CSS expressions as an accent style", () => {
    const theme = {
      ...baseTheme,
      json: { accent: "url(https://example.test/track)" },
    };
    expect(toSummary(theme).accent).toBe("#8b5cf6");
  });

  it("preserves a bounded hexadecimal accent", () => {
    const theme = { ...baseTheme, json: { accent: "#14b8a6" } };
    expect(toSummary(theme).accent).toBe("#14b8a6");
  });
});
