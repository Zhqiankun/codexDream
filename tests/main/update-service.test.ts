import { describe, expect, it, vi } from "vitest";
import {
  compareVersions,
  UpdateService,
  type UpdateGateway,
} from "../../src/main/app/update-service";

describe("UpdateService", () => {
  it("reports a newer stable release and opens only its verified URL", async () => {
    const gateway = gatewayFixture({
      version: "1.2.0",
      url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    });
    const service = new UpdateService(
      "1.0.0",
      gateway,
      () => new Date("2026-08-26T08:00:00.000Z"),
    );

    await expect(service.check()).resolves.toEqual({
      configured: true,
      status: "available",
      currentVersion: "1.0.0",
      latestVersion: "1.2.0",
      releaseUrl: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
      checkedAt: "2026-08-26T08:00:00.000Z",
    });
    await service.openAvailableRelease();

    expect(gateway.openRelease).toHaveBeenCalledWith(
      "https://github.com/Zhqiankun/codexDream/releases/tag/v1.2.0",
    );
  });

  it("treats the same or an older release as current", async () => {
    const same = new UpdateService(
      "1.0.0",
      gatewayFixture({
        version: "1.0.0",
        url: "https://github.com/Zhqiankun/codexDream/releases/tag/v1.0.0",
      }),
    );
    const older = new UpdateService(
      "1.0.0",
      gatewayFixture({
        version: "0.9.9",
        url: "https://github.com/Zhqiankun/codexDream/releases/tag/v0.9.9",
      }),
    );

    await expect(same.check()).resolves.toMatchObject({ status: "current" });
    await expect(older.check()).resolves.toMatchObject({ status: "current" });
    await expect(same.openAvailableRelease()).rejects.toThrow(
      "UPDATE_OPEN_FAILED",
    );
  });

  it("deduplicates concurrent manual checks and records a fail-closed error", async () => {
    let rejectLatest!: (error: Error) => void;
    const fetchLatest = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectLatest = reject;
        }),
    );
    const service = new UpdateService("1.0.0", {
      fetchLatest,
      openRelease: vi.fn(),
    });

    const first = service.check();
    const second = service.check();
    rejectLatest(new Error("offline"));

    await expect(first).rejects.toThrow("offline");
    await expect(second).rejects.toThrow("offline");
    expect(fetchLatest).toHaveBeenCalledOnce();
    expect(service.snapshot()).toMatchObject({
      status: "error",
      currentVersion: "1.0.0",
    });
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

function gatewayFixture(release: { version: string; url: string }) {
  return {
    fetchLatest: vi
      .fn<UpdateGateway["fetchLatest"]>()
      .mockResolvedValue(release),
    openRelease: vi.fn<UpdateGateway["openRelease"]>().mockResolvedValue(),
  };
}
