import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexPluginInstaller } from "../../src/main/assistant/plugin-installer";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
});

describe("Codex assistant plugin installer", () => {
  it("registers the packaged marketplace and installs the bundled plugin", async () => {
    const root = await createMarketplace();
    const calls: string[][] = [];
    let installed = false;
    const run = vi.fn(async (_executable: string, args: string[]) => {
      calls.push(args);
      if (args[1] === "add" && args[0] === "plugin") installed = true;
      if (args[1] === "list")
        return {
          installed: installed
            ? [
                {
                  pluginId: "codexstyle-assistant@codexstyle",
                  version: "0.1.1",
                  enabled: true,
                },
              ]
            : [],
        };
      return {};
    });
    const installer = new CodexPluginInstaller(
      root,
      async () => "C:\\Codex\\codex.exe",
      run,
    );

    await expect(installer.install()).resolves.toEqual({
      status: "installed",
      pluginId: "codexstyle-assistant@codexstyle",
      version: "0.1.1",
      requiresCodexRestart: true,
    });
    expect(calls).toContainEqual([
      "plugin",
      "marketplace",
      "add",
      root,
      "--json",
    ]);
    expect(calls).toContainEqual([
      "plugin",
      "add",
      "codexstyle-assistant@codexstyle",
      "--json",
    ]);
  });

  it("does not reinstall an enabled plugin at the bundled version", async () => {
    const root = await createMarketplace();
    const run = vi.fn(async (_executable: string, args: string[]) =>
      args[1] === "list"
        ? {
            installed: [
              {
                pluginId: "codexstyle-assistant@codexstyle",
                version: "0.1.1",
                enabled: true,
              },
            ],
          }
        : {},
    );
    const installer = new CodexPluginInstaller(
      root,
      async () => "C:\\Codex\\codex.exe",
      run,
    );

    await expect(installer.install()).resolves.toMatchObject({
      status: "already-installed",
      version: "0.1.1",
    });
    expect(run.mock.calls.some(([, args]) => args[1] === "remove")).toBe(false);
    expect(
      run.mock.calls.some(
        ([, args]) => args[0] === "plugin" && args[1] === "add",
      ),
    ).toBe(false);
  });

  it("replaces an older cached plugin before verifying the new version", async () => {
    const root = await createMarketplace();
    let version = "0.1.0";
    const run = vi.fn(async (_executable: string, args: string[]) => {
      if (args[1] === "remove") version = "";
      if (args[0] === "plugin" && args[1] === "add") version = "0.1.1";
      return args[1] === "list"
        ? {
            installed: version
              ? [
                  {
                    pluginId: "codexstyle-assistant@codexstyle",
                    version,
                    enabled: true,
                  },
                ]
              : [],
          }
        : {};
    });
    const installer = new CodexPluginInstaller(
      root,
      async () => "C:\\Codex\\codex.exe",
      run,
    );

    await expect(installer.install()).resolves.toMatchObject({
      status: "installed",
      version: "0.1.1",
    });
    expect(run.mock.calls.map(([, args]) => args[1])).toContain("remove");
  });

  it("fails before invoking Codex when packaged runtime assets are missing", async () => {
    const root = await createMarketplace({ includeRuntime: false });
    const resolveCodex = vi.fn(async () => "C:\\Codex\\codex.exe");
    const installer = new CodexPluginInstaller(root, resolveCodex, vi.fn());

    await expect(installer.install()).rejects.toThrow(
      "ASSISTANT_PLUGIN:asset-missing",
    );
    expect(resolveCodex).not.toHaveBeenCalled();
  });
});

async function createMarketplace({
  includeRuntime = true,
} = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codexstyle-plugin-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const pluginRoot = join(root, "plugins", "codexstyle-assistant");
  await mkdir(join(root, ".agents", "plugins"), { recursive: true });
  await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
  await mkdir(join(pluginRoot, "mcp", "dist"), { recursive: true });
  await mkdir(join(pluginRoot, "runtime"), { recursive: true });
  await writeFile(
    join(root, ".agents", "plugins", "marketplace.json"),
    JSON.stringify({
      name: "codexstyle",
      plugins: [{ name: "codexstyle-assistant" }],
    }),
  );
  await writeFile(
    join(pluginRoot, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "codexstyle-assistant", version: "0.1.1" }),
  );
  await writeFile(join(pluginRoot, "mcp", "dist", "server.mjs"), "// mcp");
  await writeFile(join(pluginRoot, "runtime", "LICENSE-node.txt"), "license");
  if (includeRuntime)
    await writeFile(join(pluginRoot, "runtime", "node.exe"), "node");
  return root;
}
