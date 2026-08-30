import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CodexAssistantPluginInstallResult } from "../../contracts";

const PLUGIN_ID = "codexstyle-assistant@codexstyle" as const;
const PLUGIN_NAME = "codexstyle-assistant";
const MARKETPLACE_NAME = "codexstyle";
const MAX_CLI_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_CODEX_BIN_ENTRIES = 64;

type CommandRunner = (executable: string, args: string[]) => Promise<unknown>;

export class CodexPluginInstaller {
  constructor(
    private readonly marketplaceRoot: string,
    private readonly resolveCodexCli: () => Promise<string> = resolveInstalledCodexCli,
    private readonly runCommand: CommandRunner = runJsonCommand,
  ) {}

  async install(): Promise<CodexAssistantPluginInstallResult> {
    const desiredVersion = await validateMarketplace(this.marketplaceRoot);
    const codexCli = await this.resolveCodexCli();

    await this.runCommand(codexCli, [
      "plugin",
      "marketplace",
      "add",
      this.marketplaceRoot,
      "--json",
    ]);

    const before = findInstalledPlugin(
      await this.runCommand(codexCli, ["plugin", "list", "--json"]),
    );
    if (before?.version === desiredVersion && before.enabled === true) {
      return installResult("already-installed", desiredVersion);
    }

    if (before) {
      await this.runCommand(codexCli, [
        "plugin",
        "remove",
        PLUGIN_ID,
        "--json",
      ]);
    }

    await this.runCommand(codexCli, ["plugin", "add", PLUGIN_ID, "--json"]);
    const installed = findInstalledPlugin(
      await this.runCommand(codexCli, ["plugin", "list", "--json"]),
    );
    if (!installed || installed.version !== desiredVersion)
      throw new Error("ASSISTANT_PLUGIN:install-verification");
    return installResult(
      installed.enabled === true ? "installed" : "needs-enable",
      desiredVersion,
    );
  }
}

async function validateMarketplace(root: string): Promise<string> {
  if (!root) throw new Error("ASSISTANT_PLUGIN:marketplace-root");
  const marketplacePath = join(root, ".agents", "plugins", "marketplace.json");
  const pluginRoot = join(root, "plugins", PLUGIN_NAME);
  const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
  const runtimePath = join(pluginRoot, "runtime", "node.exe");
  const runtimeLicensePath = join(pluginRoot, "runtime", "LICENSE-node.txt");
  const serverPath = join(pluginRoot, "mcp", "dist", "server.mjs");
  for (const path of [
    marketplacePath,
    manifestPath,
    runtimePath,
    runtimeLicensePath,
    serverPath,
  ])
    await requireRegularFile(path);

  const marketplace = parseJson(
    await readFileBounded(marketplacePath),
    "marketplace",
  );
  if (
    !isRecord(marketplace) ||
    marketplace.name !== MARKETPLACE_NAME ||
    !Array.isArray(marketplace.plugins) ||
    !marketplace.plugins.some(
      (plugin) => isRecord(plugin) && plugin.name === PLUGIN_NAME,
    )
  )
    throw new Error("ASSISTANT_PLUGIN:marketplace-invalid");

  const manifest = parseJson(await readFileBounded(manifestPath), "manifest");
  if (
    !isRecord(manifest) ||
    manifest.name !== PLUGIN_NAME ||
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+$/u.test(manifest.version)
  )
    throw new Error("ASSISTANT_PLUGIN:manifest-invalid");
  return manifest.version;
}

async function resolveInstalledCodexCli(): Promise<string> {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("ASSISTANT_PLUGIN:codex-cli-unavailable");
  const binRoot = join(localAppData, "OpenAI", "Codex", "bin");
  const entries = await readdir(binRoot, { withFileTypes: true }).catch(
    () => [],
  );
  if (entries.length > MAX_CODEX_BIN_ENTRIES)
    throw new Error("ASSISTANT_PLUGIN:codex-cli-layout");
  const candidates: Array<{ path: string; modifiedAt: number }> = [];
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !/^[a-f0-9]{16,64}$/u.test(entry.name)
    )
      continue;
    const path = join(binRoot, entry.name, "codex.exe");
    const info = await lstat(path).catch(() => undefined);
    if (info?.isFile() && !info.isSymbolicLink())
      candidates.push({ path, modifiedAt: info.mtimeMs });
  }
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const candidate = candidates[0]?.path;
  if (!candidate) throw new Error("ASSISTANT_PLUGIN:codex-cli-unavailable");
  return candidate;
}

function runJsonCommand(executable: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        encoding: "utf8",
        maxBuffer: MAX_CLI_OUTPUT_BYTES,
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(new Error("ASSISTANT_PLUGIN:codex-command"));
          return;
        }
        try {
          resolve(parseJson(stdout, "codex-output"));
        } catch (caught) {
          reject(caught);
        }
      },
    );
  });
}

function findInstalledPlugin(
  value: unknown,
): { version: string; enabled: boolean } | undefined {
  if (!isRecord(value) || !Array.isArray(value.installed)) return undefined;
  const plugin = value.installed.find(
    (entry) => isRecord(entry) && entry.pluginId === PLUGIN_ID,
  );
  return isRecord(plugin) && typeof plugin.version === "string"
    ? { version: plugin.version, enabled: plugin.enabled === true }
    : undefined;
}

function installResult(
  status: CodexAssistantPluginInstallResult["status"],
  version: string,
): CodexAssistantPluginInstallResult {
  return {
    status,
    pluginId: PLUGIN_ID,
    version,
    requiresCodexRestart: true,
  };
}

async function requireRegularFile(path: string): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink())
    throw new Error("ASSISTANT_PLUGIN:asset-missing");
}

async function readFileBounded(path: string): Promise<string> {
  const bytes = await readFile(path);
  if (bytes.byteLength > 256 * 1024)
    throw new Error("ASSISTANT_PLUGIN:metadata-too-large");
  return bytes.toString("utf8");
}

function parseJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`ASSISTANT_PLUGIN:${label}-invalid`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
