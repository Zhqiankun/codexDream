import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  CODEX_ASSISTANT_PROTOCOL_VERSION,
  CodexAssistantEndpointSchema,
  ThemeColorsSchema,
  type CodexAssistantResponse,
} from "../../../../src/contracts/index.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

const server = new McpServer(
  { name: "codexstyle", version: "0.1.1" },
  {
    instructions:
      "Use CodexStyle tools to read themes and create reviewed color drafts. Never overwrite a saved theme: create a derived draft first. Call validate_palette before update_theme_draft. Only call select_theme when the user explicitly asks to select an already saved theme. Commit, delete, import, export, and Codex launch actions are intentionally unavailable.",
  },
);

server.registerTool(
  "status",
  {
    title: "检查 CodexStyle 连接",
    description: "确认本机 CodexStyle 是否正在运行并可供插件调用。",
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => toolResult(await callBridge("status", {})),
);

server.registerTool(
  "list_themes",
  {
    title: "列出 CodexStyle 主题",
    description: "列出主题库、草稿状态、版本号以及当前为下次启动选择的主题。",
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => toolResult(await callBridge("list_themes", {})),
);

server.registerTool(
  "get_theme",
  {
    title: "读取 CodexStyle 主题",
    description: "读取一个主题的 29 项颜色、画面参数、组件样式与验证状态。",
    inputSchema: z.object({ libraryId: z.string().uuid() }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ libraryId }) =>
    toolResult(await callBridge("get_theme", { libraryId })),
);

server.registerTool(
  "validate_palette",
  {
    title: "校验 CodexStyle 配色",
    description: "在写入前校验完整的 29 项主题颜色和关键文字对比度。",
    inputSchema: z.object({ colors: ThemeColorsSchema }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ colors }) =>
    toolResult(await callBridge("validate_palette", { colors })),
);

server.registerTool(
  "create_theme_draft",
  {
    title: "新建 CodexStyle 主题草稿",
    description:
      "创建空白草稿，或从一个现有主题派生草稿并保留其背景图。不会覆盖源主题。",
    inputSchema: z
      .object({
        name: z.string().trim().min(1).max(80),
        sourceLibraryId: z.string().uuid().optional(),
      })
      .strict(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ name, sourceLibraryId }) =>
    toolResult(
      await callBridge("create_theme_draft", {
        name,
        ...(sourceLibraryId ? { sourceLibraryId } : {}),
      }),
    ),
);

server.registerTool(
  "update_theme_draft",
  {
    title: "更新 CodexStyle 主题草稿",
    description:
      "用通过对比度校验的完整 29 色方案更新草稿。已保存主题会被拒绝。",
    inputSchema: z
      .object({
        libraryId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
        colors: ThemeColorsSchema,
        appearance: z.enum(["auto", "light", "dark"]).optional(),
        description: z.string().max(2000).optional(),
      })
      .strict(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ libraryId, expectedRevision, colors, appearance, description }) =>
    toolResult(
      await callBridge("update_theme_draft", {
        libraryId,
        expectedRevision,
        colors,
        ...(appearance ? { appearance } : {}),
        ...(description !== undefined ? { description } : {}),
      }),
    ),
);

server.registerTool(
  "select_theme",
  {
    title: "选择 CodexStyle 主题",
    description:
      "选择一个已保存主题用于下次启动 Codex。仅在用户明确要求选择时调用。",
    inputSchema: z
      .object({
        libraryId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ libraryId, expectedRevision }) =>
    toolResult(
      await callBridge("select_theme", { libraryId, expectedRevision }),
    ),
);

await server.connect(new StdioServerTransport());

async function callBridge(
  method:
    | "status"
    | "list_themes"
    | "get_theme"
    | "validate_palette"
    | "create_theme_draft"
    | "update_theme_draft"
    | "select_theme",
  params: Record<string, unknown>,
): Promise<CodexAssistantResponse> {
  const endpoint = await readEndpoint();
  const requestId = randomUUID();
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${endpoint.port}/v1/rpc`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${endpoint.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        v: CODEX_ASSISTANT_PROTOCOL_VERSION,
        id: requestId,
        method,
        params,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("无法连接 CodexStyle。请先启动 CodexStyle，再重试此工具。");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES)
    throw new Error("CodexStyle 返回内容超过安全限制。");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES)
    throw new Error("CodexStyle 返回内容超过安全限制。");
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("CodexStyle 返回了无效响应。");
  }
  if (!isBridgeResponse(payload))
    throw new Error("CodexStyle 返回了不兼容的响应。");
  if (payload.id !== requestId)
    throw new Error("CodexStyle 返回了不匹配的响应。");
  if (!response.ok && payload.ok)
    throw new Error(`CodexStyle 连接失败（HTTP ${response.status}）。`);
  return payload;
}

async function readEndpoint() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData)
    throw new Error("未找到 LOCALAPPDATA，无法定位 CodexStyle。");
  const filePath = join(
    localAppData,
    "CodexStyle",
    "assistant",
    "endpoint.json",
  );
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    throw new Error("CodexStyle 未运行或助手接口尚未启动。");
  }
  if (bytes.byteLength > 8 * 1024)
    throw new Error("CodexStyle 端点描述文件无效。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("CodexStyle 端点描述文件无效。");
  }
  const descriptor = CodexAssistantEndpointSchema.safeParse(parsed);
  if (!descriptor.success) throw new Error("CodexStyle 端点描述文件不兼容。");
  return descriptor.data;
}

function toolResult(response: CodexAssistantResponse) {
  const structuredContent = response.ok
    ? toStructuredContent(response.data)
    : { error: response.error };
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
    ...(response.ok ? {} : { isError: true }),
  };
}

function toStructuredContent(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { result: value };
}

function isBridgeResponse(value: unknown): value is CodexAssistantResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.v === CODEX_ASSISTANT_PROTOCOL_VERSION &&
    typeof record.id === "string" &&
    typeof record.ok === "boolean" &&
    (record.ok === true
      ? "data" in record
      : Boolean(record.error) && typeof record.error === "object")
  );
}
