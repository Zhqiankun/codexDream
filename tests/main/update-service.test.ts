import { describe, expect, it, vi } from "vitest";
import {
  compareVersions,
  UpdateService,
  type DownloadProgress,
  type ReleaseInfo,
  type UpdateGateway,
} from "../../src/main/app/update-service";

describe("UpdateService", () => {
  it("checks availability without downloading and lets a manual request download the known release", async () => {
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    const service = new UpdateService("1.0.0", gateway);

    await expect(service.checkAvailability()).resolves.toMatchObject({
      status: "available",
      latestVersion: "1.2.0",
    });
    expect(gateway.download).not.toHaveBeenCalled();

    await expect(service.checkAndDownload()).resolves.toMatchObject({
      status: "downloaded",
      latestVersion: "1.2.0",
    });
    expect(gateway.fetchLatest).toHaveBeenCalledOnce();
    expect(gateway.download).toHaveBeenCalledOnce();
  });

  it("checks, downloads, reports bounded progress, and opens the fixed release", async () => {
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.download.mockImplementation(async (onProgress) => {
      onProgress({
        percent: 48.6,
        transferredBytes: 512,
        totalBytes: 1024,
        bytesPerSecond: 2048,
      });
    });
    const changed = vi.fn();
    const service = new UpdateService(
      "1.0.0",
      gateway,
      () => new Date("2026-08-27T08:00:00.000Z"),
      changed,
    );

    await expect(service.checkAndDownload()).resolves.toEqual({
      configured: true,
      status: "downloaded",
      currentVersion: "1.0.0",
      latestVersion: "1.2.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
      checkedAt: "2026-08-27T08:00:00.000Z",
    });
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "downloading",
        progress: {
          percent: 49,
          transferredBytes: 512,
          totalBytes: 1024,
          bytesPerSecond: 2048,
        },
      }),
    );
    await service.openAvailableRelease();
    expect(gateway.openRelease).toHaveBeenCalledWith(
      "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    );
  });

  it("treats the same or an older release as current without downloading", async () => {
    for (const version of ["1.0.0", "0.9.9"]) {
      const gateway = gatewayFixture({
        version,
        url: `https://github.com/Zhqiankun/codexDream/releases/tag/v${version}`,
      });
      const service = new UpdateService("1.0.0", gateway);

      await expect(service.checkAndDownload()).resolves.toMatchObject({
        status: "current",
        latestVersion: version,
      });
      expect(gateway.download).not.toHaveBeenCalled();
      await service.openAvailableRelease();
      expect(gateway.openRelease).toHaveBeenCalledWith(
        "https://github.com/Zhqiankun/codexDream/releases/latest",
      );
    }
  });

  it("deduplicates concurrent requests and records check failures", async () => {
    let rejectLatest!: (error: Error) => void;
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.fetchLatest.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectLatest = reject;
        }),
    );
    const service = new UpdateService("1.0.0", gateway);

    const first = service.checkAndDownload();
    const second = service.checkAndDownload();
    rejectLatest(new Error("offline"));

    await expect(first).rejects.toThrow("offline");
    await expect(second).rejects.toThrow("offline");
    expect(gateway.fetchLatest).toHaveBeenCalledOnce();
    expect(service.snapshot()).toMatchObject({
      status: "error",
      errorPhase: "check",
    });
  });

  it("deduplicates concurrent availability checks", async () => {
    let resolveLatest!: (release: ReleaseInfo) => void;
    const release = {
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    };
    const gateway = gatewayFixture(release);
    gateway.fetchLatest.mockImplementation(
      () =>
        new Promise<ReleaseInfo>((resolve) => {
          resolveLatest = resolve;
        }),
    );
    const service = new UpdateService("1.0.0", gateway);

    const first = service.checkAvailability();
    const second = service.checkAvailability();
    expect(second).toBe(first);
    resolveLatest(release);

    await expect(first).resolves.toMatchObject({ status: "available" });
    await expect(second).resolves.toMatchObject({ status: "available" });
    expect(gateway.fetchLatest).toHaveBeenCalledOnce();
    expect(gateway.download).not.toHaveBeenCalled();
  });

  it("shares an active background check with a manual download request", async () => {
    let resolveLatest!: (release: ReleaseInfo) => void;
    const release = {
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    };
    const gateway = gatewayFixture(release);
    gateway.fetchLatest.mockImplementation(
      () =>
        new Promise<ReleaseInfo>((resolve) => {
          resolveLatest = resolve;
        }),
    );
    const service = new UpdateService("1.0.0", gateway);

    const background = service.checkAvailability();
    const manual = service.checkAndDownload();
    resolveLatest(release);

    await expect(background).resolves.toMatchObject({ status: "available" });
    await expect(manual).resolves.toMatchObject({ status: "downloaded" });
    expect(gateway.fetchLatest).toHaveBeenCalledOnce();
    expect(gateway.download).toHaveBeenCalledOnce();
  });

  it("restores the last stable state when a background check fails", async () => {
    const gateway = gatewayFixture({
      version: "1.0.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.0.0",
    });
    const changed = vi.fn();
    const service = new UpdateService(
      "1.0.0",
      gateway,
      () => new Date("2026-08-27T08:00:00.000Z"),
      changed,
    );
    await service.checkAvailability();
    const stable = service.snapshot();
    changed.mockClear();
    gateway.fetchLatest.mockRejectedValueOnce(new Error("offline"));

    await expect(service.checkAvailability()).rejects.toThrow("offline");
    expect(service.snapshot()).toEqual(stable);
    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps manual check failures in the existing error state when joining a background check", async () => {
    let rejectLatest!: (error: Error) => void;
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.fetchLatest.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectLatest = reject;
        }),
    );
    const service = new UpdateService("1.0.0", gateway);

    const background = service.checkAvailability();
    const manual = service.checkAndDownload();
    rejectLatest(new Error("offline"));

    await expect(background).rejects.toThrow("offline");
    await expect(manual).rejects.toThrow("offline");
    expect(service.snapshot()).toMatchObject({
      status: "error",
      errorPhase: "check",
    });
    expect(gateway.fetchLatest).toHaveBeenCalledOnce();
  });

  it("skips availability checks during protected download and install states", async () => {
    let resolveDownload!: () => void;
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.download.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const service = new UpdateService("1.0.0", gateway);

    const download = service.checkAndDownload();
    await vi.waitFor(() =>
      expect(service.snapshot().status).toBe("downloading"),
    );
    await expect(service.checkAvailability()).resolves.toMatchObject({
      status: "downloading",
    });
    resolveDownload();
    await download;

    await expect(service.checkAvailability()).resolves.toMatchObject({
      status: "downloaded",
    });
    service.scheduleInstallOnQuit();
    await expect(service.checkAvailability()).resolves.toMatchObject({
      status: "scheduled",
    });
    service.cancel();
    service.installNow();
    await expect(service.checkAvailability()).resolves.toMatchObject({
      status: "installing",
    });
    expect(gateway.fetchLatest).toHaveBeenCalledOnce();
  });

  it("returns to available when a user cancels an active download", async () => {
    let rejectDownload!: (error: Error) => void;
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.download.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    const service = new UpdateService("1.0.0", gateway);

    const request = service.checkAndDownload();
    await vi.waitFor(() =>
      expect(service.snapshot().status).toBe("downloading"),
    );
    expect(service.cancel()).toMatchObject({ status: "available" });
    rejectDownload(new Error("cancelled"));

    await expect(request).resolves.toMatchObject({ status: "available" });
    expect(gateway.cancelDownload).toHaveBeenCalledOnce();
  });

  it("records download failures without exposing infrastructure details", async () => {
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.download.mockRejectedValue(new Error("C:\\private\\cache.exe"));
    const service = new UpdateService("1.0.0", gateway);

    await expect(service.checkAndDownload()).rejects.toThrow("cache.exe");
    expect(service.snapshot()).toEqual({
      configured: true,
      status: "error",
      currentVersion: "1.0.0",
      latestVersion: "1.2.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
      checkedAt: expect.any(String),
      errorPhase: "download",
    });
  });

  it("records malformed release versions as check failures", async () => {
    const gateway = gatewayFixture({
      version: "999999999999999999999.0.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/latest",
    });
    const service = new UpdateService("1.0.0", gateway);

    await expect(service.checkAndDownload()).rejects.toThrow(
      "UPDATE_CHECK_FAILED",
    );
    expect(service.snapshot()).toMatchObject({
      status: "error",
      errorPhase: "check",
    });
  });

  it("requires a verified download before scheduling or installing", async () => {
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    const service = new UpdateService("1.0.0", gateway);

    expect(() => service.installNow()).toThrow("not-downloaded");
    expect(() => service.scheduleInstallOnQuit()).toThrow("not-downloaded");
    await service.checkAndDownload();

    expect(service.scheduleInstallOnQuit()).toMatchObject({
      status: "scheduled",
      installOnQuit: true,
    });
    expect(service.shouldInstallOnQuit()).toBe(true);
    const checksBefore = gateway.fetchLatest.mock.calls.length;
    await expect(service.checkAndDownload()).resolves.toMatchObject({
      status: "scheduled",
      installOnQuit: true,
    });
    expect(gateway.fetchLatest).toHaveBeenCalledTimes(checksBefore);
    expect(service.cancel()).toMatchObject({
      status: "downloaded",
      installOnQuit: false,
    });
    expect(service.installNow()).toMatchObject({ status: "installing" });
    expect(gateway.install).toHaveBeenCalledOnce();
    expect(() => service.installNow()).toThrow("not-downloaded");
  });

  it("fails closed when auto-update is unavailable", async () => {
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.supported = false;
    const service = new UpdateService("1.0.0", gateway);

    expect(service.snapshot()).toEqual({
      configured: false,
      status: "unsupported",
      currentVersion: "1.0.0",
    });
    await expect(service.checkAndDownload()).rejects.toThrow(
      "UPDATE_UNSUPPORTED",
    );
    expect(gateway.fetchLatest).not.toHaveBeenCalled();
  });

  it("allows a verified cached installer to retry after a startup failure", async () => {
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    gateway.install
      .mockImplementationOnce(() => {
        throw new Error("spawn failed");
      })
      .mockImplementationOnce(() => undefined);
    const service = new UpdateService("1.0.0", gateway);
    await service.checkAndDownload();

    expect(() => service.installNow()).toThrow("spawn failed");
    expect(service.snapshot()).toMatchObject({
      status: "error",
      errorPhase: "install",
    });
    expect(service.installNow()).toMatchObject({ status: "installing" });
    expect(gateway.install).toHaveBeenCalledTimes(2);
  });

  it("compares semantic version components numerically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("v2.0.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(() => compareVersions("latest", "1.0.0")).toThrow(
      "UPDATE_CHECK_FAILED",
    );
  });
});

type GatewayFixture = UpdateGateway & {
  supported: boolean;
  fetchLatest: ReturnType<typeof vi.fn<() => Promise<ReleaseInfo>>>;
  download: ReturnType<
    typeof vi.fn<
      (onProgress: (progress: DownloadProgress) => void) => Promise<void>
    >
  >;
  cancelDownload: ReturnType<typeof vi.fn<() => void>>;
  install: ReturnType<typeof vi.fn<() => void>>;
  openRelease: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>;
};

function gatewayFixture(release: ReleaseInfo): GatewayFixture {
  return {
    supported: true,
    fallbackUrl: "https://github.com/Zhqiankun/codexDream/releases/latest",
    fetchLatest: vi.fn<() => Promise<ReleaseInfo>>().mockResolvedValue(release),
    download: vi
      .fn<(onProgress: (progress: DownloadProgress) => void) => Promise<void>>()
      .mockResolvedValue(),
    cancelDownload: vi.fn<() => void>(),
    install: vi.fn<() => void>(),
    openRelease: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(),
  };
}
