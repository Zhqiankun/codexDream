import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(import.meta.dirname, "..");
const pluginRoot = process.env.CODEXSTYLE_PLUGIN_ROOT
  ? resolve(process.env.CODEXSTYLE_PLUGIN_ROOT)
  : resolve(root, "plugins", "codexstyle-assistant");
const config = JSON.parse(
  await readFile(resolve(pluginRoot, ".mcp.json"), "utf8"),
);
const definition = config.mcpServers?.codexstyle;
if (!definition || typeof definition.command !== "string")
  throw new Error("CodexStyle MCP configuration is missing");
const env = Object.fromEntries(
  (definition.env_vars ?? [])
    .map((name) => [name, process.env[name]])
    .filter((entry) => entry[1] !== undefined),
);
const transport = new StdioClientTransport({
  command: definition.command,
  args: definition.args ?? [],
  cwd: resolve(pluginRoot, definition.cwd ?? "."),
  env,
  stderr: "pipe",
});
const client = new Client({ name: "codexstyle-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  const expected = [
    "create_theme_draft",
    "get_theme",
    "list_themes",
    "select_theme",
    "status",
    "update_theme_draft",
    "validate_palette",
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected))
    throw new Error(`Unexpected MCP tools: ${names.join(", ")}`);
  const status = await client.callTool({ name: "status", arguments: {} });
  if (status.isError)
    throw new Error("CodexStyle status tool returned an error");
  const themes = await client.callTool({
    name: "list_themes",
    arguments: {},
  });
  if (themes.isError)
    throw new Error("CodexStyle list_themes tool returned an error");
  process.stdout.write(
    JSON.stringify(
      {
        tools: names,
        status: status.structuredContent,
        themes: themes.structuredContent,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await client.close();
}
