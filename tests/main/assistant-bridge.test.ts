import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_ASSISTANT_PROTOCOL_VERSION,
  CodexAssistantEndpointSchema,
  type CodexAssistantResponse,
  type Result,
  type ThemeDetail,
  type ThemeSnapshot,
} from "../../src/contracts";
import { CodexAssistantBridge } from "../../src/main/assistant/assistant-bridge";
import { CodexAssistantService } from "../../src/main/assistant/assistant-service";
import {
  MANAGED_FILES,
  SecureManagedStore,
} from "../../src/main/infra/secure-store";
import { createManagedRoot } from "../fixtures/managed-root";

const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const operation of cleanup.splice(0).reverse()) await operation();
});

describe("Codex assistant loopback bridge", () => {
  it("requires the managed bearer token and reports a connected client", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = SecureManagedStore.open(managed.root);
    cleanup.push(() => store.close());
    store.ensureLayout();
    const assistant = new CodexAssistantService(fakeOperations());
    const bridge = new CodexAssistantBridge(store, assistant);
    cleanup.push(() => bridge.stop());
    await bridge.start();

    const descriptorBytes = store.readFile(MANAGED_FILES.assistantEndpoint);
    expect(descriptorBytes).toBeDefined();
    const descriptor = CodexAssistantEndpointSchema.parse(
      JSON.parse(descriptorBytes!.toString("utf8")),
    );
    expect(bridge.snapshot().state).toBe("listening");

    const unauthorized = await fetch(
      `http://127.0.0.1:${descriptor.port}/v1/rpc`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer wrong",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(unauthorized.status).toBe(401);

    const id = randomUUID();
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/v1/rpc`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        v: CODEX_ASSISTANT_PROTOCOL_VERSION,
        id,
        method: "status",
        params: {},
      }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      v: CODEX_ASSISTANT_PROTOCOL_VERSION,
      id,
      ok: true,
      data: { appVersion: "1.3.12" },
    });
    expect(bridge.snapshot()).toMatchObject({
      state: "connected",
      lastSeenAt: expect.any(String),
    });

    bridge.stop();
    expect(store.readFile(MANAGED_FILES.assistantEndpoint)).toBeUndefined();
  });

  it("rejects browser-origin requests even with a valid token", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = SecureManagedStore.open(managed.root);
    cleanup.push(() => store.close());
    store.ensureLayout();
    const bridge = new CodexAssistantBridge(
      store,
      new CodexAssistantService(fakeOperations()),
    );
    cleanup.push(() => bridge.stop());
    await bridge.start();
    const descriptor = CodexAssistantEndpointSchema.parse(
      JSON.parse(
        store.readFile(MANAGED_FILES.assistantEndpoint)!.toString("utf8"),
      ),
    );

    const response = await fetch(`http://127.0.0.1:${descriptor.port}/v1/rpc`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        "content-type": "application/json",
        origin: "https://example.test",
      },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });

  it("rejects invalid routes, media types, and oversized payloads", async () => {
    const managed = await createManagedRoot();
    cleanup.push(managed.cleanup);
    const store = SecureManagedStore.open(managed.root);
    cleanup.push(() => store.close());
    store.ensureLayout();
    const bridge = new CodexAssistantBridge(
      store,
      new CodexAssistantService(fakeOperations()),
    );
    cleanup.push(() => bridge.stop());
    await bridge.start();
    const descriptor = CodexAssistantEndpointSchema.parse(
      JSON.parse(
        store.readFile(MANAGED_FILES.assistantEndpoint)!.toString("utf8"),
      ),
    );
    const authorization = `Bearer ${descriptor.token}`;

    const wrongPath = await fetch(
      `http://127.0.0.1:${descriptor.port}/not-rpc`,
      { method: "POST", headers: { authorization } },
    );
    expect(wrongPath.status).toBe(404);

    const wrongType = await fetch(
      `http://127.0.0.1:${descriptor.port}/v1/rpc`,
      {
        method: "POST",
        headers: { authorization, "content-type": "text/plain" },
        body: "{}",
      },
    );
    expect(wrongType.status).toBe(415);

    const oversized = await fetch(
      `http://127.0.0.1:${descriptor.port}/v1/rpc`,
      {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: "x".repeat(512 * 1024 + 1),
      },
    );
    expect(oversized.status).toBe(413);
  });

  it.each(["disconnect", "stop"] as const)(
    "aborts a pending handler after an HTTP %s",
    async (action) => {
      const managed = await createManagedRoot();
      cleanup.push(managed.cleanup);
      const store = SecureManagedStore.open(managed.root);
      cleanup.push(() => store.close());
      store.ensureLayout();
      const assistant = new CodexAssistantService(fakeOperations());
      const bridge = new CodexAssistantBridge(store, assistant);
      cleanup.push(() => bridge.stop());
      await bridge.start();
      const descriptor = CodexAssistantEndpointSchema.parse(
        JSON.parse(
          store.readFile(MANAGED_FILES.assistantEndpoint)!.toString("utf8"),
        ),
      );
      let receivedSignal: AbortSignal | undefined;
      let finishHandler: (() => void) | undefined;
      const aborted = vi.fn();
      const handle = vi.spyOn(assistant, "handle").mockImplementation(
        (request, signal) =>
          new Promise<CodexAssistantResponse>((resolve) => {
            receivedSignal = signal;
            finishHandler = () =>
              resolve({
                v: CODEX_ASSISTANT_PROTOCOL_VERSION,
                id: request.id,
                ok: false,
                error: {
                  code: "UNKNOWN",
                  message: "cancelled pending request",
                },
              });
            signal?.addEventListener(
              "abort",
              () => {
                aborted();
                finishHandler?.();
              },
              { once: true },
            );
          }),
      );
      const body = JSON.stringify({
        v: CODEX_ASSISTANT_PROTOCOL_VERSION,
        id: randomUUID(),
        method: "status",
        params: {},
      });
      const client = httpRequest({
        hostname: "127.0.0.1",
        port: descriptor.port,
        path: "/v1/rpc",
        method: "POST",
        headers: {
          authorization: `Bearer ${descriptor.token}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      });
      // A deliberate disconnect may surface ECONNRESET on the HTTP client.
      client.on("error", () => undefined);
      client.on("response", (response) => response.resume());
      cleanup.push(() => {
        client.destroy();
        finishHandler?.();
      });
      client.end(body);

      await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce());
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      // The complete request body alone must not cancel a live picker.
      expect(receivedSignal?.aborted).toBe(false);
      if (action === "disconnect") client.destroy();
      else bridge.stop();

      await vi.waitFor(() => expect(aborted).toHaveBeenCalledOnce());
      expect(receivedSignal?.aborted).toBe(true);
      if (action === "stop") {
        expect(bridge.snapshot().state).toBe("unavailable");
        expect(store.readFile(MANAGED_FILES.assistantEndpoint)).toBeUndefined();
      }
    },
  );
});

function fakeOperations() {
  const unsupported = async (): Promise<Result<ThemeDetail>> => ({
    ok: false,
    error: { code: "UNKNOWN", messageKey: "unsupported" },
  });
  return {
    appVersion: "1.3.12",
    snapshot: (): ThemeSnapshot => ({
      themes: [],
      paused: false,
      session: {
        state: "NO_SESSION",
        messageKey: "session.none",
        canEnd: false,
        launchedByTool: false,
      },
      update: {
        configured: false,
        status: "unsupported",
        currentVersion: "1.3.12",
      },
    }),
    getTheme: (): Result<ThemeDetail> => ({
      ok: false,
      error: { code: "NOT_FOUND", messageKey: "theme.notFound" },
    }),
    createDraft: unsupported,
    createDraftFrom: unsupported,
    patchDraft: unsupported,
    setBackgroundMode: unsupported,
    chooseReasoningBackground: unsupported,
    clearReasoningBackground: unsupported,
    selectTheme: async (): Promise<Result<ThemeSnapshot>> => ({
      ok: false,
      error: { code: "UNKNOWN", messageKey: "unsupported" },
    }),
  };
}
