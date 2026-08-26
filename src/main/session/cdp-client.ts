import WebSocket from "ws";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_CDP_RESPONSE_BYTES = 1024 * 1024;
const CDP_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/u;

export interface CdpVersion {
  Browser: string;
  webSocketDebuggerUrl: string;
  browserId: string;
}

export interface CdpTarget {
  id: string;
  type: "page";
  url: string;
  webSocketDebuggerUrl: string;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class CdpClient {
  private socket?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, PendingCommand>();

  constructor(
    private readonly endpoint: string,
    private readonly port: number,
    private readonly expectedTargetId?: string,
  ) {
    validateWebSocketUrl(endpoint, port, expectedTargetId ? "page" : undefined);
    if (
      expectedTargetId &&
      new URL(endpoint).pathname !== `/devtools/page/${expectedTargetId}`
    )
      throw new Error("TARGET_IDENTITY_MISMATCH");
  }

  async connect(): Promise<void> {
    if (this.socket) throw new Error("CDP_UNAVAILABLE:already-connected");
    this.socket = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(this.endpoint, {
        handshakeTimeout: REQUEST_TIMEOUT_MS,
        maxPayload: MAX_CDP_RESPONSE_BYTES,
      });
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("CDP_UNAVAILABLE:connect-timeout"));
      }, REQUEST_TIMEOUT_MS);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP_UNAVAILABLE:connect"));
      });
    });
    this.socket.on("message", (data) => this.handleMessage(data));
    this.socket.on("error", () => this.rejectAll("CDP_UNAVAILABLE:socket"));
    this.socket.on("close", () => this.rejectAll("CDP_UNAVAILABLE:closed"));
  }

  async command(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!/^[A-Za-z]+\.[A-Za-z]+$/u.test(method))
      throw new Error("CDP_UNAVAILABLE:method");
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      throw new Error("CDP_UNAVAILABLE");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP_UNAVAILABLE:command-timeout"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(new Error("CDP_UNAVAILABLE:send"));
      });
    });
  }

  close(): void {
    this.rejectAll("CDP_UNAVAILABLE:closed");
    this.socket?.close();
    this.socket = undefined;
  }

  private handleMessage(data: WebSocket.RawData): void {
    try {
      const bytes = toBuffer(data);
      if (bytes.byteLength > MAX_CDP_RESPONSE_BYTES)
        return this.rejectAll("CDP_UNAVAILABLE:message-size");
      const message: unknown = JSON.parse(bytes.toString("utf8"));
      if (!isRecord(message) || !Number.isSafeInteger(message.id)) return;
      const pending = this.pending.get(message.id as number);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id as number);
      if (isRecord(message.error))
        pending.reject(
          new Error(
            typeof message.error.message === "string"
              ? message.error.message
              : "CDP_UNAVAILABLE:remote",
          ),
        );
      else pending.resolve(message.result);
    } catch {
      this.rejectAll("CDP_UNAVAILABLE:message");
    }
  }

  private rejectAll(code: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(code));
    }
    this.pending.clear();
  }
}

export async function getCdpVersion(port: number): Promise<CdpVersion> {
  const version = await getJson(port, "/json/version");
  if (
    !isRecord(version) ||
    typeof version.Browser !== "string" ||
    !version.Browser ||
    typeof version.webSocketDebuggerUrl !== "string"
  )
    throw new Error("TARGET_IDENTITY_MISMATCH");
  return {
    Browser: version.Browser,
    webSocketDebuggerUrl: version.webSocketDebuggerUrl,
    browserId: browserIdFromVersionUrl(version.webSocketDebuggerUrl, port),
  };
}

export async function getCdpTargets(port: number): Promise<CdpTarget[]> {
  const response = await getJson(port, "/json/list");
  if (!Array.isArray(response)) throw new Error("TARGET_IDENTITY_MISMATCH");
  const pages: CdpTarget[] = [];
  for (const item of response) {
    if (!isRecord(item) || item.type !== "page") continue;
    if (
      typeof item.id !== "string" ||
      !CDP_ID_PATTERN.test(item.id) ||
      typeof item.url !== "string" ||
      !item.url.startsWith("app://") ||
      typeof item.webSocketDebuggerUrl !== "string"
    )
      throw new Error("TARGET_IDENTITY_MISMATCH");
    validateWebSocketUrl(item.webSocketDebuggerUrl, port, "page");
    if (
      new URL(item.webSocketDebuggerUrl).pathname !==
      `/devtools/page/${item.id}`
    )
      throw new Error("TARGET_IDENTITY_MISMATCH");
    pages.push({
      id: item.id,
      type: "page",
      url: item.url,
      webSocketDebuggerUrl: item.webSocketDebuggerUrl,
    });
  }
  return pages;
}

export function browserIdFromVersionUrl(value: string, port: number): string {
  const url = validateWebSocketUrl(value, port, "browser");
  const match = url.pathname.match(
    /^\/devtools\/browser\/([A-Za-z0-9._-]{1,200})$/u,
  );
  if (!match || !CDP_ID_PATTERN.test(match[1]))
    throw new Error("TARGET_IDENTITY_MISMATCH");
  return match[1];
}

export function validateWebSocketUrl(
  value: string,
  port: number,
  kind?: "browser" | "page",
): URL {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("TARGET_IDENTITY_MISMATCH");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TARGET_IDENTITY_MISMATCH");
  }
  const endpointPort = url.port ? Number(url.port) : 80;
  const expected = kind
    ? new RegExp(`^/devtools/${kind}/[A-Za-z0-9._-]{1,200}$`, "u")
    : /^\/devtools\/(?:browser|page)\/[A-Za-z0-9._-]{1,200}$/u;
  if (
    url.protocol !== "ws:" ||
    url.hostname !== "127.0.0.1" ||
    endpointPort !== port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !expected.test(url.pathname)
  )
    throw new Error("TARGET_IDENTITY_MISMATCH");
  return url;
}

async function getJson(
  port: number,
  path: "/json/version" | "/json/list",
): Promise<unknown> {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("TARGET_IDENTITY_MISMATCH");
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("CDP_UNAVAILABLE");
  }
  if (!response.ok || response.redirected) throw new Error("CDP_UNAVAILABLE");
  const length = Number(response.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > MAX_CDP_RESPONSE_BYTES)
    throw new Error("TARGET_IDENTITY_MISMATCH");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_CDP_RESPONSE_BYTES)
    throw new Error("TARGET_IDENTITY_MISMATCH");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("TARGET_IDENTITY_MISMATCH");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  return Buffer.from(data as Uint8Array);
}
