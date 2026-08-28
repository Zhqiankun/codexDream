import type { UpdateProgress, UpdateSnapshot } from "../../contracts";

export interface ReleaseInfo {
  version: string;
  url: string;
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
}

/** Infrastructure port for the fixed CodexStyle update source. */
export interface UpdateGateway {
  readonly supported: boolean;
  readonly fallbackUrl: string;
  fetchLatest(): Promise<ReleaseInfo>;
  download(onProgress: (progress: DownloadProgress) => void): Promise<void>;
  cancelDownload(): void;
  install(): void;
  openRelease(url: string): Promise<void>;
}

export class UpdateService {
  private state: UpdateSnapshot;
  private pendingCheck?: Promise<UpdateSnapshot>;
  private pendingDownload?: Promise<UpdateSnapshot>;
  private cancelRequested = false;

  constructor(
    currentVersion: string,
    private readonly gateway: UpdateGateway,
    private readonly now: () => Date = () => new Date(),
    private readonly onChanged: (snapshot: UpdateSnapshot) => void = () => {},
  ) {
    if (!parseVersion(currentVersion))
      throw new Error("UPDATE_CHECK_FAILED:current-version");
    this.state = {
      configured: gateway.supported,
      status: gateway.supported ? "idle" : "unsupported",
      currentVersion,
    };
  }

  snapshot(): UpdateSnapshot {
    return cloneSnapshot(this.state);
  }

  checkAvailability(): Promise<UpdateSnapshot> {
    if (!this.gateway.supported)
      return Promise.reject(new Error("UPDATE_UNSUPPORTED"));
    if (this.shouldSkipAvailabilityCheck())
      return Promise.resolve(this.snapshot());
    if (this.pendingDownload) return this.pendingDownload;
    if (this.pendingCheck) return this.pendingCheck;
    return this.startCheck(true);
  }

  checkAndDownload(): Promise<UpdateSnapshot> {
    if (!this.gateway.supported)
      return Promise.reject(new Error("UPDATE_UNSUPPORTED"));
    if (
      this.state.status === "downloaded" ||
      this.state.status === "scheduled" ||
      this.state.status === "installing" ||
      (this.state.status === "error" && this.state.errorPhase === "install")
    )
      return Promise.resolve(this.snapshot());
    if (this.pendingDownload) return this.pendingDownload;

    const joinedBackgroundCheck = this.pendingCheck !== undefined;
    const check =
      this.state.status === "available"
        ? Promise.resolve(this.snapshot())
        : (this.pendingCheck ?? this.startCheck(false));
    const pending = check
      .catch((error: unknown) => {
        if (joinedBackgroundCheck) this.recordManualCheckFailure();
        throw error;
      })
      .then((snapshot) =>
        snapshot.status === "available"
          ? this.performDownload(snapshot)
          : snapshot,
      )
      .finally(() => {
        if (this.pendingDownload === pending) this.pendingDownload = undefined;
      });
    this.pendingDownload = pending;
    return pending;
  }

  private startCheck(
    preserveStableStateOnFailure: boolean,
  ): Promise<UpdateSnapshot> {
    const pending = this.performCheck(preserveStableStateOnFailure).finally(
      () => {
        if (this.pendingCheck === pending) this.pendingCheck = undefined;
      },
    );
    this.pendingCheck = pending;
    return pending;
  }

  cancel(): UpdateSnapshot {
    if (this.state.status === "scheduled") {
      this.setState({
        ...this.state,
        status: "downloaded",
        installOnQuit: false,
      });
      return this.snapshot();
    }
    if (this.state.status !== "downloading") return this.snapshot();
    this.cancelRequested = true;
    this.gateway.cancelDownload();
    this.setState({
      configured: true,
      status: "available",
      currentVersion: this.state.currentVersion,
      latestVersion: this.state.latestVersion,
      releaseUrl: this.state.releaseUrl,
      checkedAt: this.state.checkedAt,
    });
    return this.snapshot();
  }

  scheduleInstallOnQuit(): UpdateSnapshot {
    if (!this.hasDownloadedUpdate())
      throw new Error("UPDATE_INSTALL_FAILED:not-downloaded");
    this.setState({
      ...this.state,
      status: "scheduled",
      installOnQuit: true,
      progress: undefined,
    });
    return this.snapshot();
  }

  shouldInstallOnQuit(): boolean {
    return (
      this.state.status === "scheduled" && this.state.installOnQuit === true
    );
  }

  installNow(): UpdateSnapshot {
    if (!this.hasDownloadedUpdate())
      throw new Error("UPDATE_INSTALL_FAILED:not-downloaded");
    const installing: UpdateSnapshot = {
      ...this.state,
      status: "installing",
      installOnQuit: false,
      progress: undefined,
      errorPhase: undefined,
    };
    this.setState(installing);
    try {
      this.gateway.install();
      return this.snapshot();
    } catch (error) {
      this.setState({
        ...installing,
        status: "error",
        errorPhase: "install",
      });
      throw error;
    }
  }

  async openAvailableRelease(): Promise<UpdateSnapshot> {
    await this.gateway.openRelease(
      this.state.releaseUrl ?? this.gateway.fallbackUrl,
    );
    return this.snapshot();
  }

  private async performCheck(
    preserveStableStateOnFailure: boolean,
  ): Promise<UpdateSnapshot> {
    const checkedAt = this.now().toISOString();
    if (!preserveStableStateOnFailure)
      this.setState({
        configured: true,
        status: "checking",
        currentVersion: this.state.currentVersion,
        checkedAt,
      });

    let latest: ReleaseInfo;
    try {
      latest = await this.gateway.fetchLatest();
    } catch (error) {
      this.recordCheckFailure(checkedAt, preserveStableStateOnFailure);
      throw error;
    }

    let comparison: number;
    try {
      comparison = compareVersions(latest.version, this.state.currentVersion);
    } catch (error) {
      this.recordCheckFailure(checkedAt, preserveStableStateOnFailure);
      throw error;
    }
    if (comparison <= 0) {
      this.setState({
        configured: true,
        status: "current",
        currentVersion: this.state.currentVersion,
        latestVersion: latest.version,
        checkedAt,
      });
      return this.snapshot();
    }

    const available: UpdateSnapshot = {
      configured: true,
      status: "available",
      currentVersion: this.state.currentVersion,
      latestVersion: latest.version,
      releaseUrl: latest.url,
      checkedAt,
    };
    this.setState(available);
    return this.snapshot();
  }

  private async performDownload(
    available: UpdateSnapshot,
  ): Promise<UpdateSnapshot> {
    this.cancelRequested = false;
    this.setState({
      ...available,
      status: "downloading",
      progress: emptyProgress(),
    });

    try {
      await this.gateway.download((progress) => this.reportProgress(progress));
      if (this.cancelRequested || this.state.status !== "downloading")
        return this.snapshot();
      this.setState({
        ...available,
        status: "downloaded",
      });
      return this.snapshot();
    } catch (error) {
      if (this.cancelRequested) return this.snapshot();
      this.setState({
        ...available,
        status: "error",
        errorPhase: "download",
      });
      throw error;
    }
  }

  private recordCheckFailure(
    checkedAt: string,
    preserveStableState: boolean,
  ): void {
    if (preserveStableState) return;
    this.setState({
      configured: true,
      status: "error",
      currentVersion: this.state.currentVersion,
      checkedAt,
      errorPhase: "check",
    });
  }

  private recordManualCheckFailure(): void {
    this.setState({
      configured: true,
      status: "error",
      currentVersion: this.state.currentVersion,
      checkedAt: this.now().toISOString(),
      errorPhase: "check",
    });
  }

  private reportProgress(progress: DownloadProgress): void {
    if (this.state.status !== "downloading") return;
    const next = normalizeProgress(progress);
    if (this.state.progress?.percent === next.percent) return;
    this.setState({ ...this.state, progress: next });
  }

  private hasDownloadedUpdate(): boolean {
    return (
      this.state.status === "downloaded" ||
      this.state.status === "scheduled" ||
      (this.state.status === "error" && this.state.errorPhase === "install")
    );
  }

  private shouldSkipAvailabilityCheck(): boolean {
    return (
      this.state.status === "downloading" ||
      this.state.status === "downloaded" ||
      this.state.status === "scheduled" ||
      this.state.status === "installing" ||
      (this.state.status === "error" && this.state.errorPhase === "install")
    );
  }

  private setState(next: UpdateSnapshot): void {
    this.state = cloneSnapshot(next);
    try {
      this.onChanged(this.snapshot());
    } catch {
      // A renderer notification failure must not corrupt the update state.
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

function normalizeProgress(progress: DownloadProgress): UpdateProgress {
  return {
    percent: clampInteger(progress.percent, 0, 100),
    transferredBytes: clampInteger(progress.transferredBytes, 0),
    totalBytes: clampInteger(progress.totalBytes, 0),
    bytesPerSecond: clampInteger(progress.bytesPerSecond, 0),
  };
}

function emptyProgress(): UpdateProgress {
  return {
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
  };
}

function clampInteger(
  value: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function cloneSnapshot(snapshot: UpdateSnapshot): UpdateSnapshot {
  return {
    ...snapshot,
    progress: snapshot.progress ? { ...snapshot.progress } : undefined,
  };
}
