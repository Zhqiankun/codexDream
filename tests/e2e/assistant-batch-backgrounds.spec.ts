import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ThemeDetail } from "../../src/contracts";

const slots = [
  "normal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;
type Slot = (typeof slots)[number];
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;
interface SavedTheme {
  libraryId: string;
  revision: number;
  status: "ready" | "draft";
}
interface BatchResult {
  theme: SavedTheme;
  replacedImages: Partial<Record<Slot, { sha256: string; bytes: number }>>;
  liveApply: { status: string; reason?: string };
}
interface ReadProbe {
  calls: number;
  finish?: () => void;
  restore: () => void;
}
type ProbeGlobal = typeof globalThis & { assistantBatchRead?: ReadProbe };
interface AssistantSystem {
  application: ElectronApplication;
  page: Page;
  client: Client;
  openClient: () => Promise<Client>;
  restart: () => Promise<void>;
  images: Record<Slot, string>;
  expected: Record<Slot, { sha256: string; bytes: number }>;
  invalidImage: string;
}

// 每例隔离 LOCALAPPDATA 和 Electron userData；STDIO、HTTP、controller 与 native 存储均为真实链路。
const test = base.extend<{ system: AssistantSystem }>({
  system: async ({}, use) => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), "codexstyle-mcp-batch-"));
    const packageVersion = (
      JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
        version: string;
      }
    ).version;
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) =>
          key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string",
      ),
    ) as Record<string, string>;
    const pluginRoot = resolve("plugins/codexstyle-assistant");
    const config = JSON.parse(
      await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
    ) as {
      mcpServers: {
        codexstyle: {
          command: string;
          args: string[];
          cwd: string;
          env_vars: string[];
        };
      };
    };
    const definition = config.mcpServers.codexstyle;
    const clients: Client[] = [];
    const openClient = async () => {
      const client = new Client({
        name: "codexstyle-batch-e2e",
        version: "1.0.0",
      });
      clients.push(client);
      await client.connect(
        new StdioClientTransport({
          command: resolve(pluginRoot, definition.command),
          args: definition.args,
          cwd: resolve(pluginRoot, definition.cwd),
          env: Object.fromEntries(
            definition.env_vars.map((key) => [
              key,
              key === "LOCALAPPDATA" ? isolatedRoot : (environment[key] ?? ""),
            ]),
          ),
          stderr: "pipe",
        }),
      );
      return client;
    };
    const launch = async () => {
      const application = await electron.launch({
        executablePath: resolve("node_modules/electron/dist/electron.exe"),
        args: [
          resolve("out/main/index.js"),
          `--user-data-dir=${join(isolatedRoot, "electron-user-data")}`,
        ],
        cwd: process.cwd(),
        env: {
          ...environment,
          LOCALAPPDATA: isolatedRoot,
          NODE_ENV: "production",
          npm_package_version: packageVersion,
        },
      });
      const page = await application.firstWindow();
      await expect(
        page.getByRole("region", { name: "Codex 助手" }),
      ).toContainText("CodexStyle MCP 已就绪");
      return { application, page, client: await openClient() };
    };
    const system: AssistantSystem = {
      ...(await launch()),
      openClient,
      restart: async () => {
        for (const client of clients.splice(0)) await client.close();
        await system.application.close();
        Object.assign(system, await launch());
      },
      images: {} as Record<Slot, string>,
      expected: {} as AssistantSystem["expected"],
      invalidImage: join(isolatedRoot, "invalid.png"),
    };
    try {
      for (const [index, slot] of slots.entries()) {
        const bytes = Buffer.from(
          await system.application.evaluate(
            ({ nativeImage }, color) =>
              Array.from(
                nativeImage
                  .createFromBitmap(Buffer.from([color, 90, 210, 255]), {
                    width: 1,
                    height: 1,
                  })
                  .toPNG(),
              ),
            index * 30,
          ),
        );
        system.images[slot] = join(isolatedRoot, `${slot}.png`);
        system.expected[slot] = {
          sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.byteLength,
        };
        await writeFile(system.images[slot], bytes);
      }
      await writeFile(system.invalidImage, "not a decoded image");
      await use(system);
    } finally {
      // 若断言中途失败，先解除受控读取，再关闭隔离进程，避免遗留挂起的 gate。
      await system.application
        .evaluate(() => {
          const probe = (globalThis as ProbeGlobal).assistantBatchRead;
          probe?.restore();
          probe?.finish?.();
        })
        .catch(() => undefined);
      for (const client of clients) await client.close();
      await system.application.close();
    }
  },
});

function toolTheme(result: ToolResult): SavedTheme {
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    libraryId: expect.any(String),
    revision: expect.any(Number),
  });
  return result.structuredContent as unknown as SavedTheme;
}

function toolError(result: ToolResult, code: string) {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ error: { code } });
}

async function detail(system: AssistantSystem, libraryId: string) {
  return system.page.evaluate(async (id) => {
    const result = await window.codexStyle.getTheme({ libraryId: id });
    if (!result.ok) throw new Error(result.error.code);
    return result.data;
  }, libraryId);
}

async function sourceTheme(system: AssistantSystem) {
  return system.page.evaluate(async () => {
    const snapshot = await window.codexStyle.getSnapshot();
    if (!snapshot.ok) throw new Error(snapshot.error.code);
    const source = snapshot.data.themes.find(
      (theme) => theme.name === "DeepSeek · 沧海鲸歌",
    );
    if (!source) throw new Error("Isolated bundled preset missing");
    return source;
  });
}

function nonBackground(theme: ThemeDetail) {
  const json = { ...theme.json };
  delete json.image;
  delete json.reasoningBackgrounds;
  const comparison: Record<string, unknown> = { ...theme, json };
  for (const key of [
    "revision",
    "updatedAt",
    "backgroundUrl",
    "reasoningBackgroundUrls",
    "backgroundThumbnailUrl",
  ])
    delete comparison[key];
  return comparison;
}

async function imageHashes(system: AssistantSystem, theme: ThemeDetail) {
  const urls = {
    normal: theme.backgroundUrl!,
    ...theme.reasoningBackgroundUrls,
  };
  const hashes: Record<string, string> = {};
  for (const [slot, url] of Object.entries(urls)) {
    // 在实际协议响应端核对字节，避免把大壁纸逐字节序列化经 CDP 搬回测试进程。
    hashes[slot] = await system.application.evaluate(
      async ({ net }, imageUrl) => {
        const response = await net.fetch(imageUrl);
        if (!response.ok) throw new Error("Batch image protocol failed");
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await response.arrayBuffer(),
        );
        return Buffer.from(digest).toString("hex");
      },
      url,
    );
  }
  return hashes;
}

async function batch(
  system: AssistantSystem,
  theme: SavedTheme,
  images: Partial<Record<Slot, string>>,
) {
  return system.client.callTool({
    name: "replace_and_save_theme_backgrounds",
    arguments: {
      libraryId: theme.libraryId,
      expectedRevision: theme.revision,
      images,
    },
  });
}

function batchResult(result: ToolResult): BatchResult {
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    theme: {
      libraryId: expect.any(String),
      revision: expect.any(Number),
      status: "ready",
    },
    liveApply: { status: "skipped", reason: "no-session" },
  });
  expect(JSON.stringify(result)).not.toMatch(
    /data:image\/|app:\/\/theme-asset|file:\/\/|[A-Z]:\\/iu,
  );
  return result.structuredContent as unknown as BatchResult;
}

test("MCP saves seven local images atomically, preserves hidden and omitted slots, and survives restart", async ({
  system,
}) => {
  test.setTimeout(120_000);
  const source = await sourceTheme(system);
  let prepared = toolTheme(
    await system.client.callTool({
      name: "create_theme_draft",
      arguments: { name: "批量七图验收", sourceLibraryId: source.libraryId },
    }),
  );
  // 既有 Studio 接口建立隐藏 persistent 资产，之后 MCP 必须保留它。
  await system.application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, system.images.medium);
  const hidden = await system.page.evaluate(
    async (theme) =>
      window.codexStyle.chooseBackground({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
        reasoningEffort: "persistent",
      }),
    prepared,
  );
  expect(hidden.ok).toBe(true);
  if (!hidden.ok) throw new Error(hidden.error.code);
  const committed = await system.page.evaluate(
    async (theme) =>
      window.codexStyle.commit({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
      }),
    hidden.data,
  );
  expect(committed.ok).toBe(true);
  if (!committed.ok) throw new Error(committed.error.code);
  prepared = committed.data.theme;
  expect(
    (
      await system.client.callTool({
        name: "select_theme",
        arguments: {
          libraryId: prepared.libraryId,
          expectedRevision: prepared.revision,
        },
      })
    ).isError,
  ).toBeFalsy();
  const before = await detail(system, prepared.libraryId);
  const beforeHashes = await imageHashes(system, before);
  // 批量入口不得打开选图窗口；异常直接暴露为测试失败。
  await system.application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => {
      throw new Error("Batch tool opened a picker");
    };
  });
  const saved = batchResult(await batch(system, prepared, system.images));
  expect(saved.theme.revision).toBe(prepared.revision + 1);
  expect(saved.theme.libraryId).toBe(prepared.libraryId);
  expect(saved.replacedImages).toEqual(system.expected);
  const after = await detail(system, prepared.libraryId);
  expect(nonBackground(after)).toEqual(nonBackground(before));
  const afterHashes = await imageHashes(system, after);
  for (const slot of slots)
    expect(afterHashes[slot]).toBe(system.expected[slot].sha256);
  expect(afterHashes.persistent).toBe(beforeHashes.persistent);

  const partial = batchResult(
    await batch(system, saved.theme, { low: system.images.ultra }),
  );
  expect(partial.theme.revision).toBe(saved.theme.revision + 1);
  expect(partial.replacedImages).toEqual({ low: system.expected.ultra });
  const final = await detail(system, prepared.libraryId);
  expect(nonBackground(final)).toEqual(nonBackground(before));
  expect(await imageHashes(system, final)).toEqual({
    ...afterHashes,
    low: system.expected.ultra.sha256,
  });

  await system.restart();
  const persisted = await detail(system, prepared.libraryId);
  expect(persisted).toEqual(final);
  expect(await imageHashes(system, persisted)).toEqual({
    ...afterHashes,
    low: system.expected.ultra.sha256,
  });
  const snapshot = await system.page.evaluate(() =>
    window.codexStyle.getSnapshot(),
  );
  expect(snapshot.ok && snapshot.data.selectedLibraryId).toBe(
    prepared.libraryId,
  );
});

test("MCP rejects stale, draft, checkpoint and invalid-image batches without changing the saved theme", async ({
  system,
}) => {
  test.setTimeout(90_000);
  const source = await sourceTheme(system);
  const before = await detail(system, source.libraryId);
  const beforeHashes = await imageHashes(system, before);
  toolError(
    await batch(
      system,
      { ...source, revision: source.revision + 1 },
      { low: system.images.low },
    ),
    "STALE_REVISION",
  );
  // 第一个输入有效、最后一个无效，也不能写入任何一个槽位。
  toolError(
    await batch(system, source, {
      normal: system.images.normal,
      ultra: system.invalidImage,
    }),
    "UNSAFE_IMAGE",
  );
  const draft = toolTheme(
    await system.client.callTool({
      name: "create_theme_draft",
      arguments: { name: "未保存目标" },
    }),
  );
  toolError(
    await batch(system, draft, { normal: system.images.normal }),
    "INCOMPLETE_THEME",
  );
  const edited = await system.page.evaluate(
    async (theme) =>
      window.codexStyle.patchDraft({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
        patch: { description: "保留待保存修改" },
      }),
    source,
  );
  expect(edited.ok).toBe(true);
  if (!edited.ok) throw new Error(edited.error.code);
  expect(edited.data.canDiscardChanges).toBe(true);
  toolError(
    await batch(system, edited.data, { normal: system.images.normal }),
    "INCOMPLETE_THEME",
  );
  expect(await detail(system, source.libraryId)).toEqual(edited.data);
  const discarded = await system.page.evaluate(
    async (theme) =>
      window.codexStyle.discardChanges({
        libraryId: theme.libraryId,
        expectedRevision: theme.revision,
      }),
    edited.data,
  );
  expect(discarded.ok).toBe(true);
  if (!discarded.ok) throw new Error(discarded.error.code);
  expect(nonBackground(discarded.data)).toEqual(nonBackground(before));
  expect(await imageHashes(system, discarded.data)).toEqual(beforeHashes);
});

test("MCP cancellation, SDK timeout and STDIO close retain the gate until reading ends and never write late", async ({
  system,
}) => {
  test.setTimeout(90_000);
  const source = await sourceTheme(system);
  const before = await detail(system, source.libraryId);
  const beforeHashes = await imageHashes(system, before);
  for (const reason of ["cancel", "timeout", "disconnect"] as const) {
    const caller = await system.openClient();
    const abort = new AbortController();
    await system.application.evaluate(async (_, imagePath) => {
      const { syncBuiltinESMExports } = process.getBuiltinModule("module");
      const fs = process.getBuiltinModule("fs/promises");
      // Windows TEMP 可能使用 8.3 短路径；产品按 realpath 打开，探针必须命中同一个规范路径。
      const target = (await fs.realpath(imagePath)).toLowerCase();
      const original = fs.open;
      const probe: ReadProbe = {
        calls: 0,
        restore: () => {
          fs.open = original;
          syncBuiltinESMExports();
        },
      };
      (globalThis as ProbeGlobal).assistantBatchRead = probe;
      fs.open = async (...args: Parameters<typeof original>) => {
        if (String(args[0]).toLowerCase() === target) {
          probe.calls += 1;
          await new Promise<void>((done) => {
            probe.finish = done;
          });
        }
        return original(...args);
      };
      syncBuiltinESMExports();
    }, system.images.normal);
    // 短 SDK deadline 验证取消传播；插件固定 120 秒期限由代码/协议测试覆盖，不伪称计时通过。
    const pending = caller.callTool(
      {
        name: "replace_and_save_theme_backgrounds",
        arguments: {
          libraryId: source.libraryId,
          expectedRevision: source.revision,
          images: { normal: system.images.normal },
        },
      },
      undefined,
      { signal: abort.signal, timeout: reason === "timeout" ? 1_000 : 15_000 },
    );
    const outcome = pending.then(
      () => "fulfilled",
      () => "rejected",
    );
    await expect
      .poll(() =>
        system.application.evaluate(
          () => (globalThis as ProbeGlobal).assistantBatchRead!.calls,
        ),
      )
      .toBe(1);
    if (reason === "cancel")
      abort.abort(new Error("Cancel isolated batch read"));
    if (reason === "disconnect") await caller.close();
    expect(await outcome).toBe("rejected");
    if (reason !== "disconnect") await caller.ping();
    toolError(
      await batch(system, source, { low: system.images.low }),
      "OPERATION_BUSY",
    );
    expect(await detail(system, source.libraryId)).toEqual(before);
    await system.application.evaluate(() => {
      const probe = (globalThis as ProbeGlobal).assistantBatchRead!;
      probe.restore();
      probe.finish!();
    });
    await expect
      .poll(async () => {
        const result = await system.client.callTool({
          name: "create_theme_draft",
          arguments: { name: `取消后锁释放 ${reason}` },
        });
        if (result.isError) toolError(result, "OPERATION_BUSY");
        return !result.isError;
      })
      .toBe(true);
    expect(await detail(system, source.libraryId)).toEqual(before);
    expect(await imageHashes(system, before)).toEqual(beforeHashes);
    await caller.close();
  }
});
