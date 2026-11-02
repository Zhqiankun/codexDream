import type { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserIdFromVersionUrl,
  CdpClient,
  validateWebSocketUrl,
} from "../../src/main/session/cdp-client";

const transport = vi.hoisted(() => ({
  sockets: [] as (EventEmitter & { send: ReturnType<typeof vi.fn> })[],
}));

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    readyState = MockWebSocket.OPEN;
    send = vi.fn();

    constructor() {
      super();
      transport.sockets.push(this);
    }

    close() {
      this.emit("close");
    }
  }
  return { default: MockWebSocket };
});

describe("CDP endpoint identity", () => {
  it("derives the browser identity from the browser websocket path", () => {
    expect(
      browserIdFromVersionUrl(
        "ws://127.0.0.1:9222/devtools/browser/browser-identity",
        9222,
      ),
    ).toBe("browser-identity");
  });

  it("rejects aliases, redirect-shaped URLs, and wrong target paths", () => {
    for (const endpoint of [
      "ws://localhost:9222/devtools/browser/browser-identity",
      "ws://127.0.0.1:9223/devtools/browser/browser-identity",
      "ws://127.0.0.1:9222/devtools/browser/browser-identity?token=x",
      "ws://127.0.0.1:9222/devtools/page/browser-identity",
    ]) {
      expect(() => browserIdFromVersionUrl(endpoint, 9222)).toThrow(
        "TARGET_IDENTITY_MISMATCH",
      );
    }
    expect(() =>
      validateWebSocketUrl(
        "ws://127.0.0.1:9222/devtools/browser/browser-identity",
        9222,
        "page",
      ),
    ).toThrow("TARGET_IDENTITY_MISMATCH");
  });
});

describe("CDP command deadlines", () => {
  let client: CdpClient | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    transport.sockets.length = 0;
  });

  afterEach(() => {
    client?.close();
    client = undefined;
    vi.useRealTimers();
  });

  async function connect() {
    client = new CdpClient(
      "ws://127.0.0.1:9222/devtools/page/page-identity",
      9222,
      "page-identity",
    );
    const connection = client.connect();
    const socket = transport.sockets[0];
    socket.emit("open");
    await connection;
    return { client, socket };
  }

  it("keeps the default five-second deadline for ordinary commands", async () => {
    const { client, socket } = await connect();
    const command = client.command("Runtime.evaluate", { expression: "true" });
    const failure = expect(command).rejects.toThrow(
      "CDP_UNAVAILABLE:command-timeout",
    );

    await vi.advanceTimersByTimeAsync(4_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts an injection response after five seconds with a longer deadline", async () => {
    const { client, socket } = await connect();
    const command = client.command(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: "true" },
      { timeoutMs: 30_000 },
    );

    await vi.advanceTimersByTimeAsync(6_000);
    expect(vi.getTimerCount()).toBe(1);
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({ id: 1, result: { identifier: "script-1" } }),
      ),
    );
    await expect(command).resolves.toEqual({ identifier: "script-1" });
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the extended wait and ignores late responses without retrying", async () => {
    const { client, socket } = await connect();
    const command = client.command(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: "true" },
      { timeoutMs: 30_000 },
    );
    const failure = expect(command).rejects.toThrow(
      "CDP_UNAVAILABLE:command-timeout",
    );

    await vi.advanceTimersByTimeAsync(29_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({ id: 1, result: { identifier: "late-script" } }),
      ),
    );
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects invalid deadlines before sending a command", async () => {
    const { client, socket } = await connect();
    for (const timeoutMs of [0, -1, 1.5, 30_001, NaN, Infinity]) {
      await expect(
        client.command(
          "Page.addScriptToEvaluateOnNewDocument",
          {},
          { timeoutMs },
        ),
      ).rejects.toThrow("CDP_UNAVAILABLE:timeout");
    }
    expect(socket.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
