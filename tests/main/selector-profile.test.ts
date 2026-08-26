// @vitest-environment jsdom
// @vitest-environment-options {"url":"app://-/index.html"}

import { describe, expect, it } from "vitest";
import {
  CODEX_SELECTOR_PROFILE,
  isCompatibleSelectorProbe,
  selectorProbeExpression,
} from "../../src/main/session/selector-profile";
import { CODEX_STARTUP_VERIFY_TIMEOUT_MS } from "../../src/main/session/session-service";

describe("versioned selector profile", () => {
  it("accepts the stable shell before optional composer controls mount", () => {
    document.body.innerHTML =
      '<aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface></main>';

    const result = window.eval(selectorProbeExpression());

    expect(result).toEqual({
      protocol: "app:",
      profile: CODEX_SELECTOR_PROFILE,
      compatible: true,
    });
    expect(document.querySelector("[data-codex-composer-root]")).toBeNull();
  });

  it("keeps a cold Store launch open long enough for the shell to mount", () => {
    expect(CODEX_STARTUP_VERIFY_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(
      isCompatibleSelectorProbe({
        protocol: "app:",
        profile: CODEX_SELECTOR_PROFILE,
        compatible: true,
      }),
    ).toBe(true);
  });
});
