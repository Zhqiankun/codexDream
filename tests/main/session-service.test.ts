import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThemeRecord } from "../../src/main/domain/theme";
import {
  MANAGED_FILES,
  SecureManagedStore,
} from "../../src/main/infra/secure-store";
import type {
  ProcessIdentity,
  StorePackage,
  WindowsPlatform,
} from "../../src/main/platform/windows";
import { CodexSessionService } from "../../src/main/session/session-service";
import { CODEX_SELECTOR_PROFILE } from "../../src/main/session/selector-profile";
import { createManagedRoot } from "../fixtures/managed-root";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
  vi.restoreAllMocks();
});

const packageInfo: StorePackage = {
  name: "OpenAI.Codex",
  fullName: "OpenAI.Codex_1.0.0.0_x64__publisher",
  familyName: "OpenAI.Codex_publisher",
  installLocation: "C:\\Program Files\\WindowsApps\\OpenAI.Codex",
  applicationId: "App",
  aumid: "OpenAI.Codex_publisher!App",
  executablePath:
    "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\ChatGPT.exe",
};

const selectedTheme: ThemeRecord = {
  libraryId: "00000000-0000-4000-8000-000000000000",
  themeId: "local-theme",
  name: "Theme",
  description: "",
  css: '[data-ds-part="root"] { color: #fff; }',
  backgroundScope: "window",
  sidebarOverlayOpacity: 75,
  backgroundMime: "image/png",
  backgroundSha256: createHash("sha256")
    .update(Buffer.from([0]))
    .digest("hex"),
  backgroundBytes: 1,
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

describe("CodexSessionService", () => {
  it("restores and clears a paused next-launch preference without an owned session", async () => {
    let paused = true;
    const session = new CodexSessionService(
      {} as WindowsPlatform,
      async () => undefined,
      () => paused,
    );

    await session.restoreOrphanedState();
    expect(session.snapshot()).toMatchObject({
      state: "PAUSED_FUTURE",
      messageKey: "session.pausedFuture",
      canEnd: false,
    });

    paused = false;
    await session.resume();
    expect(session.snapshot()).toMatchObject({
      state: "NO_SESSION",
      messageKey: "session.ready",
    });
  });

  it("blocks any existing ChatGPT process before AppX launch", async () => {
    const listCodexProcesses = vi.fn().mockResolvedValue([
      {
        pid: 42,
        executablePath: "C:\\Previous Store Version\\app\\ChatGPT.exe",
        startedAt: "2026-08-06T00:00:00.000Z",
      },
    ]);
    const platform = {
      findStorePackage: vi.fn().mockResolvedValue(packageInfo),
      listCodexProcesses,
      launchStore: vi.fn(),
    } as unknown as WindowsPlatform;
    const session = new CodexSessionService(
      platform,
      async () => ({ record: selectedTheme, image: Buffer.alloc(1) }),
      () => false,
    );

    await expect(session.launch()).rejects.toThrow("EXTERNAL_SESSION_RUNNING");
    expect(listCodexProcesses).toHaveBeenCalledOnce();
    expect(listCodexProcesses).toHaveBeenCalledWith();
    expect(session.snapshot().state).toBe("EXTERNAL_BLOCKED");
    expect(platform.launchStore).not.toHaveBeenCalled();
  });

  it("leaves launch checks settled when Store activation fails", async () => {
    const platform = {
      findStorePackage: vi.fn().mockResolvedValue(packageInfo),
      listCodexProcesses: vi.fn().mockResolvedValue([]),
      launchStore: vi
        .fn()
        .mockRejectedValue(new Error("STORE_ACTIVATION_FAILED")),
    } as unknown as WindowsPlatform;
    const session = new CodexSessionService(
      platform,
      async () => ({ record: selectedTheme, image: Buffer.alloc(1) }),
      () => false,
    );

    await expect(session.launch()).rejects.toThrow("STORE_ACTIVATION_FAILED");
    expect(session.snapshot()).toMatchObject({
      state: "INCOMPATIBLE",
      messageKey: "session.launchFailed",
      canEnd: false,
    });
  });

  it("waits for the owned process to open its loopback CDP listener", async () => {
    const processIdentity: ProcessIdentity = {
      pid: 42,
      executablePath: packageInfo.executablePath,
      startedAt: "2026-08-27T00:00:00.000Z",
      commandLine: `ChatGPT.exe --codexstyle-launch=${"b".repeat(64)}`,
    };
    const listeningPids = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([42]);
    const platform = {
      listCodexProcesses: vi.fn().mockResolvedValue([processIdentity]),
      currentUserSid: vi.fn().mockResolvedValue("S-1-5-21-1000"),
      processOwnerSid: vi.fn().mockResolvedValue("S-1-5-21-1000"),
      listeningPids,
    } as unknown as WindowsPlatform;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Browser: "Codex/Test",
          webSocketDebuggerUrl:
            "ws://127.0.0.1:9222/devtools/browser/browser-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const session = new CodexSessionService(
      platform,
      async () => undefined,
      () => false,
    );
    const client = { close: vi.fn() };
    const harness = session as unknown as VerificationHarness;
    harness.findCompatibleTarget = vi.fn().mockResolvedValue({
      target: {
        id: "target-1",
        type: "page",
        url: "app://-/index.html",
        webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/target-1",
      },
      client,
    });

    await expect(
      harness.verifyNewProcess(
        packageInfo,
        [],
        42,
        "b".repeat(64),
        9222,
        selectedTheme,
      ),
    ).resolves.toMatchObject({
      pid: 42,
      browserId: "browser-1",
      targetId: "target-1",
    });
    expect(listeningPids).toHaveBeenCalledTimes(2);
    expect(harness.findCompatibleTarget).toHaveBeenCalledOnce();
  });

  it("still fails immediately when the CDP listener belongs to another PID", async () => {
    const platform = {
      listCodexProcesses: vi.fn().mockResolvedValue([
        {
          pid: 42,
          executablePath: packageInfo.executablePath,
          startedAt: "2026-08-27T00:00:00.000Z",
          commandLine: `ChatGPT.exe --codexstyle-launch=${"b".repeat(64)}`,
        },
      ]),
      currentUserSid: vi.fn().mockResolvedValue("S-1-5-21-1000"),
      processOwnerSid: vi.fn().mockResolvedValue("S-1-5-21-1000"),
      listeningPids: vi.fn().mockResolvedValue([99]),
    } as unknown as WindowsPlatform;
    const session = new CodexSessionService(
      platform,
      async () => undefined,
      () => false,
    );
    const harness = session as unknown as VerificationHarness;
    harness.findCompatibleTarget = vi.fn();

    await expect(
      harness.verifyNewProcess(
        packageInfo,
        [],
        42,
        "b".repeat(64),
        9222,
        selectedTheme,
      ),
    ).rejects.toThrow("TARGET_IDENTITY_MISMATCH:listener");
    expect(harness.findCompatibleTarget).not.toHaveBeenCalled();
  });

  it("reinstalls only the future-document script when resuming a paused owned session", async () => {
    const client = {
      command: vi.fn().mockResolvedValue({ identifier: "script-1" }),
      close: vi.fn(),
    };
    const platform = {} as WindowsPlatform;
    const session = new CodexSessionService(
      platform,
      async () => ({ record: selectedTheme, image: Buffer.from([0]) }),
      () => false,
    );
    const mutable = session as unknown as {
      owned?: {
        packageInfo: StorePackage;
        pid: number;
        startedAt: string;
        nonce: string;
        port: number;
        browserId: string;
        targetId: string;
        selectorProfile: typeof CODEX_SELECTOR_PROFILE;
        themeLibraryId: string;
        themeFingerprint: string;
        client: typeof client;
        newDocumentScriptId?: string;
      };
      state: string;
      messageKey: string;
      verifyOwnedIdentity: () => Promise<void>;
    };
    mutable.owned = {
      packageInfo,
      pid: 42,
      startedAt: "2026-08-06T00:00:00.000Z",
      nonce: "b".repeat(64),
      port: 9222,
      browserId: "browser-1",
      targetId: "target-1",
      selectorProfile: CODEX_SELECTOR_PROFILE,
      themeLibraryId: selectedTheme.libraryId,
      themeFingerprint: selectedTheme.fingerprint,
      client,
    };
    mutable.state = "PAUSED_FUTURE";
    vi.spyOn(mutable, "verifyOwnedIdentity").mockResolvedValue(undefined);

    await session.resume();

    expect(client.command).toHaveBeenCalledTimes(1);
    expect(client.command).toHaveBeenCalledWith(
      "Page.addScriptToEvaluateOnNewDocument",
      expect.objectContaining({ source: expect.any(String) }),
    );
    expect(session.snapshot()).toMatchObject({
      state: "THEMED_SESSION",
      messageKey: "session.resumeNextLaunch",
    });
  });

  it("reads prior ownership through the managed store and marks it orphaned", async () => {
    const managed = await createManagedRoot();
    const store = SecureManagedStore.open(managed.root);
    cleanup.push(async () => {
      store.close();
      await managed.cleanup();
    });
    store.ensureLayout();
    store.writeFileAtomic(MANAGED_FILES.ownership, ownershipState());
    const session = new CodexSessionService(
      {} as WindowsPlatform,
      async () => ({ record: selectedTheme, image: Buffer.from([0]) }),
      () => false,
      store,
    );

    await session.restoreOrphanedState();

    expect(session.snapshot()).toMatchObject({
      state: "ORPHANED",
      messageKey: "session.orphaned",
    });
  });

  it.each([
    "openai-codex-shell/1",
    "openai-codex-shell/2",
    "openai-codex-shell/3",
    "openai-codex-shell/4",
  ])(
    "treats the previous selector profile %s as orphaned instead of tampered",
    async (selectorProfile) => {
      const managed = await createManagedRoot();
      const store = SecureManagedStore.open(managed.root);
      cleanup.push(async () => {
        store.close();
        await managed.cleanup();
      });
      store.ensureLayout();
      store.writeFileAtomic(
        MANAGED_FILES.ownership,
        ownershipState(selectorProfile),
      );
      const session = new CodexSessionService(
        {} as WindowsPlatform,
        async () => ({ record: selectedTheme, image: Buffer.from([0]) }),
        () => false,
        store,
      );

      await session.restoreOrphanedState();

      expect(session.snapshot()).toMatchObject({
        state: "ORPHANED",
        messageKey: "session.orphaned",
      });
    },
  );

  it("still rejects an unknown selector profile as tampered", async () => {
    const managed = await createManagedRoot();
    const store = SecureManagedStore.open(managed.root);
    cleanup.push(async () => {
      store.close();
      await managed.cleanup();
    });
    store.ensureLayout();
    store.writeFileAtomic(
      MANAGED_FILES.ownership,
      ownershipState("openai-codex-shell/unknown"),
    );
    const session = new CodexSessionService(
      {} as WindowsPlatform,
      async () => ({ record: selectedTheme, image: Buffer.from([0]) }),
      () => false,
      store,
    );

    await expect(session.restoreOrphanedState()).rejects.toThrow(
      "STORE_TAMPERED:ownership-state",
    );
  });

  it("fails closed when ownership is substituted with a junction during recovery", async () => {
    const managed = await createManagedRoot();
    const external = await mkdtemp(
      join(process.cwd(), ".codexstyle-ownership-sentinel-"),
    );
    const store = SecureManagedStore.open(managed.root);
    cleanup.push(async () => {
      store.close();
      await managed.cleanup();
      await rm(external, { recursive: true, force: true });
    });
    store.ensureLayout();
    const sentinel = join(external, "sentinel.txt");
    await writeFile(sentinel, "unchanged", "utf8");
    await rm(join(managed.root, "ownership"), {
      recursive: true,
      force: true,
    });
    await symlink(external, join(managed.root, "ownership"), "junction");
    const session = new CodexSessionService(
      {} as WindowsPlatform,
      async () => ({ record: selectedTheme, image: Buffer.from([0]) }),
      () => false,
      store,
    );

    await expect(session.restoreOrphanedState()).rejects.toThrow(
      "STORE_TAMPERED",
    );
    expect(await readFile(sentinel, "utf8")).toBe("unchanged");
  });
});

interface VerificationHarness {
  verifyNewProcess(
    packageInfo: StorePackage,
    baseline: ProcessIdentity[],
    activatedProcessId: number,
    nonce: string,
    port: number,
    theme: ThemeRecord,
  ): Promise<{
    pid: number;
    browserId: string;
    targetId: string;
  }>;
  findCompatibleTarget: ReturnType<typeof vi.fn>;
}

function ownershipState(
  selectorProfile: string = CODEX_SELECTOR_PROFILE,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      packageFullName: packageInfo.fullName,
      packageFamilyName: packageInfo.familyName,
      executablePath: packageInfo.executablePath,
      pid: 42,
      startedAt: "2026-08-06T00:00:00.000Z",
      nonce: "b".repeat(64),
      port: 9222,
      browserId: "browser-1",
      targetId: "target-1",
      selectorProfile,
      themeLibraryId: selectedTheme.libraryId,
      themeFingerprint: selectedTheme.fingerprint,
      createdAt: "2026-08-06T00:00:00.000Z",
    }),
    "utf8",
  );
}
