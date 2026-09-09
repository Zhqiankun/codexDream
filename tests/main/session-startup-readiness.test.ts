import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WindowsPlatform } from "../../src/main/platform/windows";
import * as cdp from "../../src/main/session/cdp-client";
import { CODEX_SELECTOR_PROFILE } from "../../src/main/session/selector-profile";
import {
  CodexSessionService,
  type ReadyThemePayload,
} from "../../src/main/session/session-service";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Exercise the real injection and identity checks, stubbing only the OS/CDP
// boundary. This recreates a shell disappearing between discovery and injection.
function readinessFixture() {
  const packageInfo = {
    name: "OpenAI.Codex",
    fullName: "OpenAI.Codex_test",
    familyName: "OpenAI.Codex_family",
    installLocation: "C:/Codex",
    applicationId: "App",
    aumid: "Codex!App",
    executablePath: "C:/Codex/ChatGPT.exe",
  };
  const nonce = "b".repeat(64);
  const processIdentity = {
    pid: 42,
    startedAt: "2026-09-09T00:00:00Z",
    commandLine: `ChatGPT.exe --codexstyle-launch=${nonce}`,
    executablePath: packageInfo.executablePath,
  };
  const platform = {
    findStorePackage: vi.fn().mockResolvedValue(packageInfo),
    listCodexProcesses: vi.fn().mockResolvedValue([processIdentity]),
    processOwnerSid: vi.fn().mockResolvedValue("S-1-5-21-test"),
    currentUserSid: vi.fn().mockResolvedValue("S-1-5-21-test"),
    listeningPids: vi.fn().mockResolvedValue([42]),
  };
  vi.spyOn(cdp, "getCdpVersion").mockResolvedValue({
    Browser: "Codex/Test",
    browserId: "browser-1",
    webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/browser-1",
  });
  vi.spyOn(cdp, "getCdpTargets").mockResolvedValue([
    {
      id: "target-1",
      type: "page",
      url: "app://test/",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/target-1",
    },
  ]);
  const probe = vi.fn().mockResolvedValue({
    result: {
      value: {
        protocol: "app:",
        profile: CODEX_SELECTOR_PROFILE,
        compatible: true,
      },
    },
  });
  const command = vi.fn(
    async (method: string, params?: Record<string, unknown>) => {
      if (method === "Page.addScriptToEvaluateOnNewDocument")
        return { identifier: "script-1" };
      if (
        method === "Runtime.evaluate" &&
        String(params?.expression).includes("compatible:")
      )
        return probe();
      return { result: { value: true } };
    },
  );
  const image = Buffer.from([0]);
  const theme: ReadyThemePayload = {
    image,
    record: {
      libraryId: "00000000-0000-4000-8000-000000000000",
      themeId: "test",
      name: "Test",
      description: "",
      css: '[data-ds-part="root"] { color: #fff; }',
      backgroundScope: "window",
      sidebarOverlayOpacity: 75,
      backgroundMime: "image/png",
      backgroundBytes: 1,
      backgroundSha256: createHash("sha256").update(image).digest("hex"),
      json: {},
      status: "ready",
      revision: 1,
      updatedAt: processIdentity.startedAt,
      fingerprint: "a".repeat(64),
      packageFormat: "simplified",
      signed: false,
      validation: {
        css: "valid",
        image: "valid",
        package: "ready",
        warnings: [],
      },
    },
  };
  const owned = {
    packageInfo,
    ...processIdentity,
    nonce,
    port: 9222,
    browserId: "browser-1",
    targetId: "target-1",
    selectorProfile: CODEX_SELECTOR_PROFILE,
    themeLibraryId: theme.record.libraryId,
    themeFingerprint: theme.record.fingerprint,
    client: { command, close: vi.fn() },
  };
  const service = new CodexSessionService(
    platform as unknown as WindowsPlatform,
    async () => theme,
    () => false,
  );
  const harness = service as unknown as {
    inject(session: typeof owned, payload: ReadyThemePayload): Promise<void>;
  };
  return {
    platform,
    probe,
    command,
    inject: () => harness.inject(owned, theme),
  };
}

describe("startup shell readiness before injection", () => {
  it.each(["missing-shell", "Execution context was destroyed."])(
    "waits through %s and injects only after revalidating ownership",
    async (failure) => {
      vi.useFakeTimers();
      const fixture = readinessFixture();
      if (failure === "missing-shell")
        fixture.probe.mockResolvedValueOnce({
          result: {
            value: {
              protocol: "app:",
              profile: CODEX_SELECTOR_PROFILE,
              compatible: false,
            },
          },
        });
      else fixture.probe.mockRejectedValueOnce(new Error(failure));
      const pending = fixture.inject();
      await vi.advanceTimersByTimeAsync(0);
      expect(fixture.probe).toHaveBeenCalledOnce();
      expect(
        fixture.command.mock.calls.some(
          ([method]) => method === "Page.addScriptToEvaluateOnNewDocument",
        ),
      ).toBe(false);
      await vi.advanceTimersByTimeAsync(250);
      await pending;
      expect(fixture.platform.listCodexProcesses).toHaveBeenCalledTimes(2);
      expect(fixture.probe).toHaveBeenCalledTimes(2);
      expect(
        fixture.command.mock.calls.filter(
          ([method]) => method === "Page.addScriptToEvaluateOnNewDocument",
        ),
      ).toHaveLength(1);
    },
  );

  it("bounds the wait and never injects into a persistently incompatible shell", async () => {
    vi.useFakeTimers();
    const fixture = readinessFixture();
    fixture.probe.mockResolvedValue({
      result: {
        value: {
          protocol: "app:",
          profile: CODEX_SELECTOR_PROFILE,
          compatible: false,
        },
      },
    });
    const pending = expect(fixture.inject()).rejects.toThrow(
      "TARGET_INCOMPATIBLE:selector-profile",
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(
      fixture.command.mock.calls.every(
        ([method]) => method === "Runtime.evaluate",
      ),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops immediately if ownership changes during the retry", async () => {
    vi.useFakeTimers();
    const fixture = readinessFixture();
    fixture.probe.mockResolvedValueOnce({
      result: { value: { compatible: false } },
    });
    fixture.platform.listeningPids
      .mockResolvedValueOnce([42])
      .mockResolvedValue([99]);
    const pending = expect(fixture.inject()).rejects.toThrow(
      "TARGET_IDENTITY_MISMATCH:runtime",
    );
    await vi.advanceTimersByTimeAsync(250);
    await pending;
    expect(fixture.probe).toHaveBeenCalledOnce();
    expect(
      fixture.command.mock.calls.some(
        ([method]) => method === "Page.addScriptToEvaluateOnNewDocument",
      ),
    ).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
