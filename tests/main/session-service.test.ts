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
  StorePackage,
  WindowsPlatform,
} from "../../src/main/platform/windows";
import { CodexSessionService } from "../../src/main/session/session-service";
import { CODEX_SELECTOR_PROFILE } from "../../src/main/session/selector-profile";
import { createManagedRoot } from "../fixtures/managed-root";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
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

function ownershipState(): Buffer {
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
      selectorProfile: CODEX_SELECTOR_PROFILE,
      themeLibraryId: selectedTheme.libraryId,
      themeFingerprint: selectedTheme.fingerprint,
      createdAt: "2026-08-06T00:00:00.000Z",
    }),
    "utf8",
  );
}
