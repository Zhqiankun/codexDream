import { describe, expect, it } from "vitest";
import {
  validateLegacySafeCss,
  validateSafeCss,
} from "../../src/main/infra/safe-css";

describe("safe css policy", () => {
  it("accepts registered parts and allowed pseudo states", () => {
    const result = validateSafeCss(
      '[data-ds-part="root"] { color: #f8fafc; } [data-ds-part="sidebar"] { color: var(--ds-theme-color-sidebar-text); } [data-ds-part="titlebar"] { background-color: var(--ds-theme-color-top-bar-background); color: var(--ds-theme-color-top-bar-text); } [data-ds-part="header"]:hover { background-color: #334155; } [data-ds-part="message"] { color: var(--ds-theme-color-assistant-message-text); } [data-ds-part="change-card"] { background-color: var(--ds-theme-color-change-card-background); color: var(--ds-theme-color-change-card-text); } [data-ds-part="composer"]:focus-within { border-color: var(--ds-theme-color-accent-alt); }',
    );
    expect(result.valid).toBe(true);
    expect(result.ruleCount).toBe(7);
  });

  it("rejects network, at-rules, arbitrary selectors, and important", () => {
    const result = validateSafeCss(
      "@import url(https://example.test); body { color: red !important; }",
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(["rule-invalid"]));
  });

  it("freezes the Safe CSS policy accepted by v1.0.x compatibility exports", () => {
    expect(
      validateLegacySafeCss(
        '[data-ds-part="composer"]:focus-visible { border-color: var(--ds-theme-color-accent-alt); }',
      ).valid,
    ).toBe(true);
    for (const css of [
      '[data-ds-part="titlebar"] { color: var(--ds-theme-color-text); }',
      '[data-ds-part="composer"]:focus-within { border-color: #ffffff; }',
      '[data-ds-part="sidebar"] { color: var(--ds-theme-color-sidebar-text); }',
      '[data-ds-part="message"] { color: var(--ds-theme-color-assistant-message-text); }',
      '[data-ds-part="message"] { color: var(--ds-theme-color-user-message-text); }',
      '[data-ds-part="change-card"] { background-color: var(--ds-theme-color-change-card-background); color: var(--ds-theme-color-change-card-text); }',
    ]) {
      expect(validateSafeCss(css).valid).toBe(true);
      expect(validateLegacySafeCss(css)).toMatchObject({
        valid: false,
        errors: ["legacy-feature-not-supported"],
      });
    }
  });

  it("enforces rule and declaration bounds", () => {
    const css = Array.from(
      { length: 129 },
      (_, index) => `[data-ds-part="root"] { color: #fff; }`,
    ).join("");
    const result = validateSafeCss(css);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("too-many-rules");
  });
});
