import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BackgroundMode, ReasoningEffort } from "../../src/contracts";

const editableEfforts = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;
const allEfforts: ReasoningEffort[] = [
  "none",
  "minimal",
  ...editableEfforts,
  "persistent",
];
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;
interface AssistantTheme {
  libraryId: string;
  revision: number;
  name: string;
  status: "draft" | "ready";
  backgroundMode: BackgroundMode;
  reasoningBackgrounds: Record<
    ReasoningEffort,
    { hasImage: boolean; editable: boolean }
  >;
}
interface PickerProbe {
  calls: number;
  finish?: (cancel: boolean) => void;
}
type PickerGlobal = typeof globalThis & {
  assistantBackgroundPicker?: PickerProbe;
};
interface AssistantSystem {
  application: ElectronApplication;
  page: Page;
  client: Client;
  openClient: () => Promise<Client>;
  imagePath: string;
  imageBytes: number[];
  unsafeImagePath: string;
}

// 只有系统文件窗口由测试控制。其余链路使用随包 Node 的 STDIO、认证 HTTP、真实 controller 与 native 存储。
const test = base.extend<{ system: AssistantSystem }>({
  system: async ({}, use) => {
    const isolatedRoot = await mkdtemp(
      join(tmpdir(), "codexstyle-mcp-background-"),
    );
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
    const clients: Client[] = [];
    try {
      const page = await application.firstWindow();
      await expect(
        page.getByRole("region", { name: "Codex 助手" }),
      ).toContainText("CodexStyle MCP 已就绪");
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
      const openClient = async () => {
        const client = new Client({
          name: "codexstyle-background-e2e",
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
                key === "LOCALAPPDATA"
                  ? isolatedRoot
                  : (environment[key] ?? ""),
              ]),
            ),
            stderr: "pipe",
          }),
        );
        return client;
      };
      const imageBytes = await application.evaluate(({ nativeImage }) =>
        Array.from(
          nativeImage
            .createFromBitmap(Buffer.from([30, 120, 210, 255]), {
              width: 1,
              height: 1,
            })
            .toPNG(),
        ),
      );
      const imagePath = join(isolatedRoot, "chosen-image.png");
      const unsafeImagePath = join(isolatedRoot, "invalid-image.png");
      await writeFile(imagePath, Buffer.from(imageBytes));
      await writeFile(unsafeImagePath, "not an image");
      await use({
        application,
        page,
        client: await openClient(),
        openClient,
        imagePath,
        imageBytes,
        unsafeImagePath,
      });
    } finally {
      // 失败收尾也只取消本用例的文件窗口，避免测试退出时留下迟到的选图。
      await application
        .evaluate(() =>
          (globalThis as PickerGlobal).assistantBackgroundPicker?.finish?.(
            true,
          ),
        )
        .catch(() => undefined);
      for (const client of clients) await client.close();
      await application.close();
    }
  },
});

function themeResult(result: ToolResult): AssistantTheme {
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    libraryId: expect.any(String),
    revision: expect.any(Number),
  });
  const theme = result.structuredContent as unknown as AssistantTheme;
  expect(Object.keys(theme.reasoningBackgrounds).sort()).toEqual(
    [...allEfforts].sort(),
  );
  for (const effort of allEfforts) {
    expect(theme.reasoningBackgrounds[effort]).toEqual({
      hasImage: expect.any(Boolean),
      editable: (editableEfforts as readonly string[]).includes(effort),
    });
  }
  expect(theme).not.toHaveProperty("css");
  expect(theme).not.toHaveProperty("backgroundUrl");
  expect(theme).not.toHaveProperty("reasoningBackgroundUrls");
  expect(JSON.stringify(result)).not.toMatch(
    /data:image\/|app:\/\/theme-asset|file:\/\//u,
  );
  return theme;
}

async function readTheme(client: Client, libraryId: string) {
  return themeResult(
    await client.callTool({ name: "get_theme", arguments: { libraryId } }),
  );
}

function expectToolError(result: ToolResult, code: string) {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ error: { code } });
}

async function chooseFile(system: AssistantSystem, path?: string) {
  await system.application.evaluate(({ dialog }, selectedPath) => {
    const probe: PickerProbe = { calls: 0 };
    (globalThis as PickerGlobal).assistantBackgroundPicker = probe;
    dialog.showOpenDialog = async () => {
      probe.calls += 1;
      return {
        canceled: !selectedPath,
        filePaths: selectedPath ? [selectedPath] : [],
      };
    };
  }, path);
}

test("MCP configures draft background mode and six wallpapers through the real app", async ({
  system,
}) => {
  test.setTimeout(90_000);
  const { client, application, page } = system;
  expect(
    (await client.listTools()).tools.map((tool) => tool.name).sort(),
  ).toEqual([
    "choose_reasoning_background",
    "clear_reasoning_background",
    "create_theme_draft",
    "get_theme",
    "list_themes",
    "replace_and_save_theme_backgrounds",
    "select_theme",
    "set_background_mode",
    "status",
    "update_theme_draft",
    "validate_palette",
  ]);
  const initial = await page.evaluate(() => window.codexStyle.getSnapshot());
  expect(initial.ok).toBe(true);
  if (!initial.ok) throw new Error("Isolated theme library unavailable");
  const sourceSummary = initial.data.themes.find(
    (theme) => theme.name === "DeepSeek · 沧海鲸歌",
  )!;
  expect(sourceSummary).toBeDefined();
  const source = await readTheme(client, sourceSummary.libraryId);
  expect(source.backgroundMode).toBe("reasoning");
  for (const effort of editableEfforts)
    expect(source.reasoningBackgrounds[effort].hasImage).toBe(true);
  await chooseFile(system, system.imagePath);
  for (const [name, extra] of [
    ["set_background_mode", { mode: "normal" }],
    ["choose_reasoning_background", { reasoningEffort: "low" }],
    ["clear_reasoning_background", { reasoningEffort: "low" }],
  ] as const) {
    expectToolError(
      await client.callTool({
        name,
        arguments: {
          libraryId: source.libraryId,
          expectedRevision: source.revision,
          ...extra,
        },
      }),
      "READY_THEME_IMMUTABLE",
    );
  }
  expect(
    await application.evaluate(
      () => (globalThis as PickerGlobal).assistantBackgroundPicker!.calls,
    ),
  ).toBe(0);

  let draft = themeResult(
    await client.callTool({
      name: "create_theme_draft",
      arguments: { name: "MCP 六档验收", sourceLibraryId: source.libraryId },
    }),
  );
  expect(draft.status).toBe("draft");
  expect(draft.reasoningBackgrounds).toEqual(source.reasoningBackgrounds);
  // 用既有 Studio 接口准备一个隐藏档位资产，MCP 只读取和保留它，不能修改。
  const hiddenFixture = await page.evaluate(
    async ({ libraryId, expectedRevision }) =>
      window.codexStyle.chooseBackground({
        libraryId,
        expectedRevision,
        reasoningEffort: "persistent",
      }),
    { libraryId: draft.libraryId, expectedRevision: draft.revision },
  );
  expect(hiddenFixture.ok).toBe(true);
  draft = await readTheme(client, draft.libraryId);
  expect(draft.reasoningBackgrounds.persistent).toEqual({
    hasImage: true,
    editable: false,
  });
  const previousRevision = draft.revision;
  const preservedImages = draft.reasoningBackgrounds;
  draft = themeResult(
    await client.callTool({
      name: "set_background_mode",
      arguments: {
        libraryId: draft.libraryId,
        expectedRevision: draft.revision,
        mode: "normal",
      },
    }),
  );
  expect(draft.backgroundMode).toBe("normal");
  expect(draft.reasoningBackgrounds).toEqual(preservedImages);
  expectToolError(
    await client.callTool({
      name: "set_background_mode",
      arguments: {
        libraryId: draft.libraryId,
        expectedRevision: previousRevision,
        mode: "reasoning",
      },
    }),
    "STALE_REVISION",
  );
  draft = themeResult(
    await client.callTool({
      name: "set_background_mode",
      arguments: {
        libraryId: draft.libraryId,
        expectedRevision: draft.revision,
        mode: "reasoning",
      },
    }),
  );

  // MCP 只提交枚举；路径来自模拟的系统选图窗口，真实存储与图片协议核对实际字节。
  for (const effort of editableEfforts) {
    draft = themeResult(
      await client.callTool({
        name: "choose_reasoning_background",
        arguments: {
          libraryId: draft.libraryId,
          expectedRevision: draft.revision,
          reasoningEffort: effort,
        },
      }),
    );
    expect(draft.reasoningBackgrounds[effort].hasImage).toBe(true);
  }
  const urls = await page.evaluate(async (libraryId) => {
    const detail = await window.codexStyle.getTheme({ libraryId });
    if (!detail.ok) throw new Error("Chosen wallpaper could not be read");
    return detail.data.reasoningBackgroundUrls!;
  }, draft.libraryId);
  for (const effort of editableEfforts) {
    expect(
      await application.evaluate(
        async ({ net }, url) =>
          Array.from(
            new Uint8Array(await (await net.fetch(url!)).arrayBuffer()),
          ),
        urls[effort],
      ),
    ).toEqual(system.imageBytes);
  }
  draft = themeResult(
    await client.callTool({
      name: "clear_reasoning_background",
      arguments: {
        libraryId: draft.libraryId,
        expectedRevision: draft.revision,
        reasoningEffort: "max",
      },
    }),
  );
  expect(draft.reasoningBackgrounds.max.hasImage).toBe(false);
  expect(draft.reasoningBackgrounds.ultra.hasImage).toBe(true);
  expect(draft.reasoningBackgrounds.persistent.hasImage).toBe(true);
  for (const reasoningEffort of ["none", "minimal", "persistent"]) {
    expect(
      (
        await client.callTool({
          name: "clear_reasoning_background",
          arguments: {
            libraryId: draft.libraryId,
            expectedRevision: draft.revision,
            reasoningEffort,
          },
        })
      ).isError,
    ).toBe(true);
  }
  expect(
    (
      await client.callTool({
        name: "choose_reasoning_background",
        arguments: {
          libraryId: draft.libraryId,
          expectedRevision: draft.revision,
          reasoningEffort: "max",
          path: system.imagePath,
        },
      })
    ).isError,
  ).toBe(true);
  await chooseFile(system);
  expectToolError(
    await client.callTool({
      name: "choose_reasoning_background",
      arguments: {
        libraryId: draft.libraryId,
        expectedRevision: draft.revision,
        reasoningEffort: "max",
      },
    }),
    "CANCELLED",
  );
  await chooseFile(system, system.unsafeImagePath);
  expectToolError(
    await client.callTool({
      name: "choose_reasoning_background",
      arguments: {
        libraryId: draft.libraryId,
        expectedRevision: draft.revision,
        reasoningEffort: "max",
      },
    }),
    "UNSAFE_IMAGE",
  );
  expect(await readTheme(client, draft.libraryId)).toEqual(draft);
  expect(await readTheme(client, source.libraryId)).toEqual(source);
  const final = await page.evaluate(() => window.codexStyle.getSnapshot());
  expect(final.ok).toBe(true);
  if (!final.ok) throw new Error("Final isolated snapshot unavailable");
  expect(final.data.selectedLibraryId).toBe(initial.data.selectedLibraryId);
  expect(
    final.data.themes.find((theme) => theme.libraryId === draft.libraryId)
      ?.status,
  ).toBe("draft");
});

test("MCP cancellation, client timeout, and STDIO close discard late picker results while keeping the operation gate", async ({
  system,
}) => {
  test.setTimeout(90_000);
  const observer = system.client;
  const draft = themeResult(
    await observer.callTool({
      name: "create_theme_draft",
      arguments: { name: "MCP 取消验收" },
    }),
  );
  for (const reason of ["cancel", "timeout", "disconnect"] as const) {
    const caller = await system.openClient();
    const abort = new AbortController();
    await system.application.evaluate(({ dialog }, path) => {
      const probe: PickerProbe = { calls: 0 };
      (globalThis as PickerGlobal).assistantBackgroundPicker = probe;
      dialog.showOpenDialog = () =>
        new Promise((resolveDialog) => {
          probe.calls += 1;
          probe.finish = (cancel) =>
            resolveDialog({
              canceled: cancel,
              filePaths: cancel ? [] : [path],
            });
        });
    }, system.imagePath);
    // 客户端短期限只验证 SDK 超时取消链，不伪装成插件固定 120 秒期限的计时验证。
    const pending = caller.callTool(
      {
        name: "choose_reasoning_background",
        arguments: {
          libraryId: draft.libraryId,
          expectedRevision: draft.revision,
          reasoningEffort: "max",
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
          () => (globalThis as PickerGlobal).assistantBackgroundPicker!.calls,
        ),
      )
      .toBe(1);
    if (reason === "cancel")
      abort.abort(new Error("Cancel isolated background picker"));
    if (reason === "disconnect") await caller.close();
    expect(await outcome).toBe("rejected");
    if (reason !== "disconnect") await caller.ping();
    expectToolError(
      await observer.callTool({
        name: "set_background_mode",
        arguments: {
          libraryId: draft.libraryId,
          expectedRevision: draft.revision,
          mode: "reasoning",
        },
      }),
      "OPERATION_BUSY",
    );
    expect(await readTheme(observer, draft.libraryId)).toEqual(draft);
    await system.application.evaluate(() =>
      (globalThis as PickerGlobal).assistantBackgroundPicker!.finish!(false),
    );
    // 被拒绝的锁探针无写入；首次成功的新建证明原选图已离开 operation gate，再核对未迟到写入。
    await expect
      .poll(async () => {
        const probe = await observer.callTool({
          name: "create_theme_draft",
          arguments: { name: `锁释放确认 ${reason}` },
        });
        if (probe.isError) expectToolError(probe, "OPERATION_BUSY");
        return !probe.isError;
      })
      .toBe(true);
    expect(await readTheme(observer, draft.libraryId)).toEqual(draft);
    await caller.close();
  }
});
