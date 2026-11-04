// @vitest-environment jsdom
// @vitest-environment-options {"url":"app://-/index.html"}

import { afterEach, describe, expect, it } from "vitest";
import {
  parseThemeCompatibility,
  readThemeCompatibilityExpression,
} from "../../src/main/session/theme-payload";

const marker = "codexstyle-compatibility-test";

afterEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-codexstyle-owner");
});

describe("bounded theme compatibility reports", () => {
  it("normalizes recognized missing capabilities without claiming a hard failure", () => {
    expect(parseThemeCompatibility("[]")).toEqual({
      status: "full",
      unavailable: [],
    });
    expect(
      parseThemeCompatibility('["reasoning-background","sidebar"]'),
    ).toEqual({
      status: "partial",
      unavailable: ["sidebar", "reasoning-background"],
    });
  });

  it.each([
    null,
    undefined,
    true,
    [],
    "not-json",
    "{}",
    '["unknown"]',
    '["sidebar","sidebar"]',
    '["__proto__"]',
    "[null]",
    '[{"sidebar":true}]',
    `[${" ".repeat(256)}]`,
  ])("keeps untrusted or missing report %j in checking", (value) => {
    expect(parseThemeCompatibility(value)).toEqual({
      status: "checking",
      unavailable: [],
    });
  });

  it("only reads one stylesheet belonging to the currently owned root", () => {
    document.head.innerHTML = `<style data-codexstyle-style="1" data-codexstyle-owner="foreign" data-codexstyle-compatibility='[]'></style>
      <style data-codexstyle-style="1" data-codexstyle-owner="${marker}" data-codexstyle-compatibility='["header"]'></style>`;
    const read = () => window.eval(readThemeCompatibilityExpression(marker));
    expect(read()).toBeNull();
    document.documentElement.setAttribute("data-codexstyle-owner", marker);
    expect(parseThemeCompatibility(read())).toEqual({
      status: "partial",
      unavailable: ["header"],
    });
    const owned = document.head.lastElementChild!;
    document.head.append(owned.cloneNode(true));
    expect(read()).toBeNull();
  });

  it("does not return oversized page-owned strings", () => {
    document.documentElement.setAttribute("data-codexstyle-owner", marker);
    const style = document.createElement("style");
    style.setAttribute("data-codexstyle-style", "1");
    style.setAttribute("data-codexstyle-owner", marker);
    style.setAttribute("data-codexstyle-compatibility", "x".repeat(257));
    document.head.append(style);
    expect(window.eval(readThemeCompatibilityExpression(marker))).toBeNull();
  });
});
