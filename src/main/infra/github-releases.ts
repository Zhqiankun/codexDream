import { net, shell } from "electron";
import type { ReleaseInfo, UpdateGateway } from "../app/update-service";

const RELEASE_API =
  "https://api.github.com/repos/Zhqiankun/codexDream/releases/latest";
const RELEASE_PATH =
  /^\/Zhqiankun\/codexDream\/releases\/tag\/(v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/iu;
const MAX_RESPONSE_BYTES = 256 * 1024;

export class GitHubReleases implements UpdateGateway {
  constructor(private readonly currentVersion: string) {}

  async fetchLatest(): Promise<ReleaseInfo> {
    const response = await net.fetch(RELEASE_API, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `CodexStyle/${this.currentVersion}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error("UPDATE_CHECK_FAILED:http-status");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES)
      throw new Error("UPDATE_CHECK_FAILED:response-size");
    const source = await response.text();
    if (new TextEncoder().encode(source).byteLength > MAX_RESPONSE_BYTES)
      throw new Error("UPDATE_CHECK_FAILED:response-size");
    let payload: unknown;
    try {
      payload = JSON.parse(source);
    } catch {
      throw new Error("UPDATE_CHECK_FAILED:response-json");
    }
    return parseReleasePayload(payload);
  }

  async openRelease(url: string): Promise<void> {
    validateReleaseUrl(url);
    await shell.openExternal(url, { activate: true });
  }
}

export function parseReleasePayload(payload: unknown): ReleaseInfo {
  if (
    !isRecord(payload) ||
    payload.draft !== false ||
    payload.prerelease !== false
  )
    throw new Error("UPDATE_CHECK_FAILED:release-state");
  if (
    typeof payload.tag_name !== "string" ||
    typeof payload.html_url !== "string"
  )
    throw new Error("UPDATE_CHECK_FAILED:release-fields");
  const version = normalizeVersion(payload.tag_name);
  const urlVersion = validateReleaseUrl(payload.html_url);
  if (version !== urlVersion)
    throw new Error("UPDATE_CHECK_FAILED:release-mismatch");
  return { version, url: payload.html_url };
}

function validateReleaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("UPDATE_CHECK_FAILED:release-url");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("UPDATE_CHECK_FAILED:release-url");
  const match = RELEASE_PATH.exec(url.pathname);
  if (!match) throw new Error("UPDATE_CHECK_FAILED:release-url");
  return normalizeVersion(match[1]);
}

function normalizeVersion(value: string): string {
  const match = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/u.exec(
    value,
  );
  if (!match) throw new Error("UPDATE_CHECK_FAILED:release-version");
  return match[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
