import { describe, expect, it } from "vitest";
import {
  browserIdFromVersionUrl,
  validateWebSocketUrl,
} from "../../src/main/session/cdp-client";

describe("CDP endpoint identity", () => {
  it("derives the browser identity from the browser websocket path", () => {
    expect(
      browserIdFromVersionUrl(
        "ws://127.0.0.1:9222/devtools/browser/browser-identity",
        9222,
      ),
    ).toBe("browser-identity");
  });

  it("rejects aliases, redirect-shaped URLs, and wrong target paths", () => {
    for (const endpoint of [
      "ws://localhost:9222/devtools/browser/browser-identity",
      "ws://127.0.0.1:9223/devtools/browser/browser-identity",
      "ws://127.0.0.1:9222/devtools/browser/browser-identity?token=x",
      "ws://127.0.0.1:9222/devtools/page/browser-identity",
    ]) {
      expect(() => browserIdFromVersionUrl(endpoint, 9222)).toThrow(
        "TARGET_IDENTITY_MISMATCH",
      );
    }
    expect(() =>
      validateWebSocketUrl(
        "ws://127.0.0.1:9222/devtools/browser/browser-identity",
        9222,
        "page",
      ),
    ).toThrow("TARGET_IDENTITY_MISMATCH");
  });
});
