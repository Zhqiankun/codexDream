import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WindowsPlatform } from "../../src/main/platform/windows";
import type { SecureManagedStore } from "../../src/main/infra/secure-store";
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

// 只替换操作系统、CDP 与存储边界，执行真实的身份复验和保存后替换流程。
function fixture() {
  vi.useFakeTimers();
  const packageInfo = {
    fullName: "OpenAI.Codex_test",
    familyName: "OpenAI.Codex_family",
    executablePath: "C:/Codex/ChatGPT.exe",
  };
  const nonce = "b".repeat(64);
  const identity = {
    pid: 42,
    startedAt: "2026-10-30T00:00:00Z",
    commandLine: `ChatGPT.exe --codexstyle-launch=${nonce}`,
    executablePath: packageInfo.executablePath,
  };
  const platform = {
    findStorePackage: vi.fn().mockResolvedValue(packageInfo),
    listCodexProcesses: vi.fn().mockResolvedValue([identity]),
    processOwnerSid: vi.fn().mockResolvedValue("S-1-5-21-test"),
    currentUserSid: vi.fn().mockResolvedValue("S-1-5-21-test"),
    listeningPids: vi.fn().mockResolvedValue([42]),
  };
  const version = vi.spyOn(cdp, "getCdpVersion").mockResolvedValue({
    Browser: "Codex/Test",
    browserId: "browser-1",
    webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/browser-1",
  });
  const targets = vi.spyOn(cdp, "getCdpTargets").mockResolvedValue([
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
  const evaluate = vi.fn().mockResolvedValue({ result: { value: true } });
  const scripts = new Set(["original-script"]);
  let serial = 0;
  const command = vi.fn(
    async (method: string, params?: Record<string, unknown>) => {
      if (method === "Page.enable") return {};
      if (method === "Page.addScriptToEvaluateOnNewDocument") {
        const identifier = `script-${++serial}`;
        scripts.add(identifier);
        return { identifier };
      }
      if (method === "Page.removeScriptToEvaluateOnNewDocument") {
        scripts.delete(String(params?.identifier));
        return {};
      }
      if (method === "Runtime.evaluate")
        return String(params?.expression).includes("compatible:")
          ? probe()
          : evaluate();
      throw new Error(`unexpected command: ${method}`);
    },
  );
  const image = Buffer.from([0]);
  const saved: ReadyThemePayload = {
    image,
    record: {
      libraryId: "00000000-0000-4000-8000-000000000000",
      themeId: "test",
      name: "Test",
      description: "",
      css: '[data-ds-part="root"] { color: #123456; }',
      backgroundScope: "window",
      sidebarOverlayOpacity: 75,
      backgroundMime: "image/png",
      backgroundBytes: image.byteLength,
      backgroundSha256: createHash("sha256").update(image).digest("hex"),
      json: {},
      status: "ready",
      revision: 2,
      updatedAt: identity.startedAt,
      fingerprint: "c".repeat(64),
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
    ...identity,
    nonce,
    port: 9222,
    browserId: "browser-1",
    targetId: "target-1",
    selectorProfile: CODEX_SELECTOR_PROFILE,
    themeLibraryId: saved.record.libraryId,
    themeFingerprint: "a".repeat(64),
    newDocumentScriptId: "original-script",
    client: { command, close: vi.fn() },
  };
  const paused = vi.fn().mockReturnValue(false);
  const selected = vi.fn().mockResolvedValue(undefined);
  const ownership = { writeFileAtomic: vi.fn() };
  const markGood = vi.fn();
  const changed = vi.fn();
  const service = new CodexSessionService(
    platform as unknown as WindowsPlatform,
    selected,
    paused,
    ownership as unknown as SecureManagedStore,
    markGood,
    changed,
  );
  const harness = service as unknown as {
    owned: typeof owned | undefined;
    state: string;
    startWatcher(): void;
    stopWatcher(): void;
  };
  Object.assign(harness, { owned, state: "THEMED_SESSION" });
  const load = vi.fn().mockResolvedValue(saved);
  return {
    service,
    harness,
    owned,
    platform,
    version,
    targets,
    probe,
    command,
    evaluate,
    scripts,
    saved,
    paused,
    selected,
    ownership,
    markGood,
    changed,
    load,
    apply: () => service.applySavedTheme(saved.record.libraryId, load),
  };
}

describe("save the current managed theme", () => {
  it("revalidates all identity fields, updates immediately and replaces each reload script", async () => {
    const f = fixture();
    expect(await f.apply()).toEqual({ status: "applied" });
    expect(f.evaluate).toHaveBeenCalledOnce();
    expect(f.selected).not.toHaveBeenCalled();
    for (const check of [
      ...Object.values(f.platform),
      f.version,
      f.targets,
      f.probe,
    ])
      expect(check).toHaveBeenCalledOnce();
    expect(f.scripts).toEqual(new Set(["script-1"]));
    const commands = f.command.mock.calls.map(([method]) => method);
    expect(commands.indexOf("Page.enable")).toBeLessThan(
      commands.indexOf("Page.addScriptToEvaluateOnNewDocument"),
    );
    expect(f.owned.themeFingerprint).toBe(f.saved.record.fingerprint);
    expect(f.markGood).toHaveBeenCalledWith(
      f.saved.record.libraryId,
      f.saved.record.fingerprint,
    );
    const persisted = JSON.parse(
      f.ownership.writeFileAtomic.mock.calls[0][1].toString(),
    );
    expect(persisted.themeFingerprint).toBe(f.saved.record.fingerprint);
    f.saved.record.css = '[data-ds-part="root"] { color: #abcdef; }';
    f.saved.record.fingerprint = "d".repeat(64);
    expect(await f.apply()).toEqual({ status: "applied" });
    expect(f.scripts).toEqual(new Set(["script-2"]));
    const expressions = f.command.mock.calls
      .filter(([method]) => method === "Page.addScriptToEvaluateOnNewDocument")
      .map(([, params]) => String(params?.source));
    expect(expressions[0]).toContain("#123456");
    expect(expressions[1]).toContain("#abcdef");
    expect(f.owned.client.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(["no-session", "orphaned", "different-theme", "paused"] as const)(
    "saves only for %s without reading payload or contacting a process",
    async (reason) => {
      const f = fixture();
      if (reason === "no-session" || reason === "orphaned") {
        f.harness.owned = undefined;
        f.harness.state =
          reason === "orphaned" ? "ORPHANED" : "EXTERNAL_BLOCKED";
      }
      if (reason === "different-theme")
        f.owned.themeLibraryId = "another-theme";
      if (reason === "paused") f.paused.mockReturnValue(true);
      expect(await f.apply()).toEqual({
        status: "skipped",
        reason: reason === "orphaned" ? "no-session" : reason,
      });
      expect(f.load).not.toHaveBeenCalled();
      expect(f.command).not.toHaveBeenCalled();
      expect(f.platform.findStorePackage).not.toHaveBeenCalled();
      expect(f.ownership.writeFileAtomic).not.toHaveBeenCalled();
    },
  );

  it.each([
    "package",
    "process",
    "owner",
    "listener",
    "browser",
    "target",
    "selector",
  ])(
    "fails closed before any write when %s verification fails",
    async (failure) => {
      const f = fixture();
      if (failure === "package")
        f.platform.findStorePackage.mockResolvedValue(undefined);
      if (failure === "process")
        f.platform.listCodexProcesses.mockResolvedValue([]);
      if (failure === "owner")
        f.platform.processOwnerSid.mockResolvedValue("foreign-sid");
      if (failure === "listener")
        f.platform.listeningPids.mockResolvedValue([99]);
      if (failure === "browser")
        f.version.mockRejectedValue(new Error("TARGET_IDENTITY_MISMATCH"));
      if (failure === "target") f.targets.mockResolvedValue([]);
      if (failure === "selector")
        f.probe.mockResolvedValue({ result: { value: { compatible: false } } });
      expect(await f.apply()).toEqual({
        status: "failed",
        reason: "verification",
      });
      expect(f.service.snapshot().state).toBe("ORPHANED");
      expect(
        f.command.mock.calls.every(([method]) => method === "Runtime.evaluate"),
      ).toBe(true);
      expect(f.evaluate).not.toHaveBeenCalled();
      expect(f.markGood).not.toHaveBeenCalled();
      expect(f.ownership.writeFileAtomic).not.toHaveBeenCalled();
      expect(f.owned.client.close).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["css", "image", "read"])(
    "retains the current session when saved %s validation fails before CDP",
    async (failure) => {
      const f = fixture();
      if (failure === "css") f.saved.record.css = "body { color: red }";
      if (failure === "image") f.saved.image = Buffer.from([1]);
      if (failure === "read")
        f.load.mockRejectedValue(new Error("STORE_TAMPERED"));
      expect(await f.apply()).toEqual({
        status: "failed",
        reason: "verification",
      });
      expect(f.command).not.toHaveBeenCalled();
      expect(f.service.snapshot().state).toBe("THEMED_SESSION");
      expect(f.scripts).toEqual(new Set(["original-script"]));
    },
  );

  it.each(["registration", "old-script", "runtime", "persistence"])(
    "cleans known replacement scripts and reports %s failure without closing the window",
    async (failure) => {
      const f = fixture();
      if (failure === "registration" || failure === "old-script") {
        const command = f.command.getMockImplementation()!;
        f.command.mockImplementation(async (method, params) => {
          if (
            (failure === "registration" &&
              method === "Page.addScriptToEvaluateOnNewDocument") ||
            (failure === "old-script" &&
              method === "Page.removeScriptToEvaluateOnNewDocument" &&
              params?.identifier === "original-script")
          )
            throw new Error("CDP_UNAVAILABLE");
          return command(method, params);
        });
      }
      if (failure === "runtime")
        f.evaluate.mockResolvedValue({ result: { value: false } });
      if (failure === "persistence")
        f.ownership.writeFileAtomic.mockImplementation(() => {
          throw new Error("STORE_TAMPERED");
        });
      expect(await f.apply()).toEqual({
        status: "failed",
        reason: "injection",
      });
      expect(f.service.snapshot().state).toBe("ORPHANED");
      expect(f.scripts).toEqual(
        new Set(
          failure === "registration" || failure === "old-script"
            ? ["original-script"]
            : [],
        ),
      );
      expect(
        f.command.mock.calls.some(([method]) => method === "Browser.close"),
      ).toBe(false);
      expect(f.markGood).not.toHaveBeenCalled();
    },
  );

  it("does not issue cleanup commands after ownership is lost during an application failure", async () => {
    const f = fixture();
    f.evaluate.mockImplementation(async () => {
      f.platform.findStorePackage.mockResolvedValue(undefined);
      throw new Error("CDP_UNAVAILABLE");
    });
    expect(await f.apply()).toEqual({ status: "failed", reason: "injection" });
    expect(
      f.command.mock.calls.filter(
        ([method]) => method === "Page.removeScriptToEvaluateOnNewDocument",
      ),
    ).toEqual([
      [
        "Page.removeScriptToEvaluateOnNewDocument",
        { identifier: "original-script" },
      ],
    ]);
    expect(f.service.snapshot().state).toBe("ORPHANED");
  });

  it("invalidates an older in-flight watcher result while saving", async () => {
    const f = fixture();
    let finish!: (value: unknown) => void;
    f.platform.findStorePackage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    f.harness.startWatcher();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await f.apply()).toEqual({ status: "applied" });
    finish(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.changed).not.toHaveBeenCalled();
    expect(f.service.snapshot().state).toBe("THEMED_SESSION");
    expect(vi.getTimerCount()).toBe(1);
  });
});
