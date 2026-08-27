import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }));

vi.mock("electron", () => ({
  app: { isPackaged: false },
  shell: { openExternal },
}));

import {
  ElectronUpdaterGateway,
  INSTALL_MARKER_CONTENT,
  INSTALL_MARKER_NAME,
  isInstalledWindowsBuild,
} from "../../src/main/infra/electron-updater-gateway";

describe("ElectronUpdaterGateway", () => {
  afterEach(() => vi.clearAllMocks());

  it("configures the updater explicitly and returns a fixed stable release", async () => {
    const fixture = updaterFixture("1.2.0");
    const gateway = new ElectronUpdaterGateway({
      supported: true,
      loadUpdater: fixture.load,
    });

    await expect(gateway.fetchLatest()).resolves.toEqual({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    expect(fixture.updater.setFeedURL).toHaveBeenCalledWith({
      provider: "generic",
      url: "https://github.com/Zhqiankun/codexDream/releases/latest/download/",
      channel: "latest",
      useMultipleRangeRequest: false,
    });
    expect(fixture.updater).toMatchObject({
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: false,
      allowDowngrade: false,
      disableWebInstaller: true,
      disableDifferentialDownload: false,
    });
  });

  it("forwards safe progress, supports cancellation, and installs visibly", async () => {
    const fixture = updaterFixture("1.2.0");
    const gateway = new ElectronUpdaterGateway({
      supported: true,
      loadUpdater: fixture.load,
    });
    await gateway.fetchLatest();
    fixture.updater.downloadUpdate.mockImplementation(async (token) => {
      fixture.updater.emit("download-progress", {
        percent: 25,
        transferred: 256,
        total: 1024,
        bytesPerSecond: 512,
      });
      expect(token).toBeInstanceOf(FakeCancellationToken);
      gateway.cancelDownload();
      expect(token.cancelled).toBe(true);
      return [];
    });
    const progress = vi.fn();

    await gateway.download(progress);
    gateway.install();

    expect(progress).toHaveBeenCalledWith({
      percent: 25,
      transferredBytes: 256,
      totalBytes: 1024,
      bytesPerSecond: 512,
    });
    expect(fixture.updater.listenerCount("download-progress")).toBe(0);
    expect(fixture.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("honors cancellation requested before the updater token exists", async () => {
    const fixture = updaterFixture("1.2.0");
    let resolveModule!: (value: unknown) => void;
    const loading = new Promise((resolve) => {
      resolveModule = resolve;
    });
    const gateway = new ElectronUpdaterGateway({
      supported: true,
      loadUpdater: vi.fn(() => loading) as never,
    });
    let receivedToken: FakeCancellationToken | undefined;
    fixture.updater.downloadUpdate.mockImplementation(async (token) => {
      receivedToken = token as FakeCancellationToken;
      return [];
    });

    const download = gateway.download(vi.fn());
    gateway.cancelDownload();
    resolveModule({
      autoUpdater: fixture.updater,
      CancellationToken: FakeCancellationToken,
    });
    await download;

    expect(receivedToken?.cancelled).toBe(true);
  });

  it("opens only the fixed repository release URL", async () => {
    const fixture = updaterFixture("1.2.0");
    const gateway = new ElectronUpdaterGateway({
      supported: true,
      loadUpdater: fixture.load,
    });

    await gateway.openRelease(
      "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    );
    await gateway.openRelease(
      "https://github.com/Zhqiankun/codexDream/releases/latest",
    );
    await expect(
      gateway.openRelease("https://example.com/releases/tag/v1.2.0"),
    ).rejects.toThrow("UPDATE_OPEN_FAILED");
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it("rejects a manifest that redirects the installer outside the fixed release", async () => {
    const fixture = updaterFixture("1.2.0");
    fixture.updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: {
        version: "1.2.0",
        files: [
          {
            url: "https://example.com/update.exe",
            sha512: Buffer.alloc(64, 1).toString("base64"),
            size: 2 * 1024 * 1024,
          },
        ],
      },
    });
    const gateway = new ElectronUpdaterGateway({
      supported: true,
      loadUpdater: fixture.load,
    });

    await expect(gateway.fetchLatest()).rejects.toThrow(
      "UPDATE_CHECK_FAILED:release-file",
    );
  });
});

describe("installed build detection", () => {
  it("requires a packaged Windows executable with the exact NSIS marker", () => {
    const directory = mkdtempSync(join(tmpdir(), "codexstyle-updater-"));
    const executable = join(directory, "CodexStyle.exe");
    try {
      expect(isInstalledWindowsBuild(true, "win32", executable)).toBe(false);
      writeFileSync(
        join(directory, INSTALL_MARKER_NAME),
        `${INSTALL_MARKER_CONTENT}\r\n`,
      );
      expect(isInstalledWindowsBuild(true, "win32", executable)).toBe(true);
      expect(isInstalledWindowsBuild(false, "win32", executable)).toBe(false);
      expect(isInstalledWindowsBuild(true, "linux", executable)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

class FakeCancellationToken {
  cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }
}

function updaterFixture(version: string) {
  const sha512 = Buffer.alloc(64, 1).toString("base64");
  const updateInfo = {
    version,
    files: [
      {
        url: `https://github.com/Zhqiankun/codexDream/releases/download/v${version}/CodexStyle-${version}-x64.exe`,
        sha512,
        size: 2 * 1024 * 1024,
      },
    ],
    path: `https://github.com/Zhqiankun/codexDream/releases/download/v${version}/CodexStyle-${version}-x64.exe`,
    sha512,
  };
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    disableWebInstaller: false,
    disableDifferentialDownload: true,
    previousBlockmapBaseUrlOverride: null as string | null,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo,
      versionInfo: updateInfo,
    }),
    downloadUpdate: vi.fn().mockResolvedValue([]),
    quitAndInstall: vi.fn(),
  });
  return {
    updater,
    load: vi.fn().mockResolvedValue({
      autoUpdater: updater,
      CancellationToken: FakeCancellationToken,
    }) as never,
  };
}
