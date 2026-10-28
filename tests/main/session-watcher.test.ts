import { afterEach, describe, expect, it, vi } from "vitest";
import type { WindowsPlatform } from "../../src/main/platform/windows";
import * as cdp from "../../src/main/session/cdp-client";
import { CODEX_SELECTOR_PROFILE } from "../../src/main/session/selector-profile";
import { CodexSessionService } from "../../src/main/session/session-service";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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
    startedAt: "2026-10-22T00:00:00Z",
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
  const owned = {
    packageInfo,
    ...identity,
    nonce,
    port: 9222,
    browserId: "browser-1",
    targetId: "target-1",
    selectorProfile: CODEX_SELECTOR_PROFILE,
    client: { close: vi.fn(), command: vi.fn() },
  };
  const changed = vi.fn();
  const service = new CodexSessionService(
    platform as unknown as WindowsPlatform,
    async () => undefined,
    () => false,
    undefined,
    undefined,
    changed,
  );
  // Stub only ownership setup and OS/CDP boundaries; the actual watcher and
  // complete identity-verification sequence run under a deterministic clock.
  const harness = service as unknown as {
    owned: typeof owned;
    startWatcher(): void;
    stopWatcher(): void;
  };
  harness.owned = owned;
  return {
    service,
    harness,
    owned,
    platform,
    packageInfo,
    changed,
    version,
    targets,
  };
}

describe("owned-session background checks", () => {
  it("waits for a slow full check and then leaves a 1.5 second gap", async () => {
    const f = fixture();
    let finish!: (value: typeof f.packageInfo) => void;
    f.platform.findStorePackage.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    f.harness.startWatcher();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.platform.findStorePackage).toHaveBeenCalledTimes(1);
    expect(f.platform.listCodexProcesses).not.toHaveBeenCalled();
    finish(f.packageInfo);
    await vi.advanceTimersByTimeAsync(0);
    for (const check of [
      f.platform.listCodexProcesses,
      f.platform.processOwnerSid,
      f.platform.currentUserSid,
      f.platform.listeningPids,
      f.version,
      f.targets,
    ]) {
      expect(check).toHaveBeenCalledTimes(1);
    }
    await vi.advanceTimersByTimeAsync(1499);
    expect(f.platform.findStorePackage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.platform.findStorePackage).toHaveBeenCalledTimes(2);
    f.harness.stopWatcher();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resolve", "reject"] as const)(
    "does not revive or report an orphaned check after it later %ss",
    async (outcome) => {
      const f = fixture();
      let resolve!: (value: typeof f.packageInfo) => void;
      let reject!: (error: Error) => void;
      f.platform.findStorePackage.mockImplementationOnce(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      f.harness.startWatcher();
      await vi.advanceTimersByTimeAsync(1500);
      f.service.orphanForWatcher(f.owned.pid, f.owned.nonce);
      if (outcome === "resolve") resolve(f.packageInfo);
      else reject(new Error("process ended"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(f.platform.findStorePackage).toHaveBeenCalledTimes(1);
      expect(f.changed).not.toHaveBeenCalled();
      expect(f.service.snapshot().state).toBe("ORPHANED");
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("reports a failed active identity check and stops when it is orphaned", async () => {
    const f = fixture();
    f.platform.listeningPids.mockResolvedValue([99]);
    f.changed.mockImplementation((pid, nonce) =>
      f.service.orphanForWatcher(pid, nonce),
    );
    f.harness.startWatcher();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.changed).toHaveBeenCalledExactlyOnceWith(42, f.owned.nonce);
    expect(f.owned.client.command).not.toHaveBeenCalled();
    expect(f.service.snapshot().state).toBe("ORPHANED");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for a slow failure notification and retries if the notifier rejects", async () => {
    const f = fixture();
    f.platform.listeningPids.mockResolvedValue([99]);
    let reject!: (error: Error) => void;
    f.changed.mockImplementationOnce(
      () => new Promise<void>((_, no) => (reject = no)),
    );
    f.harness.startWatcher();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.platform.findStorePackage).toHaveBeenCalledTimes(1);
    expect(f.changed).toHaveBeenCalledTimes(1);
    reject(new Error("notification unavailable"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1499);
    expect(f.platform.findStorePackage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.platform.findStorePackage).toHaveBeenCalledTimes(2);
    expect(f.changed).toHaveBeenCalledTimes(2);
    f.harness.stopWatcher();
    expect(vi.getTimerCount()).toBe(0);
  });
});
