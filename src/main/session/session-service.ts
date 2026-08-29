import { createHash, randomBytes } from "node:crypto";
import {
  readThemeConfiguration,
  type SessionSnapshot,
  type SessionState,
} from "../../contracts";
import type { ThemeRecord } from "../domain/theme";
import { validateSafeCss } from "../infra/safe-css";
import { MANAGED_FILES, SecureManagedStore } from "../infra/secure-store";
import {
  CdpClient,
  getCdpTargets,
  getCdpVersion,
  type CdpTarget,
} from "./cdp-client";
import {
  CODEX_SELECTOR_PROFILE,
  isCompatibleSelectorProbe,
  selectorProbeExpression,
} from "./selector-profile";
import { buildThemePayload } from "./theme-payload";
import {
  WindowsPlatform,
  type ProcessIdentity,
  type StorePackage,
} from "../platform/windows";

interface OwnedSession {
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
  client: CdpClient;
  newDocumentScriptId?: string;
}

export const CODEX_STARTUP_VERIFY_TIMEOUT_MS = 90_000;
const CODEX_STARTUP_POLL_INTERVAL_MS = 250;

interface PersistedOwnedSession {
  version: 1;
  packageFullName: string;
  packageFamilyName: string;
  executablePath: string;
  pid: number;
  startedAt: string;
  nonce: string;
  port: number;
  browserId: string;
  targetId: string;
  selectorProfile: PersistedSelectorProfile;
  themeLibraryId: string;
  themeFingerprint: string;
  createdAt: string;
}

type PersistedSelectorProfile =
  | typeof CODEX_SELECTOR_PROFILE
  | "openai-codex-shell/1"
  | "openai-codex-shell/2"
  | "openai-codex-shell/3"
  | "openai-codex-shell/4"
  | "openai-codex-shell/5"
  | "openai-codex-shell/6"
  | "openai-codex-shell/7";

const PERSISTED_SELECTOR_PROFILES = new Set<PersistedSelectorProfile>([
  "openai-codex-shell/1",
  "openai-codex-shell/2",
  "openai-codex-shell/3",
  "openai-codex-shell/4",
  "openai-codex-shell/5",
  "openai-codex-shell/6",
  "openai-codex-shell/7",
  CODEX_SELECTOR_PROFILE,
]);

export interface ReadyThemePayload {
  record: ThemeRecord;
  image: Buffer;
}

export class CodexSessionService {
  private state: SessionState = "NO_SESSION";
  private messageKey = "session.ready";
  private owned?: OwnedSession;
  private watcher?: NodeJS.Timeout;

  constructor(
    private readonly platform: WindowsPlatform,
    private readonly selectedTheme: () => Promise<
      ReadyThemePayload | undefined
    >,
    private readonly paused: () => boolean,
    private readonly ownershipStore?: SecureManagedStore,
    private readonly markLastKnownGood?: (
      libraryId: string,
      fingerprint: string,
    ) => Promise<void>,
    private readonly onStateChanged?: (
      pid: number,
      nonce: string,
    ) => Promise<void> | void,
  ) {}

  snapshot(): SessionSnapshot {
    return {
      state: this.state,
      messageKey: this.messageKey,
      canEnd: Boolean(this.owned),
      launchedByTool: Boolean(this.owned),
    };
  }

  /** A previous process is never reattached or closed after an app restart. */
  async restoreOrphanedState(): Promise<void> {
    const stored = this.ownershipStore
      ? readOwnershipState(this.ownershipStore)
      : undefined;
    if (stored) {
      this.state = "ORPHANED";
      this.messageKey = "session.orphaned";
    } else if (this.paused()) {
      this.state = "PAUSED_FUTURE";
      this.messageKey = "session.pausedFuture";
    }
  }

  async launch(): Promise<void> {
    if (this.owned) return;
    // An orphan warning never authorizes reattachment. A user-triggered launch
    // may proceed from this state, but it must still pass the fresh baseline
    // and full identity checks below.
    if (this.paused()) this.fail("NO_SESSION", "session.paused", "PAUSED");
    const selected = await this.selectedTheme();
    const theme = selected?.record;
    if (!theme || theme.status !== "ready" || !theme.fingerprint)
      this.fail("INCOMPATIBLE", "session.themeNotReady", "INCOMPLETE_THEME");
    if (!validateSafeCss(theme.css).valid)
      this.fail("INCOMPATIBLE", "session.themeUnsafe", "UNSAFE_CSS");
    const packageInfo = await this.platform.findStorePackage();
    if (!packageInfo)
      this.fail(
        "INCOMPATIBLE",
        "session.storePackageNotFound",
        "STORE_PACKAGE_NOT_FOUND",
      );
    // Block on every existing ChatGPT.exe process. Restricting this baseline
    // to the current Store version would miss an external session surviving a
    // Store update; the later ownership checks remain path-exact.
    const baseline = await this.platform.listCodexProcesses();
    if (baseline.length)
      this.fail(
        "EXTERNAL_BLOCKED",
        "session.externalRunning",
        "EXTERNAL_SESSION_RUNNING",
      );
    this.state = "LAUNCHING";
    this.messageKey = "session.launching";
    const nonce = randomBytes(32).toString("hex");
    const port = await reservePort();
    let activatedProcessId: number;
    try {
      activatedProcessId = await this.platform.launchStore(
        packageInfo,
        nonce,
        port,
      );
    } catch {
      this.fail(
        "INCOMPATIBLE",
        "session.launchFailed",
        "STORE_ACTIVATION_FAILED",
      );
    }
    this.state = "VERIFYING_CDP";
    this.messageKey = "session.verifying";
    let owned: OwnedSession;
    try {
      owned = await this.verifyNewProcess(
        packageInfo,
        baseline,
        activatedProcessId,
        nonce,
        port,
        theme,
      );
    } catch (error) {
      this.state = "INCOMPATIBLE";
      this.messageKey = verificationFailureMessageKey(error);
      throw error;
    }
    this.owned = owned;
    try {
      await this.persistOwnership(owned);
      await this.inject(owned, selected);
      await this.markLastKnownGood?.(theme.libraryId, theme.fingerprint);
      this.state = "THEMED_SESSION";
      this.messageKey = "session.themed";
      this.startWatcher();
    } catch (error) {
      await this.rollbackVerifiedLaunch(owned);
      this.state = "INCOMPATIBLE";
      this.messageKey = isTargetError(error)
        ? "session.targetIncompatible"
        : "session.injectionFailed";
      throw error;
    }
  }

  async pause(): Promise<void> {
    if (!this.owned) {
      this.state = "PAUSED_FUTURE";
      this.messageKey = "session.pausedFuture";
      return;
    }
    const owned = this.owned;
    try {
      await this.verifyOwnedIdentity(owned, true);
      if (owned.newDocumentScriptId) {
        await owned.client.command("Page.removeScriptToEvaluateOnNewDocument", {
          identifier: owned.newDocumentScriptId,
        });
        owned.newDocumentScriptId = undefined;
        await this.persistOwnership(owned);
      }
      this.state = "PAUSED_FUTURE";
      this.messageKey = "session.pausedFuture";
    } catch (error) {
      this.markOrphaned(owned);
      throw new Error("CLEANUP_FAILED:pause");
    }
  }

  async resume(): Promise<void> {
    if (!this.owned) {
      this.state = "NO_SESSION";
      this.messageKey = "session.ready";
      return;
    }
    // Resume permits the next tool-owned launch only. It deliberately neither
    // re-adds a new-document script nor rewrites the page that was paused.
    // The current owned page remains themed, so it is no longer reported as
    // paused once the persisted next-launch setting has been restored.
    if (this.state !== "PAUSED_FUTURE") return;
    const owned = this.owned;
    try {
      await this.registerFutureInjection(owned);
      this.state = "THEMED_SESSION";
      this.messageKey = "session.resumeNextLaunch";
    } catch (error) {
      this.markOrphaned(owned);
      throw error;
    }
  }

  async endOwned(): Promise<void> {
    if (!this.owned) return;
    const owned = this.owned;
    try {
      await this.verifyOwnedIdentity(owned, true);
      await owned.client.command("Browser.close");
      owned.client.close();
      await this.removeOwnershipState();
      this.stopWatcher();
      this.owned = undefined;
      this.state = "NO_SESSION";
      this.messageKey = "session.ready";
    } catch {
      this.markOrphaned(owned);
      throw new Error("CLEANUP_FAILED");
    }
  }

  orphanForWatcher(pid: number, nonce: string): void {
    const owned = this.owned;
    if (owned && owned.pid === pid && owned.nonce === nonce)
      this.markOrphaned(owned);
  }

  private async verifyNewProcess(
    packageInfo: StorePackage,
    baseline: ProcessIdentity[],
    activatedProcessId: number,
    nonce: string,
    port: number,
    theme: ThemeRecord,
  ): Promise<OwnedSession> {
    // The Store build can expose CDP well before React mounts the stable shell
    // anchors, especially on the first cold start after an update. Keep the
    // identity checks strict, but give the verified process enough time to
    // finish rendering before classifying its selector profile as incompatible.
    const deadline = Date.now() + CODEX_STARTUP_VERIFY_TIMEOUT_MS;
    const currentSid = await this.platform.currentUserSid();
    if (!currentSid) throw new Error("TARGET_IDENTITY_MISMATCH:current-sid");
    let sawOwnedProcess = false;
    let sawCdpEndpoint = false;
    let incompleteIdentityReason: string | undefined;
    while (Date.now() < deadline) {
      let processes: ProcessIdentity[];
      try {
        processes = await this.platform.listCodexProcesses(
          packageInfo.executablePath,
        );
      } catch {
        // WMI/CIM can be briefly unavailable while a Store process is being
        // materialized. No identity is accepted here; retry the full query.
        await delay(CODEX_STARTUP_POLL_INTERVAL_MS);
        continue;
      }
      const fresh = processes.filter(
        (process) =>
          process.pid === activatedProcessId &&
          !baseline.some((before) => before.pid === process.pid) &&
          hasNonce(process.commandLine, nonce),
      );
      if (fresh.length > 1)
        throw new Error("TARGET_IDENTITY_MISMATCH:multiple-owned-processes");
      if (fresh.length === 1) {
        sawOwnedProcess = true;
        const process = fresh[0];
        if (!process.startedAt) {
          incompleteIdentityReason =
            "TARGET_IDENTITY_MISMATCH:missing-start-time";
          await delay(CODEX_STARTUP_POLL_INTERVAL_MS);
          continue;
        }
        const ownerSid = await this.platform.processOwnerSid(process.pid);
        if (!ownerSid) {
          incompleteIdentityReason =
            "TARGET_IDENTITY_MISMATCH:owner-unavailable";
          await delay(CODEX_STARTUP_POLL_INTERVAL_MS);
          continue;
        }
        if (ownerSid !== currentSid)
          throw new Error("TARGET_IDENTITY_MISMATCH:owner-sid");
        incompleteIdentityReason = undefined;
        const listening = await this.platform.listeningPids(port);
        // The Store process is observable before Chromium opens its CDP
        // listener on cold starts. An empty result is "not ready"; any
        // non-empty result that is not exactly the owned PID is a hard fail.
        if (listening.length === 0) {
          await delay(CODEX_STARTUP_POLL_INTERVAL_MS);
          continue;
        }
        if (listening.length !== 1 || listening[0] !== process.pid)
          throw new Error("TARGET_IDENTITY_MISMATCH:listener");
        try {
          const version = await getCdpVersion(port);
          sawCdpEndpoint = true;
          const target = await this.findCompatibleTarget(port);
          return {
            packageInfo,
            pid: process.pid,
            startedAt: process.startedAt,
            nonce,
            port,
            browserId: version.browserId,
            targetId: target.target.id,
            selectorProfile: CODEX_SELECTOR_PROFILE,
            themeLibraryId: theme.libraryId,
            themeFingerprint: theme.fingerprint,
            client: target.client,
          };
        } catch (error) {
          if (isIdentityError(error)) throw error;
        }
      } else if (sawOwnedProcess) {
        incompleteIdentityReason =
          "TARGET_IDENTITY_MISMATCH:owned-process-disappeared";
      }
      await delay(CODEX_STARTUP_POLL_INTERVAL_MS);
    }
    if (incompleteIdentityReason) throw new Error(incompleteIdentityReason);
    throw new Error(sawCdpEndpoint ? "TARGET_INCOMPATIBLE" : "CDP_UNAVAILABLE");
  }

  private async findCompatibleTarget(
    port: number,
  ): Promise<{ target: CdpTarget; client: CdpClient }> {
    const candidates = await getCdpTargets(port);
    const matches: Array<{ target: CdpTarget; client: CdpClient }> = [];
    for (const target of candidates) {
      const client = new CdpClient(
        target.webSocketDebuggerUrl,
        port,
        target.id,
      );
      try {
        await client.connect();
        const probe = await client.command("Runtime.evaluate", {
          expression: selectorProbeExpression(),
          returnByValue: true,
          awaitPromise: true,
        });
        if (isCompatibleSelectorProbe(runtimeValue(probe)))
          matches.push({ target, client });
        else client.close();
      } catch {
        client.close();
      }
    }
    if (matches.length !== 1) {
      for (const match of matches) match.client.close();
      throw new Error("TARGET_INCOMPATIBLE:selector-profile");
    }
    return matches[0];
  }

  private async inject(
    session: OwnedSession,
    initialTheme: ReadyThemePayload,
  ): Promise<void> {
    if (this.paused()) throw new Error("PAUSED");
    const selected = await this.selectedTheme();
    const theme = selected?.record;
    if (
      !selected ||
      !theme ||
      theme.status !== "ready" ||
      theme.libraryId !== session.themeLibraryId ||
      theme.fingerprint !== session.themeFingerprint ||
      theme.fingerprint !== initialTheme.record.fingerprint ||
      theme.backgroundSha256 !== initialTheme.record.backgroundSha256
    )
      throw new Error("INCOMPLETE_THEME:selection-changed");
    const validation = validateSafeCss(theme.css);
    if (!validation.valid || validation.empty) throw new Error("UNSAFE_CSS");
    await this.verifyOwnedIdentity(session, true);
    const marker = `codexstyle-${theme.libraryId}`;
    const configuration = readThemeConfiguration(theme.json);
    const expression = buildThemePayload(
      marker,
      theme.css,
      imageDataUrl(theme, selected.image),
      {
        ...configuration,
        backgroundScope: theme.backgroundScope,
        sidebarOverlayOpacity: theme.sidebarOverlayOpacity,
      },
    );
    const registration = await session.client.command(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: expression },
    );
    const identifier = scriptIdentifier(registration);
    if (!identifier) throw new Error("INJECTION_FAILED:script-registration");
    session.newDocumentScriptId = identifier;
    try {
      const injected = await session.client.command("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (runtimeValue(injected) !== true)
        throw new Error("INJECTION_FAILED:runtime-result");
      await this.persistOwnership(session);
    } catch (error) {
      await session.client
        .command("Page.removeScriptToEvaluateOnNewDocument", { identifier })
        .catch(() => undefined);
      session.newDocumentScriptId = undefined;
      throw error;
    }
  }

  /**
   * Re-enable only the script applied to documents created after resume. The
   * current page is intentionally not evaluated again: users must restart a
   * tool-owned session to apply a different theme to the running document.
   */
  private async registerFutureInjection(session: OwnedSession): Promise<void> {
    if (session.newDocumentScriptId)
      throw new Error("INJECTION_FAILED:script-already-registered");
    const selected = await this.selectedTheme();
    const theme = selected?.record;
    if (
      !selected ||
      !theme ||
      theme.status !== "ready" ||
      theme.libraryId !== session.themeLibraryId ||
      theme.fingerprint !== session.themeFingerprint
    )
      throw new Error("INCOMPLETE_THEME:selection-changed");
    const validation = validateSafeCss(theme.css);
    if (!validation.valid || validation.empty) throw new Error("UNSAFE_CSS");
    await this.verifyOwnedIdentity(session, true);
    const registration = await session.client.command(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source: buildThemePayload(
          `codexstyle-${theme.libraryId}`,
          theme.css,
          imageDataUrl(theme, selected.image),
          {
            ...readThemeConfiguration(theme.json),
            backgroundScope: theme.backgroundScope,
            sidebarOverlayOpacity: theme.sidebarOverlayOpacity,
          },
        ),
      },
    );
    const identifier = scriptIdentifier(registration);
    if (!identifier) throw new Error("INJECTION_FAILED:script-registration");
    session.newDocumentScriptId = identifier;
    try {
      await this.persistOwnership(session);
    } catch (error) {
      await session.client
        .command("Page.removeScriptToEvaluateOnNewDocument", { identifier })
        .catch(() => undefined);
      session.newDocumentScriptId = undefined;
      throw error;
    }
  }

  private async verifyOwnedIdentity(
    session: OwnedSession,
    checkSelector: boolean,
  ): Promise<void> {
    const packageInfo = await this.platform.findStorePackage();
    if (
      !packageInfo ||
      packageInfo.fullName !== session.packageInfo.fullName ||
      packageInfo.familyName !== session.packageInfo.familyName ||
      !samePath(packageInfo.executablePath, session.packageInfo.executablePath)
    )
      throw new Error("TARGET_IDENTITY_MISMATCH:package");
    const processes = await this.platform.listCodexProcesses(
      session.packageInfo.executablePath,
    );
    const process = processes.find((item) => item.pid === session.pid);
    if (
      !process ||
      process.startedAt !== session.startedAt ||
      !hasNonce(process.commandLine, session.nonce) ||
      !samePath(process.executablePath, session.packageInfo.executablePath)
    )
      throw new Error("TARGET_IDENTITY_MISMATCH:process");
    const [ownerSid, currentSid, listening, version, targets] =
      await Promise.all([
        this.platform.processOwnerSid(session.pid),
        this.platform.currentUserSid(),
        this.platform.listeningPids(session.port),
        getCdpVersion(session.port),
        getCdpTargets(session.port),
      ]);
    if (
      !ownerSid ||
      !currentSid ||
      ownerSid !== currentSid ||
      listening.length !== 1 ||
      listening[0] !== session.pid ||
      version.browserId !== session.browserId
    )
      throw new Error("TARGET_IDENTITY_MISMATCH:runtime");
    const target = targets.find((item) => item.id === session.targetId);
    if (!target) throw new Error("TARGET_IDENTITY_MISMATCH:target");
    if (checkSelector) {
      const probe = await session.client.command("Runtime.evaluate", {
        expression: selectorProbeExpression(),
        returnByValue: true,
        awaitPromise: true,
      });
      if (
        session.selectorProfile !== CODEX_SELECTOR_PROFILE ||
        !isCompatibleSelectorProbe(runtimeValue(probe))
      )
        throw new Error("TARGET_INCOMPATIBLE:selector-profile");
    }
  }

  private startWatcher(): void {
    this.stopWatcher();
    this.watcher = setInterval(() => {
      void this.watchOwnedSession();
    }, 1_500);
  }

  private async watchOwnedSession(): Promise<void> {
    const owned = this.owned;
    if (!owned) return;
    try {
      await this.verifyOwnedIdentity(owned, false);
    } catch {
      await this.onStateChanged?.(owned.pid, owned.nonce);
    }
  }

  private async rollbackVerifiedLaunch(owned: OwnedSession): Promise<void> {
    try {
      await this.verifyOwnedIdentity(owned, false);
      await owned.client.command("Browser.close");
      owned.client.close();
      await this.removeOwnershipState();
      this.stopWatcher();
      this.owned = undefined;
    } catch {
      this.markOrphaned(owned);
    }
  }

  private markOrphaned(owned: OwnedSession): void {
    if (this.owned !== owned) return;
    this.stopWatcher();
    owned.client.close();
    this.owned = undefined;
    this.state = "ORPHANED";
    this.messageKey = "session.orphaned";
  }

  private stopWatcher(): void {
    if (this.watcher) clearInterval(this.watcher);
    this.watcher = undefined;
  }

  private async persistOwnership(session: OwnedSession): Promise<void> {
    if (!this.ownershipStore) return;
    const state: PersistedOwnedSession = {
      version: 1,
      packageFullName: session.packageInfo.fullName,
      packageFamilyName: session.packageInfo.familyName,
      executablePath: session.packageInfo.executablePath,
      pid: session.pid,
      startedAt: session.startedAt,
      nonce: session.nonce,
      port: session.port,
      browserId: session.browserId,
      targetId: session.targetId,
      selectorProfile: session.selectorProfile,
      themeLibraryId: session.themeLibraryId,
      themeFingerprint: session.themeFingerprint,
      createdAt: new Date().toISOString(),
    };
    this.ownershipStore.writeFileAtomic(
      MANAGED_FILES.ownership,
      Buffer.from(JSON.stringify(state), "utf8"),
    );
  }

  private async removeOwnershipState(): Promise<void> {
    if (!this.ownershipStore) return;
    this.ownershipStore.removeFile(MANAGED_FILES.ownership);
  }

  private fail(state: SessionState, messageKey: string, code: string): never {
    this.state = state;
    this.messageKey = messageKey;
    throw new Error(code);
  }
}

function imageDataUrl(theme: ThemeRecord, image: Buffer): string {
  if (
    !theme.backgroundMime ||
    !theme.backgroundSha256 ||
    !Number.isSafeInteger(theme.backgroundBytes) ||
    image.byteLength !== theme.backgroundBytes ||
    !["image/png", "image/jpeg", "image/webp"].includes(theme.backgroundMime) ||
    createHash("sha256").update(image).digest("hex") !== theme.backgroundSha256
  )
    throw new Error("UNSAFE_IMAGE:image-payload");
  return `data:${theme.backgroundMime};base64,${image.toString("base64")}`;
}

function runtimeValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const outer = value as Record<string, unknown>;
  if (
    !outer.result ||
    typeof outer.result !== "object" ||
    Array.isArray(outer.result)
  )
    return undefined;
  return (outer.result as Record<string, unknown>).value;
}

function scriptIdentifier(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const identifier = (value as Record<string, unknown>).identifier;
  return typeof identifier === "string" &&
    /^[A-Za-z0-9._-]{1,200}$/u.test(identifier)
    ? identifier
    : undefined;
}

function hasNonce(commandLine: string | undefined, nonce: string): boolean {
  return Boolean(
    commandLine &&
      new RegExp(`(?:^|\\s)--codexstyle-launch=${nonce}(?=\\s|$)`, "u").test(
        commandLine,
      ),
  );
}

function isIdentityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("TARGET_IDENTITY_MISMATCH")
  );
}

function isTargetError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("TARGET_") || error.message.startsWith("CDP_"))
  );
}

function verificationFailureMessageKey(error: unknown): string {
  if (!(error instanceof Error)) return "session.identityMismatch";
  if (error.message.startsWith("CDP_")) return "session.cdpUnavailable";
  if (error.message.startsWith("TARGET_INCOMPATIBLE"))
    return "session.targetIncompatible";
  return "session.identityMismatch";
}

function samePath(left: string, right: string): boolean {
  return (
    left.replaceAll("/", "\\").toLowerCase() ===
    right.replaceAll("/", "\\").toLowerCase()
  );
}

async function reservePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        const port = typeof address === "object" && address ? address.port : 0;
        if (!Number.isInteger(port) || port < 1)
          reject(new Error("CDP_UNAVAILABLE:port"));
        else resolve(port);
      });
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readOwnershipState(
  store: SecureManagedStore,
): PersistedOwnedSession | undefined {
  const bytes = store.readFile(MANAGED_FILES.ownership);
  if (!bytes) return undefined;
  if (bytes.byteLength > 64 * 1024)
    throw new Error("STORE_TAMPERED:ownership-state");
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!isPersistedOwnedSession(value)) throw new Error("invalid");
    return value;
  } catch {
    throw new Error("STORE_TAMPERED:ownership-state");
  }
}

function isPersistedOwnedSession(
  value: unknown,
): value is PersistedOwnedSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  const nonce = state.nonce;
  const fingerprint = state.themeFingerprint;
  return (
    state.version === 1 &&
    typeof state.packageFullName === "string" &&
    typeof state.packageFamilyName === "string" &&
    typeof state.executablePath === "string" &&
    Number.isInteger(state.pid) &&
    typeof state.startedAt === "string" &&
    typeof nonce === "string" &&
    /^[a-f0-9]{64}$/u.test(nonce) &&
    Number.isInteger(state.port) &&
    typeof state.browserId === "string" &&
    typeof state.targetId === "string" &&
    isPersistedSelectorProfile(state.selectorProfile) &&
    typeof state.themeLibraryId === "string" &&
    typeof fingerprint === "string" &&
    /^[a-f0-9]{64}$/u.test(fingerprint) &&
    typeof state.createdAt === "string"
  );
}

function isPersistedSelectorProfile(
  value: unknown,
): value is PersistedSelectorProfile {
  return (
    typeof value === "string" &&
    PERSISTED_SELECTOR_PROFILES.has(value as PersistedSelectorProfile)
  );
}
