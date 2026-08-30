import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MANAGED_FILES,
  SecureManagedStore,
  managedThemeFile,
} from "../../src/main/infra/secure-store";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
});

describe("SecureManagedStore", () => {
  it("uses cryptographic entropy for native atomic-write temporary names", async () => {
    const source = await readFile(
      join(process.cwd(), "native", "secure-store", "src", "secure_store.cc"),
      "utf8",
    );

    expect(source).toContain("BCryptGenRandom");
    expect(source).not.toContain("GetTickCount64");
  });

  it("only opens the current user's fixed CodexStyle root", async () => {
    const localAppData = await mkdtemp(
      join(process.cwd(), ".codexstyle-localappdata-"),
    );
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;
    cleanup.push(async () => {
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      await rm(localAppData, { recursive: true, force: true });
    });

    expect(() => SecureManagedStore.open(join(localAppData, "other"))).toThrow(
      "STORE_TAMPERED",
    );
  });

  it("fails closed when the native addon is unavailable", async () => {
    const localAppData = await mkdtemp(
      join(process.cwd(), ".codexstyle-localappdata-"),
    );
    const emptyWorkingDirectory = await mkdtemp(
      join(process.cwd(), ".codexstyle-empty-native-"),
    );
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;
    const workingDirectory = vi
      .spyOn(process, "cwd")
      .mockReturnValue(emptyWorkingDirectory);
    cleanup.push(async () => {
      workingDirectory.mockRestore();
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      await rm(localAppData, { recursive: true, force: true });
      await rm(emptyWorkingDirectory, { recursive: true, force: true });
    });

    expect(() =>
      SecureManagedStore.open(join(localAppData, "CodexStyle")),
    ).toThrow("STORE_TAMPERED:native-unavailable");
  });

  it("writes, reads, and removes a managed state file through the native boundary", async () => {
    const localAppData = await mkdtemp(
      join(process.cwd(), ".codexstyle-localappdata-"),
    );
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;
    const store = SecureManagedStore.open(join(localAppData, "CodexStyle"));
    cleanup.push(async () => {
      store.close();
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      await rm(localAppData, { recursive: true, force: true });
    });

    store.ensureLayout();
    store.writeFileAtomic(MANAGED_FILES.index, Buffer.from("first", "utf8"));

    expect(store.readFile(MANAGED_FILES.index)?.toString("utf8")).toBe("first");
    expect(store.removeFile(MANAGED_FILES.index)).toBe(true);
    expect(store.readFile(MANAGED_FILES.index)).toBeUndefined();
  });

  it("refuses malformed managed file descriptors before native I/O", async () => {
    const localAppData = await mkdtemp(
      join(process.cwd(), ".codexstyle-localappdata-"),
    );
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;
    const store = SecureManagedStore.open(join(localAppData, "CodexStyle"));
    cleanup.push(async () => {
      store.close();
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      await rm(localAppData, { recursive: true, force: true });
    });

    expect(() =>
      store.writeFileAtomic(
        { directory: "themes", fileName: "..\\outside.png" },
        Buffer.from("x"),
      ),
    ).toThrow("STORE_TAMPERED");
  });

  it.each([
    ["state", MANAGED_FILES.index, "write"],
    [
      "themes",
      managedThemeFile("11111111-1111-4111-8111-111111111111.png"),
      "write",
    ],
    ["transactions", MANAGED_FILES.journal, "write"],
    ["lock", MANAGED_FILES.lock, "exclusive"],
    ["ownership", MANAGED_FILES.ownership, "write"],
    ["assistant", MANAGED_FILES.assistantEndpoint, "write"],
  ] as const)(
    "fails closed when %s is replaced by a real junction after root open",
    async (directory, file, operation) => {
      const localAppData = await mkdtemp(
        join(process.cwd(), ".codexstyle-localappdata-"),
      );
      const external = await mkdtemp(
        join(process.cwd(), ".codexstyle-sentinel-"),
      );
      const original = process.env.LOCALAPPDATA;
      process.env.LOCALAPPDATA = localAppData;
      const root = join(localAppData, "CodexStyle");
      const store = SecureManagedStore.open(root);
      cleanup.push(async () => {
        store.close();
        if (original === undefined) delete process.env.LOCALAPPDATA;
        else process.env.LOCALAPPDATA = original;
        await rm(localAppData, { recursive: true, force: true });
        await rm(external, { recursive: true, force: true });
      });

      store.ensureLayout();
      const sentinel = join(external, "sentinel.txt");
      await writeFile(sentinel, "unchanged", "utf8");
      await rm(join(root, directory), { recursive: true, force: true });
      await symlink(external, join(root, directory), "junction");

      const invoke = () =>
        operation === "exclusive"
          ? store.createFileExclusive(file, Buffer.from("replacement"))
          : store.writeFileAtomic(file, Buffer.from("replacement"));

      expect(invoke).toThrow("STORE_TAMPERED");
      expect(await readFile(sentinel, "utf8")).toBe("unchanged");
    },
  );
});
