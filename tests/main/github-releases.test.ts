import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  net: { fetch: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

import { parseReleasePayload } from "../../src/main/infra/github-releases";

describe("GitHub release boundary", () => {
  it("accepts only a matching stable release from the configured repository", () => {
    expect(
      parseReleasePayload({
        tag_name: "v1.3.0",
        html_url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.3.0",
        draft: false,
        prerelease: false,
      }),
    ).toEqual({
      version: "1.3.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.3.0",
    });
  });

  it.each([
    {
      tag_name: "v1.3.0",
      html_url: "https://example.com/releases/tag/v1.3.0",
      draft: false,
      prerelease: false,
    },
    {
      tag_name: "v1.3.0",
      html_url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.4.0",
      draft: false,
      prerelease: false,
    },
    {
      tag_name: "v1.3.0",
      html_url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.3.0",
      draft: false,
      prerelease: true,
    },
  ])("rejects an untrusted or inconsistent release payload", (payload) => {
    expect(() => parseReleasePayload(payload)).toThrow("UPDATE_CHECK_FAILED");
  });
});
