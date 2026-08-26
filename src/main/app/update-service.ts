import type { UpdateSnapshot } from "../../contracts";

export interface ReleaseInfo {
  version: string;
  url: string;
}

export interface UpdateGateway {
  fetchLatest(): Promise<ReleaseInfo>;
  openRelease(url: string): Promise<void>;
}

export class UpdateService {
  private state: UpdateSnapshot;
  private pendingCheck?: Promise<UpdateSnapshot>;

  constructor(
    currentVersion: string,
    private readonly gateway: UpdateGateway,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!parseVersion(currentVersion))
      throw new Error("UPDATE_CHECK_FAILED:current-version");
    this.state = {
      configured: true,
      status: "idle",
      currentVersion,
    };
  }

  snapshot(): UpdateSnapshot {
    return { ...this.state };
  }

  check(): Promise<UpdateSnapshot> {
    if (this.pendingCheck) return this.pendingCheck;
    const pending = this.performCheck().finally(() => {
      if (this.pendingCheck === pending) this.pendingCheck = undefined;
    });
    this.pendingCheck = pending;
    return pending;
  }

  async openAvailableRelease(): Promise<UpdateSnapshot> {
    if (this.state.status !== "available" || !this.state.releaseUrl)
      throw new Error("UPDATE_OPEN_FAILED:not-available");
    await this.gateway.openRelease(this.state.releaseUrl);
    return this.snapshot();
  }

  private async performCheck(): Promise<UpdateSnapshot> {
    const checkedAt = this.now().toISOString();
    try {
      const latest = await this.gateway.fetchLatest();
      const comparison = compareVersions(
        latest.version,
        this.state.currentVersion,
      );
      this.state = {
        configured: true,
        status: comparison > 0 ? "available" : "current",
        currentVersion: this.state.currentVersion,
        latestVersion: latest.version,
        releaseUrl: comparison > 0 ? latest.url : undefined,
        checkedAt,
      };
      return this.snapshot();
    } catch (error) {
      this.state = {
        configured: true,
        status: "error",
        currentVersion: this.state.currentVersion,
        checkedAt,
      };
      throw error;
    }
  }
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts)
    throw new Error("UPDATE_CHECK_FAILED:version-format");
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function parseVersion(value: string): [number, number, number] | undefined {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value);
  if (!match) return undefined;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger)
    ? (parts as [number, number, number])
    : undefined;
}
