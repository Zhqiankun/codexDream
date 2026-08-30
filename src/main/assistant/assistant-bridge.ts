import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  CODEX_ASSISTANT_PROTOCOL_VERSION,
  CodexAssistantEndpointSchema,
  CodexAssistantRequestSchema,
  type CodexAssistantResponse,
  type CodexAssistantSnapshot,
} from "../../contracts";
import { MANAGED_FILES, type SecureManagedStore } from "../infra/secure-store";
import type { CodexAssistantService } from "./assistant-service";

const RPC_PATH = "/v1/rpc";
const MAX_REQUEST_BYTES = 512 * 1024;
const EMPTY_REQUEST_ID = "00000000-0000-4000-8000-000000000000";

export class CodexAssistantBridge {
  private server?: Server;
  private token?: string;
  private lastSeenAt?: string;
  private state: CodexAssistantSnapshot["state"] = "unavailable";

  constructor(
    private readonly store: SecureManagedStore,
    private readonly service: CodexAssistantService,
    private readonly onStateChange?: () => void,
  ) {}

  snapshot(): CodexAssistantSnapshot {
    return {
      state: this.state,
      protocolVersion: CODEX_ASSISTANT_PROTOCOL_VERSION,
      ...(this.lastSeenAt ? { lastSeenAt: this.lastSeenAt } : {}),
    };
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.store.removeFile(MANAGED_FILES.assistantEndpoint);
    const token = randomBytes(32).toString("hex");
    const server = createServer((request, response) => {
      void this.handle(request, response).catch(() => {
        if (!response.headersSent)
          this.sendJson(response, 500, {
            v: CODEX_ASSISTANT_PROTOCOL_VERSION,
            id: EMPTY_REQUEST_ID,
            ok: false,
            error: {
              code: "UNKNOWN",
              message: "CodexStyle 助手接口发生内部错误。",
            },
          } satisfies CodexAssistantResponse);
        else response.destroy();
      });
    });
    server.on("clientError", (_error, socket) => socket.destroy());
    try {
      const port = await listenOnLoopback(server);
      const descriptor = {
        v: CODEX_ASSISTANT_PROTOCOL_VERSION,
        port,
        token,
        pid: process.pid,
        createdAt: new Date().toISOString(),
      } as const;
      this.store.writeFileAtomic(
        MANAGED_FILES.assistantEndpoint,
        Buffer.from(JSON.stringify(descriptor), "utf8"),
      );
      const persisted = this.store.readFile(MANAGED_FILES.assistantEndpoint);
      const verified = persisted
        ? CodexAssistantEndpointSchema.safeParse(
            JSON.parse(persisted.toString("utf8")),
          )
        : undefined;
      if (!verified?.success || verified.data.token !== token)
        throw new Error("ASSISTANT_BRIDGE:endpoint-write");
      this.server = server;
      this.token = token;
      this.state = "listening";
      this.onStateChange?.();
    } catch (error) {
      server.close();
      this.store.removeFile(MANAGED_FILES.assistantEndpoint);
      throw error;
    }
  }

  stop(): void {
    this.server?.close();
    this.server = undefined;
    this.token = undefined;
    this.lastSeenAt = undefined;
    this.store.removeFile(MANAGED_FILES.assistantEndpoint);
    if (this.state !== "unavailable") {
      this.state = "unavailable";
      this.onStateChange?.();
    }
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (!isLoopback(request.socket.remoteAddress)) {
      this.sendJson(response, 403, { error: "forbidden" });
      return;
    }
    if (request.method !== "POST") {
      this.sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }
    if (request.url !== RPC_PATH) {
      this.sendJson(response, 404, { error: "not_found" });
      return;
    }
    if (request.headers.origin) {
      this.sendJson(response, 403, { error: "browser_origin_rejected" });
      return;
    }
    if (!this.authorized(request.headers.authorization)) {
      this.sendJson(response, 401, { error: "unauthorized" });
      return;
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      this.sendJson(response, 415, { error: "unsupported_media_type" });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse((await readBody(request)).toString("utf8"));
    } catch (error) {
      if (error instanceof RequestTooLargeError) {
        this.sendJson(response, 413, { error: "request_too_large" });
        return;
      }
      this.sendJson(response, 400, invalidRequest());
      return;
    }
    const parsed = CodexAssistantRequestSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendJson(response, 400, invalidRequest(requestId(payload)));
      return;
    }
    this.touch();
    this.sendJson(response, 200, await this.service.handle(parsed.data));
  }

  private authorized(header: string | undefined): boolean {
    const token = this.token;
    if (!token || !header?.startsWith("Bearer ")) return false;
    const supplied = Buffer.from(header.slice(7), "utf8");
    const expected = Buffer.from(token, "utf8");
    return (
      supplied.byteLength === expected.byteLength &&
      timingSafeEqual(supplied, expected)
    );
  }

  private touch(): void {
    const wasConnected = this.state === "connected";
    this.state = "connected";
    this.lastSeenAt = new Date().toISOString();
    if (!wasConnected) this.onStateChange?.();
  }

  private sendJson(
    response: ServerResponse,
    status: number,
    payload: unknown,
  ): void {
    const data = Buffer.from(JSON.stringify(payload), "utf8");
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": data.byteLength,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(data);
  }
}

async function listenOnLoopback(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  if (
    !address ||
    typeof address === "string" ||
    address.address !== "127.0.0.1"
  )
    throw new Error("ASSISTANT_BRIDGE:listen");
  return address.port;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_REQUEST_BYTES) throw new RequestTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

class RequestTooLargeError extends Error {
  constructor() {
    super("ASSISTANT_BRIDGE:request-too-large");
  }
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function invalidRequest(id = EMPTY_REQUEST_ID): CodexAssistantResponse {
  return {
    v: CODEX_ASSISTANT_PROTOCOL_VERSION,
    id,
    ok: false,
    error: { code: "INVALID_REQUEST", message: "请求格式无效。" },
  };
}

function requestId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return EMPTY_REQUEST_ID;
  const id = (payload as Record<string, unknown>).id;
  return typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      id,
    )
    ? id
    : EMPTY_REQUEST_ID;
}
