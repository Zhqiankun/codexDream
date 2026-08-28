import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

export type LogFieldValue = string | number | boolean | undefined;
export type LogFields = Readonly<Record<string, LogFieldValue>>;
export type LogLevel = "info" | "warn" | "error";

export interface MainLoggerOptions {
  directory: string;
  retentionDays?: number;
  maxFileBytes?: number;
  now?: () => Date;
  cleanupIntervalMs?: number;
}

export interface MainLogger {
  readonly directory: string;
  log(level: LogLevel, event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, error?: unknown, fields?: LogFields): void;
  cleanup(): void;
  dispose(): void;
}

export const DEFAULT_LOG_RETENTION_DAYS = 7;
export const DEFAULT_MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_LOG_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MAX_ERROR_MESSAGE_CHARS = 2_048;

const MAX_EVENT_CHARS = 256;
const MAX_FIELD_STRING_CHARS = 1_024;
const MAX_ERROR_CODE_CHARS = 256;
const REDACTED = "[redacted]";
const LOG_FILE_PATTERN = /^main-(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?\.jsonl$/;
const RESERVED_FIELDS = new Set(["timestamp", "level", "event", "error"]);
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$/;
const DIAGNOSTIC_FIELD_PATTERN = /^[A-Za-z0-9._,:/-]+$/;
const FIELD_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
const URL_PATTERN = /\b[a-z][a-z\d+.-]*:\/\/\S+/i;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /(?:authorization|password|passwd|pwd|cookie|api[_-]?key|token|nonce|secret)\s*[:=]/i;
const BEARER_PATTERN = /(?:^|[\s,:=_-])bearer(?:[\s,:=_-]|$)/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

type SerializableLogEntry = Record<string, string | number | boolean>;

class FileMainLogger implements MainLogger {
  readonly directory: string;
  private readonly retentionDays: number;
  private readonly maxFileBytes: number;
  private readonly nowProvider: () => Date;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(options: MainLoggerOptions) {
    this.directory = options.directory;
    this.retentionDays = positiveInteger(
      options.retentionDays,
      DEFAULT_LOG_RETENTION_DAYS,
    );
    this.maxFileBytes = positiveInteger(
      options.maxFileBytes,
      DEFAULT_MAX_LOG_FILE_BYTES,
    );
    this.nowProvider = options.now ?? (() => new Date());

    this.cleanup();
    try {
      const timer = setInterval(
        () => this.cleanup(),
        positiveInteger(
          options.cleanupIntervalMs,
          DEFAULT_LOG_CLEANUP_INTERVAL_MS,
        ),
      );
      this.cleanupTimer = timer;
      timer.unref();
    } catch {
      // Logging infrastructure must never prevent the application from starting.
    }
  }

  log(level: LogLevel, event: string, fields: LogFields = {}): void {
    this.writeEntry(level, event, fields);
  }

  info(event: string, fields: LogFields = {}): void {
    this.writeEntry("info", event, fields);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.writeEntry("warn", event, fields);
  }

  error(event: string, error?: unknown, fields: LogFields = {}): void {
    this.writeEntry("error", event, fields, error);
  }

  cleanup(): void {
    if (this.disposed || !isUsableDirectory(this.directory)) return;
    try {
      const safeDirectory = assertSafeDirectory(this.directory);
      const now = this.now();
      const cutoff = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (this.retentionDays - 1),
      ).getTime();

      for (const name of readdirSync(safeDirectory)) {
        const fileDate = dateFromLogFileName(name);
        if (!fileDate || fileDate.getTime() >= cutoff) continue;
        const path = safeChildPath(safeDirectory, name);
        try {
          if (isSafeRegularFile(safeDirectory, path)) unlinkSync(path);
        } catch {
          // A locked or concurrently removed log should not disrupt cleanup.
        }
      }
    } catch {
      // An unavailable log directory must not affect the application.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.cleanupTimer) {
      try {
        clearInterval(this.cleanupTimer);
      } catch {
        // Disposal is best-effort for the same reason as writing.
      }
      this.cleanupTimer = undefined;
    }
  }

  private writeEntry(
    level: LogLevel,
    event: string,
    fields: LogFields,
    error?: unknown,
  ): void {
    if (this.disposed || !isUsableDirectory(this.directory)) return;
    try {
      const safeDirectory = assertSafeDirectory(this.directory);
      const now = this.now();
      const entry: SerializableLogEntry = {
        timestamp: now.toISOString(),
        level,
        event: sanitizeEvent(String(event)),
      };
      if (level === "error" && error !== undefined) {
        entry.error = sanitizeError(error);
      }
      addFields(entry, fields);

      const line = serializeWithinLimit(entry, this.maxFileBytes);
      if (!line) return;
      this.append(safeDirectory, dateKey(now), line);
    } catch {
      // Logging must be observational and must never change application control flow.
    }
  }

  private append(directory: string, day: string, line: Buffer): void {
    assertSafeDirectory(directory);
    let sequence = latestSequence(directory, day);
    for (;;) {
      assertSafeDirectory(directory);
      const path = safeChildPath(directory, logFileName(day, sequence));
      let descriptor: number | undefined;
      try {
        const exists = assertSafeTargetBeforeOpen(path);
        descriptor = openSync(
          path,
          constants.O_APPEND |
            constants.O_WRONLY |
            (exists ? 0 : constants.O_CREAT | constants.O_EXCL),
          0o600,
        );
        assertSafeOpenedFile(directory, path, descriptor);
        const currentBytes = fstatSync(descriptor).size;
        if (currentBytes + line.byteLength > this.maxFileBytes) {
          closeSync(descriptor);
          descriptor = undefined;
          sequence += 1;
          continue;
        }

        let offset = 0;
        while (offset < line.byteLength) {
          const written = writeSync(
            descriptor,
            line,
            offset,
            line.byteLength - offset,
          );
          if (written <= 0) throw new Error("LOG_WRITE_FAILED");
          offset += written;
        }
        fsyncSync(descriptor);
        closeSync(descriptor);
        return;
      } catch {
        if (descriptor !== undefined) {
          try {
            closeSync(descriptor);
          } catch {
            // Preserve the original best-effort failure behavior.
          }
        }
        return;
      }
    }
  }

  private now(): Date {
    try {
      const value = this.nowProvider();
      if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value;
      }
    } catch {
      // Fall back to the system clock when a supplied clock fails.
    }
    return new Date();
  }
}

class NoopMainLogger implements MainLogger {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  log(_level: LogLevel, _event: string, _fields?: LogFields): void {}
  info(_event: string, _fields?: LogFields): void {}
  warn(_event: string, _fields?: LogFields): void {}
  error(_event: string, _error?: unknown, _fields?: LogFields): void {}
  cleanup(): void {}
  dispose(): void {}
}

export function createMainLogger(options: MainLoggerOptions): MainLogger {
  let directory = "";
  try {
    directory = typeof options.directory === "string" ? options.directory : "";
    return new FileMainLogger({ ...options, directory });
  } catch {
    return new NoopMainLogger(directory);
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function isUsableDirectory(directory: string): boolean {
  return typeof directory === "string" && directory.trim().length > 0;
}

function assertSafeDirectory(directory: string): string {
  if (!isUsableDirectory(directory)) throw new Error("UNSAFE_LOG_DIRECTORY");
  const expected = resolve(directory);
  const existingAncestor = nearestExistingAncestor(expected);
  assertNoLinkedComponents(existingAncestor);
  if (!lstatSync(existingAncestor).isDirectory()) {
    throw new Error("UNSAFE_LOG_DIRECTORY");
  }
  mkdirSync(expected, { recursive: true, mode: 0o700 });
  assertNoLinkedComponents(expected);
  const information = lstatSync(expected);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error("UNSAFE_LOG_DIRECTORY");
  }
  const actual = realpathSync.native(expected);
  return resolve(actual);
}

function nearestExistingAncestor(path: string): string {
  let candidate = path;
  for (;;) {
    try {
      lstatSync(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

function assertNoLinkedComponents(path: string): void {
  const root = parse(path).root;
  let current = root;
  const components = path
    .slice(root.length)
    .split(/[\\/]+/)
    .filter(Boolean);
  for (const component of components) {
    current = join(current, component);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error("UNSAFE_LOG_DIRECTORY");
    }
  }
}

function safeChildPath(directory: string, name: string): string {
  const path = resolve(directory, name);
  if (!sameResolvedPath(dirname(path), directory)) {
    throw new Error("UNSAFE_LOG_PATH");
  }
  return path;
}

function sameResolvedPath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function assertSafeTargetBeforeOpen(path: string): boolean {
  try {
    const information = lstatSync(path);
    if (
      !information.isFile() ||
      information.isSymbolicLink() ||
      information.nlink !== 1
    ) {
      throw new Error("UNSAFE_LOG_FILE");
    }
    if (!sameResolvedPath(realpathSync.native(path), path)) {
      throw new Error("UNSAFE_LOG_FILE");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function assertSafeOpenedFile(
  directory: string,
  path: string,
  descriptor: number,
): void {
  assertSafeDirectory(directory);
  const linkInformation = lstatSync(path);
  const descriptorInformation = fstatSync(descriptor);
  const pathInformation = statSync(path);
  if (
    linkInformation.isSymbolicLink() ||
    !linkInformation.isFile() ||
    linkInformation.nlink !== 1 ||
    !descriptorInformation.isFile() ||
    descriptorInformation.nlink !== 1 ||
    !pathInformation.isFile() ||
    pathInformation.nlink !== 1 ||
    !sameResolvedPath(realpathSync.native(path), path) ||
    descriptorInformation.dev !== pathInformation.dev ||
    descriptorInformation.ino !== pathInformation.ino
  ) {
    throw new Error("UNSAFE_LOG_FILE");
  }
}

function isSafeRegularFile(directory: string, path: string): boolean {
  assertSafeDirectory(directory);
  const information = lstatSync(path);
  return (
    information.isFile() &&
    !information.isSymbolicLink() &&
    information.nlink === 1 &&
    sameResolvedPath(realpathSync.native(path), path)
  );
}

function dateKey(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function logFileName(day: string, sequence: number): string {
  return sequence === 0 ? `main-${day}.jsonl` : `main-${day}.${sequence}.jsonl`;
}

function latestSequence(directory: string, day: string): number {
  let latest = 0;
  try {
    for (const name of readdirSync(directory)) {
      const match = LOG_FILE_PATTERN.exec(name);
      if (!match || `${match[1]}-${match[2]}-${match[3]}` !== day) continue;
      const path = safeChildPath(directory, name);
      if (!isSafeRegularFile(directory, path)) continue;
      latest = Math.max(latest, match[4] ? Number(match[4]) : 0);
    }
  } catch {
    // The caller will attempt to create the base file.
  }
  return latest;
}

function dateFromLogFileName(name: string): Date | undefined {
  const match = LOG_FILE_PATTERN.exec(name);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

function addFields(entry: SerializableLogEntry, fields: LogFields): void {
  for (const [key, value] of Object.entries(fields)) {
    if (
      RESERVED_FIELDS.has(key) ||
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor" ||
      key.length === 0 ||
      key.length > 128 ||
      !FIELD_KEY_PATTERN.test(key)
    ) {
      continue;
    }
    if (isSensitiveFieldKey(key)) {
      entry[key] = REDACTED;
      continue;
    }
    if (typeof value === "string") {
      entry[key] = sanitizeFieldString(key, value);
    } else if (typeof value === "boolean") {
      entry[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      entry[key] = value;
    }
  }
}

function sanitizeError(error: unknown): string {
  let name = "Error";
  let message = "";
  try {
    if (error instanceof Error) {
      name = sanitizeErrorName(error.name);
      message = error.message;
    } else if (
      typeof error === "string" ||
      typeof error === "number" ||
      typeof error === "boolean"
    ) {
      message = String(error);
    }
  } catch {
    // Accessors and custom coercion must not escape the logger boundary.
  }
  const code =
    message.length <= Math.min(MAX_ERROR_CODE_CHARS, MAX_ERROR_MESSAGE_CHARS) &&
    ERROR_CODE_PATTERN.test(message)
      ? message
      : REDACTED;
  return `${name}: ${code}`;
}

function sanitizeEvent(value: string): string {
  return value.length > 0 &&
    value.length <= MAX_EVENT_CHARS &&
    DIAGNOSTIC_FIELD_PATTERN.test(value) &&
    !URL_PATTERN.test(value)
    ? value
    : "redacted";
}

function sanitizeErrorName(value: string): string {
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value) ? value : "Error";
}

function sanitizeFieldString(key: string, value: string): string {
  if (isSensitiveFieldKey(key)) return REDACTED;
  if (URL_PATTERN.test(value)) return "<url>";
  if (
    value.length === 0 ||
    value.length > MAX_FIELD_STRING_CHARS ||
    !DIAGNOSTIC_FIELD_PATTERN.test(value) ||
    isAbsolutePath(value) ||
    SENSITIVE_ASSIGNMENT_PATTERN.test(value) ||
    BEARER_PATTERN.test(value) ||
    JWT_PATTERN.test(value)
  ) {
    return REDACTED;
  }
  return value;
}

function isSensitiveFieldKey(key: string): boolean {
  const compact = key.replace(/[._-]/g, "").toLowerCase();
  return [
    "authorization",
    "credential",
    "password",
    "passwd",
    "cookie",
    "setcookie",
    "apikey",
    "bearer",
    "token",
    "nonce",
    "secret",
    "sessionid",
    "payload",
    "requestbody",
    "responsebody",
    "headers",
  ].some((sensitive) => compact.includes(sensitive));
}

function isAbsolutePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(value)
  );
}

function serializeWithinLimit(
  entry: SerializableLogEntry,
  maxBytes: number,
): Buffer | undefined {
  const base: SerializableLogEntry = {
    timestamp: entry.timestamp,
    level: entry.level,
    event: entry.event,
  };

  if (!fitStringProperty(base, "event", String(entry.event), maxBytes, true)) {
    return undefined;
  }

  if (typeof entry.error === "string") {
    fitStringProperty(base, "error", entry.error, maxBytes, false);
  }
  for (const [key, value] of Object.entries(entry)) {
    if (RESERVED_FIELDS.has(key)) continue;
    if (typeof value === "string") {
      fitStringProperty(base, key, value, maxBytes, false);
    } else {
      base[key] = value;
      if (serializedBytes(base) > maxBytes) delete base[key];
    }
  }

  const serialized = Buffer.from(`${JSON.stringify(base)}\n`, "utf8");
  return serialized.byteLength <= maxBytes ? serialized : undefined;
}

function fitStringProperty(
  entry: SerializableLogEntry,
  key: string,
  value: string,
  maxBytes: number,
  required: boolean,
): boolean {
  entry[key] = value;
  if (serializedBytes(entry) <= maxBytes) return true;

  delete entry[key];
  if (required) {
    for (const fallback of ["redacted", ""]) {
      entry[key] = fallback;
      if (serializedBytes(entry) <= maxBytes) return true;
      delete entry[key];
    }
  }
  return false;
}

function serializedBytes(entry: SerializableLogEntry): number {
  return Buffer.byteLength(`${JSON.stringify(entry)}\n`, "utf8");
}
