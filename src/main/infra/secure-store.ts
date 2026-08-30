import { createRequire } from "node:module";
import { join } from "node:path";

export type ManagedDirectory =
  | "state"
  | "themes"
  | "transactions"
  | "lock"
  | "ownership"
  | "assistant";

export interface ManagedFile {
  directory: ManagedDirectory;
  fileName: string;
}

export const MANAGED_FILES = {
  index: { directory: "state", fileName: "index.json" },
  journal: { directory: "transactions", fileName: "index.journal" },
  backup: { directory: "transactions", fileName: "index.backup" },
  lock: { directory: "lock", fileName: "store.lock" },
  ownership: { directory: "ownership", fileName: "owned-session.json" },
  assistantEndpoint: {
    directory: "assistant",
    fileName: "endpoint.json",
  },
} as const satisfies Record<string, ManagedFile>;

interface NativeSecureStore {
  ensureLayout(): void;
  readFile(directory: string, fileName: string): Buffer | undefined;
  writeAtomic(directory: string, fileName: string, data: Buffer): void;
  createExclusive(directory: string, fileName: string, data: Buffer): boolean;
  removeFile(directory: string, fileName: string): boolean;
  close(): void;
}

interface NativeSecureStoreModule {
  open(root: string): NativeSecureStore;
}

const THEME_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/iu;

const staticFiles = new Set(
  Object.values(MANAGED_FILES).map(
    (file) => `${file.directory}/${file.fileName}`,
  ),
);

export function managedThemeFile(fileName: string): ManagedFile {
  const file: ManagedFile = { directory: "themes", fileName };
  assertManagedFile(file);
  return file;
}

/**
 * Checkpoint images intentionally share the native store's hardened theme
 * directory and UUID file contract. Their independent UUID keeps them from
 * aliasing the active image they protect.
 */
export function managedThemeCheckpointFile(fileName: string): ManagedFile {
  return managedThemeFile(fileName);
}

export class SecureManagedStore {
  private constructor(private readonly native: NativeSecureStore) {}

  static open(root: string): SecureManagedStore {
    if (process.platform !== "win32" || process.arch !== "x64")
      throw new Error("STORE_TAMPERED:native-platform");
    if (typeof root !== "string" || !root)
      throw new Error("STORE_TAMPERED:root");
    const native = loadNativeModule().open(root);
    if (!native || typeof native.ensureLayout !== "function")
      throw new Error("STORE_TAMPERED:native-contract");
    return new SecureManagedStore(native);
  }

  ensureLayout(): void {
    this.native.ensureLayout();
  }

  readFile(file: ManagedFile): Buffer | undefined {
    assertManagedFile(file);
    const result = this.native.readFile(file.directory, file.fileName);
    if (result === undefined) return undefined;
    if (!Buffer.isBuffer(result)) throw new Error("STORE_TAMPERED:native-read");
    return Buffer.from(result);
  }

  writeFileAtomic(file: ManagedFile, data: Buffer): void {
    assertManagedFile(file);
    this.native.writeAtomic(file.directory, file.fileName, Buffer.from(data));
  }

  createFileExclusive(file: ManagedFile, data: Buffer): boolean {
    assertManagedFile(file);
    const result = this.native.createExclusive(
      file.directory,
      file.fileName,
      Buffer.from(data),
    );
    if (typeof result !== "boolean")
      throw new Error("STORE_TAMPERED:native-create");
    return result;
  }

  removeFile(file: ManagedFile): boolean {
    assertManagedFile(file);
    const result = this.native.removeFile(file.directory, file.fileName);
    if (typeof result !== "boolean")
      throw new Error("STORE_TAMPERED:native-remove");
    return result;
  }

  close(): void {
    this.native.close();
  }
}

function assertManagedFile(file: ManagedFile): void {
  if (
    !file ||
    typeof file !== "object" ||
    typeof file.directory !== "string" ||
    typeof file.fileName !== "string"
  )
    throw new Error("STORE_TAMPERED:managed-path");
  const key = `${file.directory}/${file.fileName}`;
  if (staticFiles.has(key)) return;
  if (file.directory === "themes" && THEME_FILE.test(file.fileName)) return;
  throw new Error("STORE_TAMPERED:managed-path");
}

function loadNativeModule(): NativeSecureStoreModule {
  const require = createRequire(import.meta.url);
  const defaultApp = (process as NodeJS.Process & { defaultApp?: boolean })
    .defaultApp;
  const isPackaged = Boolean(process.resourcesPath) && !defaultApp;
  const nativePath = isPackaged
    ? join(process.resourcesPath, "native", "secure_store.node")
    : join(
        process.cwd(),
        "native",
        "secure-store",
        "build",
        "Release",
        "secure_store.node",
      );
  try {
    const module = require(nativePath) as Partial<NativeSecureStoreModule>;
    if (typeof module.open !== "function")
      throw new Error("invalid native module");
    return module as NativeSecureStoreModule;
  } catch {
    throw new Error("STORE_TAMPERED:native-unavailable");
  }
}
