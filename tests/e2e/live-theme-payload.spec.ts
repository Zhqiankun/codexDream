import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  generateConfiguredCss,
  readThemeConfiguration,
} from "../../src/contracts";
import {
  buildThemePayload,
  type ThemePayloadSettings,
} from "../../src/main/session/theme-payload";

const marker = "codexstyle-live-payload-test";
const test = base.extend<{ shell: Page }>({
  shell: async ({ browserName }, use) => {
    const prefix = `codexstyle-live-${browserName}-`;
    const profile = await mkdtemp(join(tmpdir(), prefix));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[0] !== "ELECTRON_RUN_AS_NODE",
      ),
    );
    const application = await electron.launch({
      executablePath: resolve("node_modules/electron/dist/electron.exe"),
      args: [resolve("tests/fixtures/theme-payload-shell.cjs")],
      env: {
        ...env,
        CODEXSTYLE_TEST_USER_DATA: profile,
        CODEXSTYLE_TEST_OFFSCREEN: "1",
      },
    });
    try {
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(
          false,
        ),
      );
      await use(await application.firstWindow());
    } finally {
      await application.close();
      if (
        dirname(resolve(profile)) !== resolve(tmpdir()) ||
        !basename(profile).startsWith(prefix)
      )
        throw new Error("Unexpected test profile");
      await rm(profile, { recursive: true, force: true });
    }
  },
});

function configuration(
  mode: "configured" | "advanced",
  light: boolean,
): ThemePayloadSettings {
  const base = readThemeConfiguration({});
  return {
    ...base,
    appearance: light ? "light" : "dark",
    backgroundScope: "window",
    sidebarOverlayOpacity: 0,
    art: { ...base.art, safeArea: "none", taskMode: "full" },
    colors: {
      ...base.colors,
      background: light ? "#fcf6df" : "#071b2c",
      assistantMessageText: light ? "#634209" : "#67d5ef",
      text: light ? "#372815" : "#eff9fc",
      panel: light ? "#e6d9bd" : "#112a35",
      panelAlt: light ? "#f8ebd0" : "#132432",
      assistantPanel: light ? "#f8ebd0" : "#142b40",
      sidebarText: light ? "#372815" : "#eff9fc",
      topBarText: light ? "#372815" : "#eff9fc",
    },
    styleConfig: { ...base.styleConfig, mode, blur: 0, radius: 12 },
  };
}

function expression(settings: ThemePayloadSettings, image: string) {
  const css =
    settings.styleConfig.mode === "configured"
      ? generateConfiguredCss(settings.styleConfig)
      : '[data-ds-part="message"] { border-radius: 37px; }';
  return buildThemePayload(marker, css, image, settings);
}

async function imageData(color: string) {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: color },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function rgb(hex: string) {
  return `rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`;
}

const content = `<!doctype html><html><head><style>
  html, body { margin: 0; font: 16px sans-serif; }
  main { margin-left: 150px; padding: 20px; }
  aside { position: fixed; inset: 0 auto 0 0; width: 130px; }
  #scroll { height: 120px; overflow: auto; }
  #answer { padding: 12px; }
</style></head><body>
  <aside class="app-shell-left-panel">主题侧栏</aside>
  <main class="main-surface" role="main">
    <header class="app-header-tint">当前会话</header>
    <div class="thread-scroll-container"><div id="answer" data-markdown-text-style="assistant-message">当前回答</div></div>
    <textarea id="draft" aria-label="待发送草稿"></textarea>
    <div id="scroll"><div style="height: 2000px">保留滚动位置</div></div>
    <header id="foreign" data-codexstyle-owner="foreign" style="color: rgb(180, 15, 50)">独立区域</header>
  </main>
</body></html>`;

test("consecutive saves replace colors, artwork and mode while preserving page state", async ({
  shell,
}, testInfo) => {
  await shell.setContent(content);
  await shell.evaluate(() => {
    const NativeObserver = window.MutationObserver;
    const state = { activeObservers: 0 };
    (
      window as Window & { livePayloadCounters?: typeof state }
    ).livePayloadCounters = state;
    window.MutationObserver = class extends NativeObserver {
      private watching = false;
      override observe(target: Node, options?: MutationObserverInit) {
        if (!this.watching) state.activeObservers++;
        this.watching = true;
        super.observe(target, options);
      }
      override disconnect() {
        if (this.watching) state.activeObservers--;
        this.watching = false;
        super.disconnect();
      }
    };
    const draft = document.querySelector<HTMLTextAreaElement>("#draft")!;
    draft.value = "尚未发送的草稿";
    draft.focus();
    draft.setSelectionRange(2, 5);
    document.querySelector("#scroll")!.scrollTop = 240;
  });
  const images = await Promise.all([
    imageData("#07566d"),
    imageData("#d6aa52"),
  ]);
  const updates = [
    configuration("configured", false),
    {
      ...configuration("configured", true),
      art: {
        ...configuration("configured", true).art,
        taskMode: "off" as const,
      },
    },
    {
      ...configuration("advanced", false),
      backgroundScope: "content" as const,
    },
    configuration("configured", true),
  ];
  for (const [index, settings] of updates.entries()) {
    const image = images[index % images.length];
    expect(
      await shell.evaluate(
        async (source) => {
          document
            .querySelector("main")!
            .classList.toggle("native-layout-change");
          // 让旧观察器已收到 mutation 且仍有批次待执行，再进行保存替换。
          await Promise.resolve();
          return window.eval(source);
        },
        expression(settings, image),
      ),
    ).toBe(true);
    await expect(shell.locator("#answer")).toHaveCSS(
      "color",
      rgb(settings.colors.assistantMessageText),
    );
    await expect(shell.locator("html")).toHaveAttribute(
      "data-codexstyle-appearance",
      settings.appearance,
    );
    const background =
      settings.backgroundScope === "window"
        ? shell.locator("body")
        : shell.locator("main");
    if (settings.art.taskMode === "off")
      await expect(background).toHaveCSS("background-image", "none");
    else
      await expect(background).toHaveCSS(
        "background-image",
        new RegExp(image.split(",")[1]!.replace(/[+]/g, "\\+")),
      );
    if (settings.styleConfig.mode === "advanced")
      await expect(shell.locator("#answer")).toHaveCSS("border-radius", "37px");
    await shell.waitForTimeout(140);
    await expect(shell.locator("#answer")).toHaveCSS(
      "color",
      rgb(settings.colors.assistantMessageText),
    );
    expect(
      await shell.evaluate(() => {
        const draft = document.querySelector<HTMLTextAreaElement>("#draft")!;
        return {
          value: draft.value,
          selection: [draft.selectionStart, draft.selectionEnd],
          focused: document.activeElement === draft,
          scroll: document.querySelector("#scroll")!.scrollTop,
          styles: document.querySelectorAll("style[data-codexstyle-style]")
            .length,
          observers: (
            window as Window & {
              livePayloadCounters?: { activeObservers: number };
            }
          ).livePayloadCounters!.activeObservers,
        };
      }),
    ).toEqual({
      value: "尚未发送的草稿",
      selection: [2, 5],
      focused: true,
      scroll: 240,
      styles: 1,
      observers: 1,
    });
    await expect(shell.locator("#foreign")).toHaveAttribute(
      "data-codexstyle-owner",
      "foreign",
    );
    await expect(shell.locator("#foreign")).not.toHaveAttribute("data-ds-part");
    await expect(shell.locator("#foreign")).toHaveCSS(
      "color",
      "rgb(180, 15, 50)",
    );
  }
  await shell.evaluate(() =>
    document
      .querySelector(".thread-scroll-container")!
      .insertAdjacentHTML(
        "beforeend",
        '<div id="new-answer" data-markdown-text-style="assistant-message">新增回答</div>',
      ),
  );
  await expect(shell.locator("#new-answer")).toHaveCSS(
    "color",
    rgb(updates.at(-1)!.colors.assistantMessageText),
  );
  await shell.screenshot({ path: testInfo.outputPath("saved-theme.png") });
});

test("registered replacement scripts install the latest theme after a real document reload", async ({
  shell,
}) => {
  const client = await shell.context().newCDPSession(shell);
  await client.send("Page.enable");
  const before = configuration("configured", false);
  const after = configuration("configured", true);
  const oldScript = await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__liveThemeRootAtStart = Boolean(document.documentElement);\n${expression(before, "")}`,
  });
  await shell.reload({ waitUntil: "domcontentloaded" });
  expect(
    await shell.evaluate(
      () =>
        (window as Window & { __liveThemeRootAtStart?: boolean })
          .__liveThemeRootAtStart,
    ),
  ).toBe(false);
  await expect(shell.locator("html")).toHaveAttribute(
    "data-codexstyle-owner",
    marker,
  );
  const nextScript = await client.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: expression(after, "") },
  );
  await client.send("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: oldScript.identifier,
  });
  expect(await shell.evaluate(expression(after, ""))).toBe(true);
  await shell.reload({ waitUntil: "domcontentloaded" });
  await expect(shell.locator("html")).toHaveAttribute(
    "data-codexstyle-appearance",
    "light",
  );
  await expect(shell.locator("style[data-codexstyle-style]")).toHaveCount(1);
  expect(
    await shell.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ds-theme-color-text")
        .trim(),
    ),
  ).toBe(after.colors.text);
  await client.send("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: nextScript.identifier,
  });
  await client.detach();
});

test("an existing foreign root rejects a save without rewriting its DOM or styles", async ({
  shell,
}) => {
  await shell.setContent(content);
  const payload = expression(configuration("configured", false), "");
  expect(await shell.evaluate(payload)).toBe(true);
  const before = await shell.evaluate(() => {
    document.documentElement.setAttribute(
      "data-codexstyle-owner",
      "foreign-root",
    );
    return document.documentElement.outerHTML;
  });
  expect(
    await shell.evaluate(expression(configuration("configured", true), "")),
  ).toBe(false);
  expect(await shell.evaluate(() => document.documentElement.outerHTML)).toBe(
    before,
  );
});
