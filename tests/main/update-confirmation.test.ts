import { describe, expect, it, vi } from "vitest";
import {
  UpdateService,
  type ReleaseInfo,
} from "../../src/main/app/update-service";

const firstRelease: ReleaseInfo = {
  version: "1.2.0",
  url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
  releaseNotes: "本次更新说明",
  releaseDate: "2026-11-02T08:00:00.000Z",
};

describe("update confirmation", () => {
  it("checks without downloading and revalidates a main-issued confirmation before download", async () => {
    const { service, gateway } = fixture();
    const candidate = await service.checkForUpdates();
    expect(candidate.confirmationId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
    );
    expect(gateway.download).not.toHaveBeenCalled();
    const repeated = await service.checkForUpdates();
    expect(repeated.confirmationId).toBe(candidate.confirmationId);

    const downloaded = await service.checkAndDownload(
      candidate.confirmationId!,
    );
    expect(downloaded).toMatchObject({
      status: "downloaded",
      confirmationId: candidate.confirmationId,
      releaseNotes: firstRelease.releaseNotes,
      releaseDate: firstRelease.releaseDate,
    });
    expect(gateway.fetchLatest).toHaveBeenCalledTimes(3);
    expect(gateway.download).toHaveBeenCalledOnce();
  });

  it("returns a new candidate instead of downloading when the checked version changed", async () => {
    const { service, gateway } = fixture();
    const shown = await service.checkForUpdates();
    gateway.fetchLatest.mockResolvedValue({
      ...firstRelease,
      version: "1.3.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.3.0",
      releaseNotes: "另一版本说明",
    });

    const next = await service.checkAndDownload(shown.confirmationId!);
    expect(next).toMatchObject({
      status: "available",
      latestVersion: "1.3.0",
      releaseNotes: "另一版本说明",
    });
    expect(next.confirmationId).not.toBe(shown.confirmationId);
    expect(gateway.download).not.toHaveBeenCalled();
    await expect(
      service.checkAndDownload(next.confirmationId!),
    ).resolves.toMatchObject({ status: "downloaded", latestVersion: "1.3.0" });
  });

  it("never downloads for an unknown confirmation even after a valid fresh check", async () => {
    const { service, gateway } = fixture();
    await service.checkForUpdates();
    await expect(
      service.checkAndDownload("11111111-1111-4111-8111-111111111111"),
    ).resolves.toMatchObject({ status: "available" });
    expect(gateway.download).not.toHaveBeenCalled();
  });

  it("locks the download slot while joining a background check so metadata cannot race", async () => {
    const { service, gateway } = fixture();
    const shown = await service.checkForUpdates();
    let finishCheck!: (release: ReleaseInfo) => void;
    gateway.fetchLatest.mockImplementationOnce(
      () => new Promise((resolve) => (finishCheck = resolve)),
    );
    const background = service.checkAvailability();
    const first = service.checkAndDownload(shown.confirmationId!);
    const duplicate = service.checkAndDownload(shown.confirmationId!);
    const anotherBackground = service.checkAvailability();
    expect(duplicate).toBe(first);
    expect(anotherBackground).toBe(first);
    expect(gateway.fetchLatest).toHaveBeenCalledTimes(2);

    finishCheck({ ...firstRelease, version: "1.3.0" });
    await background;
    const result = await first;
    expect(result).toMatchObject({
      status: "available",
      latestVersion: "1.3.0",
    });
    expect(gateway.download).not.toHaveBeenCalled();
  });

  it("does not download stale available data when the final metadata check fails", async () => {
    const { service, gateway } = fixture();
    const candidate = await service.checkForUpdates();
    gateway.fetchLatest.mockRejectedValue(new Error("offline"));
    await expect(
      service.checkAndDownload(candidate.confirmationId!),
    ).rejects.toThrow("offline");
    expect(gateway.download).not.toHaveBeenCalled();
    expect(service.snapshot()).toMatchObject({
      status: "error",
      errorPhase: "check",
    });
  });

  it("keeps already displayed details while rechecking and after a failed confirmation check", async () => {
    const { service, gateway } = fixture();
    const shown = await service.checkForUpdates();
    let rejectCheck!: (reason: Error) => void;
    gateway.fetchLatest.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectCheck = reject)),
    );
    const downloading = service.checkAndDownload(shown.confirmationId!);
    const failure = expect(downloading).rejects.toThrow("offline");
    await vi.waitFor(() => expect(service.snapshot().status).toBe("checking"));
    const details = {
      confirmationId: shown.confirmationId,
      latestVersion: shown.latestVersion,
      releaseNotes: shown.releaseNotes,
      releaseDate: shown.releaseDate,
    };
    expect(service.snapshot()).toMatchObject(details);
    rejectCheck(new Error("offline"));
    await failure;
    expect(service.snapshot()).toMatchObject({ ...details, status: "error" });
    expect(gateway.download).not.toHaveBeenCalled();
  });

  it("retains release details and confirmation when a download is cancelled", async () => {
    const { service, gateway } = fixture();
    const candidate = await service.checkForUpdates();
    let finishDownload!: () => void;
    gateway.download.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishDownload = resolve)),
    );
    const downloading = service.checkAndDownload(candidate.confirmationId!);
    await vi.waitFor(() =>
      expect(service.snapshot().status).toBe("downloading"),
    );
    expect(service.cancel()).toMatchObject({
      status: "available",
      confirmationId: candidate.confirmationId,
      releaseNotes: firstRelease.releaseNotes,
      releaseDate: firstRelease.releaseDate,
    });
    finishDownload();
    await expect(downloading).resolves.toMatchObject({ status: "available" });
  });
});

function fixture() {
  const gateway = {
    supported: true,
    fallbackUrl: "https://github.com/Zhqiankun/codexDream/releases/latest",
    fetchLatest: vi
      .fn<() => Promise<ReleaseInfo>>()
      .mockResolvedValue(firstRelease),
    download: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    cancelDownload: vi.fn(),
    install: vi.fn(),
    openRelease: vi.fn().mockResolvedValue(undefined),
  };
  return { gateway, service: new UpdateService("1.0.0", gateway) };
}
