import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  CODEX_ASSISTANT_PROTOCOL_VERSION,
  CodexAssistantEndpointSchema,
  CodexAssistantSetBackgroundModeParamsSchema,
  CodexAssistantChooseReasoningBackgroundParamsSchema,
  CodexAssistantClearReasoningBackgroundParamsSchema,
  CodexAssistantReplaceAndSaveBackgroundsParamsSchema,
  ThemeColorsSchema,
  type CodexAssistantRequest,
  type CodexAssistantResponse,
} from "../../../../src/contracts/index.js";

const REQUEST_TIMEOUT_MS = 10_000;
const IMAGE_OPERATION_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

const server = new McpServer(
  { name: "codexstyle", version: "0.1.3" },
  {
    instructions:
      "Use CodexStyle tools to read themes and create reviewed color and background drafts. Color and existing draft-background tools require a separate draft and never overwrite a saved theme. Call validate_palette before changing colors with update_theme_draft. choose_reasoning_background opens a native file picker and never accepts paths or image bytes. The sole saved-theme mutation is replace_and_save_theme_backgrounds: when the user authorizes replacing backgrounds on an existing saved theme, supply current libraryId/revision and absolute local image paths for one or more normal/low/medium/high/xhigh/max/ultra slots. It directly replaces and saves those images together, preserves omitted slots and all non-background settings, and reports saved-theme metadata, image hashes and live-apply status separately. It cannot change background mode, read arbitrary files, delete themes, import/export themes or launch Codex. Re-read the theme after cancellation, timeout or stale revision before deciding whether to retry. Only call select_theme when the user explicitly asks to select an already saved theme.",
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
    description:
      "读取主题的 29 项颜色、背景模式、各档图片是否存在及可编辑状态、画面参数和验证状态，不返回图片内容或路径。",
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
  "set_background_mode",
  {
    title: "设置草稿背景模式",
    description:
      "将草稿背景模式设为 normal（正常）或 reasoning（按档位切换），保留全部已配置图片。已保存主题会被拒绝。",
    inputSchema: CodexAssistantSetBackgroundModeParamsSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params, { signal }) =>
    toolResult(await callBridge("set_background_mode", params, signal)),
);

server.registerTool(
  "choose_reasoning_background",
  {
    title: "选择草稿档位背景",
    description:
      "打开 CodexStyle 原生文件窗口，由用户为草稿的 low/medium/high/xhigh/max/ultra 中一档选择图片。请先告知用户需要在窗口中选图；不接收文件路径、URL 或图片字节。取消或超时后尚未提交的选图作废；窗口关闭前其他写操作仍受操作锁保护。",
    inputSchema: CodexAssistantChooseReasoningBackgroundParamsSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params, { signal }) =>
    toolResult(await callBridge("choose_reasoning_background", params, signal)),
);

server.registerTool(
  "clear_reasoning_background",
  {
    title: "清除草稿档位背景",
    description:
      "清除草稿六档中的指定图片，其余图片和背景模式保持不变。仅当用户要求清除此档背景时调用；已保存主题会被拒绝。",
    inputSchema: CodexAssistantClearReasoningBackgroundParamsSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params, { signal }) =>
    toolResult(await callBridge("clear_reasoning_background", params, signal)),
);

server.registerTool(
  "replace_and_save_theme_backgrounds",
  {
    title: "批量替换并保存主题背景",
    description:
      "按用户授权直接更新并保存已有 ready 主题的背景。images 至少提供 normal/low/medium/high/xhigh/max/ultra 中一项绝对本地 PNG、JPEG 或 WebP 路径；省略的图片、背景模式及全部其他设置保持不变。主进程受限读取并一次提交，返回脱敏主题、各替换槽位的 SHA-256/字节数及独立的即时应用结果。此具名动作是唯一直接保存已有主题的工具，不接受 URL、图片字节、模式修改或通用文件读写。",
    inputSchema: CodexAssistantReplaceAndSaveBackgroundsParamsSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params, { signal }) =>
    toolResult(
      await callBridge("replace_and_save_theme_backgrounds", params, signal),
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
  method: CodexAssistantRequest["method"],
  params: Record<string, unknown>,
  requestSignal?: AbortSignal,
): Promise<CodexAssistantResponse> {
  const endpoint = await readEndpoint();
  const requestId = randomUUID();
  // 选图交互和批量媒体校验共享有界长预算；取消继续传入主进程提交边界。
  const timeoutSignal = AbortSignal.timeout(
    method === "choose_reasoning_background" ||
      method === "replace_and_save_theme_backgrounds"
      ? IMAGE_OPERATION_TIMEOUT_MS
      : REQUEST_TIMEOUT_MS,
  );
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeoutSignal])
    : timeoutSignal;
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
      signal,
    });
  } catch {
    if (signal.aborted) {
      throw new Error(
        method === "choose_reasoning_background"
          ? "选图请求已取消或超时，尚未提交的选图已作废。请关闭仍打开的选图窗口，重新读取草稿后再操作。"
          : "CodexStyle 请求已取消或超时，请重新读取主题状态后再操作。",
      );
    }
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
