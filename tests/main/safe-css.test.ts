import { describe, expect, it } from "vitest";
import { validateSafeCss } from "../../src/main/infra/safe-css";

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
