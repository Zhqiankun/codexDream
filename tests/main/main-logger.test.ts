import { existsSync } from "node:fs";
import {
  link,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOG_CLEANUP_INTERVAL_MS,
  createMainLogger,
  type MainLogger,
} from "../../src/main/infra/main-logger";

const cleanup: Array<() => Promise<void>> = [];
const loggers: MainLogger[] = [];

afterEach(async () => {
  for (const logger of loggers.splice(0)) logger.dispose();
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
});

describe("main logger", () => {
  it("writes primitive JSONL fields to a file named for the local date", async () => {
    const directory = await temporaryDirectory();
    const now = new Date(2026, 7, 28, 23, 45, 12);
    const logger = trackedLogger(directory, now);

    logger.info("theme.saved", {
      ok: true,
      count: 2,
      detail: "saved",
      absent: undefined,
      nested: { unsafe: true },
    } as never);

    const names = await readdir(directory);
    expect(names).toEqual(["main-2026-08-28.jsonl"]);
    const entry = JSON.parse(
      (await readFile(join(directory, names[0]), "utf8")).trim(),
    ) as Record<string, unknown>;
    expect(entry).toMatchObject({
      timestamp: now.toISOString(),
      level: "info",
      event: "theme.saved",
      ok: true,
      count: 2,
      detail: "saved",
    });
    expect(entry).not.toHaveProperty("absent");
    expect(entry).not.toHaveProperty("nested");
  });

  it("rotates before any JSONL file exceeds its byte limit", async () => {
    const directory = await temporaryDirectory();
    const logger = createMainLogger({
      directory,
      now: () => new Date(2026, 7, 28, 12),
      maxFileBytes: 300,
    });
    loggers.push(logger);

    for (let index = 0; index < 12; index += 1) {
      logger.info("rotation.check", { index, detail: "x".repeat(36) });
    }

    const names = (await readdir(directory)).sort();
    expect(names.length).toBeGreaterThan(1);
    const entries: Array<Record<string, unknown>> = [];
    for (const name of names) {
      expect((await stat(join(directory, name))).size).toBeLessThanOrEqual(300);
      const lines = (await readFile(join(directory, name), "utf8"))
        .trim()
        .split("\n");
      entries.push(...lines.map((line) => JSON.parse(line)));
    }
    expect(entries).toHaveLength(12);
    expect(
      entries
        .map((entry) => entry.index)
        .sort((left, right) => Number(left) - Number(right)),
    ).toEqual(Array.from({ length: 12 }, (_value, index) => index));
  });

  it("cleans expired daily and rotated logs immediately but preserves seven local days", async () => {
    const directory = await temporaryDirectory();
    await Promise.all([
      writeFile(join(directory, "main-2026-08-21.jsonl"), "old\n"),
      writeFile(join(directory, "main-2026-08-21.2.jsonl"), "old\n"),
      writeFile(join(directory, "main-2026-08-22.jsonl"), "kept\n"),
      writeFile(join(directory, "main-2026-08-28.jsonl"), "current\n"),
    ]);

    trackedLogger(directory, new Date(2026, 7, 28, 8));

    expect(existsSync(join(directory, "main-2026-08-21.jsonl"))).toBe(false);
    expect(existsSync(join(directory, "main-2026-08-21.2.jsonl"))).toBe(false);
    expect(existsSync(join(directory, "main-2026-08-22.jsonl"))).toBe(true);
    expect(existsSync(join(directory, "main-2026-08-28.jsonl"))).toBe(true);
  });

  it("does not delete non-target files or names containing invalid dates", async () => {
    const directory = await temporaryDirectory();
    const preserved = [
      "notes.txt",
      "renderer-2020-01-01.jsonl",
      "main-2020-01-01.log",
      "main-2026-99-99.jsonl",
      "main-2026-08-01.jsonl.backup",
    ];
    await Promise.all(
      preserved.map((name) => writeFile(join(directory, name), "keep\n")),
    );

    trackedLogger(directory, new Date(2026, 7, 28, 8));

    await expect(readdir(directory)).resolves.toEqual(preserved.sort());
  });

  it("retains only strict error codes and allowlisted diagnostic fields", async () => {
    const directory = await temporaryDirectory();
    const logger = createMainLogger({
      directory,
      now: () => new Date(2026, 7, 28, 12),
      maxFileBytes: 2_048,
    });
    loggers.push(logger);

    logger.error(
      "save.failed",
      new Error(
        "C:\\Users\\Alice\\private Authorization: Bearer bearer-value password=plain-secret",
      ),
      {
        channel: "stable",
        path: "src/main/index.ts",
        code: "ERR_FAILED",
        appVersion: "1.3.3",
        version: "1.3.3-beta.1",
        description: "arbitrary prose payload",
        payload: "QUJDREVGRw",
        authorization: "Bearer_bearer-value",
        accessToken: 123456,
        password: "plain-secret",
        cookie: "session-cookie",
        apiKey: "api-key-value",
        absolutePath: "/home/alice/private",
        requestUrl: "https://example.test/save?token=field-token",
      },
    );
    logger.error("store.failed", new Error("STORE_TAMPERED:ownership-state"));

    const entries = await readEntries(directory);
    expect(entries[0]).toMatchObject({
      error: "Error: [redacted]",
      channel: "stable",
      path: "src/main/index.ts",
      code: "ERR_FAILED",
      appVersion: "1.3.3",
      version: "1.3.3-beta.1",
      description: "[redacted]",
      payload: "[redacted]",
      authorization: "[redacted]",
      accessToken: "[redacted]",
      password: "[redacted]",
      cookie: "[redacted]",
      apiKey: "[redacted]",
      absolutePath: "[redacted]",
      requestUrl: "<url>",
    });
    expect(entries[1]).toMatchObject({
      event: "store.failed",
      error: "Error: STORE_TAMPERED:ownership-state",
    });

    const raw = (
      await Promise.all(
        (await readdir(directory)).map((name) =>
          readFile(join(directory, name), "utf8"),
        ),
      )
    ).join("\n");
    expect(raw).not.toContain("Alice");
    expect(raw).not.toContain("bearer-value");
    expect(raw).not.toContain("plain-secret");
    expect(raw).not.toContain("session-cookie");
    expect(raw).not.toContain("api-key-value");
    expect(raw).not.toContain("field-token");
    for (const name of await readdir(directory)) {
      expect((await stat(join(directory, name))).size).toBeLessThanOrEqual(
        2_048,
      );
    }
  });

  it("rejects a log directory or ancestor replaced by a junction", async () => {
    const container = await temporaryDirectory();
    const target = await temporaryDirectory();
    const linkedDirectory = join(container, "logs");
    await symlink(target, linkedDirectory, "junction");
    const linkedLogger = createMainLogger({ directory: linkedDirectory });
    loggers.push(linkedLogger);
    linkedLogger.info("junction.rejected");
    await expect(readdir(target)).resolves.toEqual([]);

    const ancestorContainer = await temporaryDirectory();
    const ancestorTarget = await temporaryDirectory();
    const linkedAncestor = join(ancestorContainer, "linked-parent");
    await symlink(ancestorTarget, linkedAncestor, "junction");
    const nestedDirectory = join(linkedAncestor, "logs");
    const ancestorLogger = createMainLogger({ directory: nestedDirectory });
    loggers.push(ancestorLogger);
    ancestorLogger.info("ancestor.rejected");
    expect(existsSync(join(ancestorTarget, "logs"))).toBe(false);

    const swapContainer = await temporaryDirectory();
    const swappedDirectory = join(swapContainer, "logs");
    const swapTarget = await temporaryDirectory();
    const swappedLogger = createMainLogger({ directory: swappedDirectory });
    loggers.push(swappedLogger);
    await rm(swappedDirectory, { recursive: true, force: true });
    await symlink(swapTarget, swappedDirectory, "junction");
    swappedLogger.info("swap.rejected");
    await expect(readdir(swapTarget)).resolves.toEqual([]);
  });

  it("refuses a symlink or junction at the daily log file path", async () => {
    const directory = await temporaryDirectory();
    const victim = join(directory, "victim.txt");
    await writeFile(victim, "unchanged", "utf8");
    const logPath = join(directory, "main-2026-08-28.jsonl");
    try {
      await symlink(victim, logPath, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      const junctionTarget = await temporaryDirectory();
      await symlink(junctionTarget, logPath, "junction");
    }

    const logger = createMainLogger({
      directory,
      now: () => new Date(2026, 7, 28, 12),
    });
    loggers.push(logger);
    logger.info("file-link.rejected");

    await expect(readFile(victim, "utf8")).resolves.toBe("unchanged");
    expect((await readdir(directory)).sort()).toEqual(
      ["main-2026-08-28.jsonl", "victim.txt"].sort(),
    );
  });

  it("refuses a hard-linked daily log file", async () => {
    const directory = await temporaryDirectory();
    const victim = join(directory, "victim.txt");
    await writeFile(victim, "unchanged", "utf8");
    await link(victim, join(directory, "main-2026-08-28.jsonl"));
    const logger = createMainLogger({
      directory,
      now: () => new Date(2026, 7, 28, 12),
    });
    loggers.push(logger);

    logger.info("hardlink.rejected");

    await expect(readFile(victim, "utf8")).resolves.toBe("unchanged");
  });

  it("redacts an arbitrary payload passed as a string field", async () => {
    const directory = await temporaryDirectory();
    const logger = trackedLogger(directory, new Date(2026, 7, 28, 12));
    logger.warn("request.failed", {
      payload: '{"authorization":"Bearer secret-value"}',
      requestUrl: "https://example.test/save?token=field-token",
    });

    await expect(readEntries(directory)).resolves.toEqual([
      expect.objectContaining({ payload: "[redacted]", requestUrl: "<url>" }),
    ]);
  });

  it("unrefs its daily cleanup timer and clears it on dispose", async () => {
    const directory = await temporaryDirectory();
    const unref = vi.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const interval = vi.spyOn(globalThis, "setInterval").mockReturnValue(timer);
    const clear = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => {});

    const logger = createMainLogger({ directory });
    expect(interval).toHaveBeenCalledWith(
      expect.any(Function),
      DEFAULT_LOG_CLEANUP_INTERVAL_MS,
    );
    expect(unref).toHaveBeenCalledOnce();

    logger.dispose();
    expect(clear).toHaveBeenCalledWith(timer);
  });

  it("swallows directory and clock failures", () => {
    const logger = createMainLogger({
      directory: "\0invalid",
      now: () => {
        throw new Error("clock unavailable");
      },
    });
    loggers.push(logger);

    expect(() => logger.info("startup")).not.toThrow();
    expect(() =>
      logger.error("startup.failed", new Error("failure")),
    ).not.toThrow();
    expect(() => logger.cleanup()).not.toThrow();
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "codexstyle-main-logger-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function trackedLogger(directory: string, now: Date): MainLogger {
  const logger = createMainLogger({ directory, now: () => now });
  loggers.push(logger);
  return logger;
}

async function readEntries(
  directory: string,
): Promise<Array<Record<string, unknown>>> {
  const entries: Array<Record<string, unknown>> = [];
  for (const name of (await readdir(directory)).sort()) {
    const source = (await readFile(join(directory, name), "utf8")).trim();
    if (!source) continue;
    entries.push(
      ...source
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    );
  }
  return entries;
}
