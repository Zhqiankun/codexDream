import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  generateConfiguredCss,
  readThemeConfiguration,
} from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

const test = base.extend<{ shell: Page }>({
  shell: async ({ browserName }, use) => {
    const profile = await mkdtemp(
      join(tmpdir(), `codexstyle-foreground-${browserName}-`),
    );
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
      await rm(profile, { recursive: true, force: true });
    }
  },
});

const palettes = [
  {
    name: "dark",
    native: "light",
    background: "#090705",
    text: "#fff8eb",
    muted: "#c8b8a6",
    secondary: "#edd9b1",
    expectedText: "rgb(255, 248, 235)",
    expectedMuted: "rgb(200, 184, 166)",
    expectedSecondary: "rgb(237, 217, 177)",
  },
  {
    name: "light",
    native: "dark",
    background: "#faf3e7",
    text: "#281b08",
    muted: "#705a40",
    secondary: "#64502e",
    expectedText: "rgb(40, 27, 8)",
    expectedMuted: "rgb(112, 90, 64)",
    expectedSecondary: "rgb(100, 80, 46)",
  },
] as const;
type Palette = (typeof palettes)[number];

// Reduced independently from Store 26.1023.6123.0. Keep native foreground,
// hover and visibility rules here rather than deriving them from our selectors.
// Fixture event handlers exercise hit targets, not official copying/navigation.
const nativeCss = `
  html[data-theme="light"] { --color-text: #1a1c1f; --color-text-secondary: #6a6b6d; --color-text-tertiary: #8c8d8f; --color-codex-description: #8c8d8f; --color-surface: #fff; }
  html[data-theme="dark"] { --color-text: #dfdfdf; --color-text-secondary: #999; --color-text-tertiary: #8c8c8c; --color-codex-description: #8c8c8c; --color-surface: #181818; }
  html, body { margin: 0; min-height: 100%; font: 16px sans-serif; }
  main { min-height: 700px; padding: 48px; background: var(--color-surface); }
  button { font: inherit; background: transparent; border: 0; padding: 8px; cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 2px solid #1682ff; outline-offset: 2px; }
  button:disabled { opacity: .4; cursor: default; }
  .text-codex-description { color: var(--color-codex-description); }
  .text-default { color: var(--color-text); }
  .text-secondary { color: var(--color-text-secondary); }
  .text-tertiary { color: var(--color-text-tertiary); }
  .text-danger { color: #b42318; } .text-warning { color: #996600; }
  .text-info, a { color: #0969da; }
  .bg-surface { background: var(--color-surface); }
  .bg-primary-solid { background: #172330; color: #fff; }
  [class~="hover:text-default"]:hover { color: var(--color-text); }
  [class~="hover:bg-primary-ghost-hover"]:hover { background: #8882; }
  ._shell_1vs63_2 { position: sticky; top: 0; z-index: 1; }
  ._shell_1vs63_2::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--color-surface); }
  ._headerRow_1vs63_2 { display: flex; gap: 24px; align-items: center; }
  ._title_1vs63_2 { flex: 1; } h1 { font-size: 28px; }
  ._actions_1vs63_2 { display: flex; gap: 8px; } input { color: var(--color-text); background: transparent; }
  [class~="group/home-suggestion-list-item"] { position: relative; margin: 8px 0; }
  [data-composer-mode][class~="text-start"] { display: flex; align-items: center; text-align: start; width: 100%; padding: 12px; }
  .relative { position: relative; } .overlay { position: absolute; inset: 0; }
  [class~="pointer-events-none"] { pointer-events: none; } .pointer-events-auto { pointer-events: auto; }
  .turn-action-controls > div { display: flex; gap: 8px; }
  [class~="opacity-0"] { opacity: 0; }
  .group:hover [class~="group-hover:opacity-100"], .group:focus-within [class~="group-focus-within:opacity-100"] { opacity: 1; }
  .turn-action-controls svg { width: 20px; height: 20px; }
  #outside { margin: 16px; padding: 12px; background: var(--color-surface); }
`;
const ghost =
  "no-drag cursor-interaction border-transparent text-tertiary hover:bg-primary-ghost-hover";
const icon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="7" y="7" width="12" height="12" rx="2"/><path d="M15 7V3H3v12h4"/></svg>';

const headerMarkup = `<section id="header-host" data-app-shell-inline-page-header><div>
  <div id="page-header" data-sticky class="_shell_1vs63_2"><div class="_content_1vs63_2"><div class="_headerRow_1vs63_2">
    <div class="_title_1vs63_2"><div class="_titleContent_1vs63_2">
      <h1 id="page-title" class="flex min-h-9 items-center text-default"><span>插件</span> <span class="text-warning" data-preserve>提示</span></h1>
      <div id="page-description" class="text-base leading-6 text-secondary">查找与管理 <strong>你的插件</strong> <a href="#help" data-preserve>帮助</a></div>
    </div></div>
    <div class="_actions_1vs63_2"><label class="bg-surface text-default" data-preserve><input aria-label="搜索" value="demo" data-preserve></label><button id="page-create" class="bg-primary-solid" data-preserve>创建</button></div>
  </div></div></div>
</div></section>`;

const homeMarkup = `<div data-testid="home-icon"></div><h1>有什么可以帮忙的？</h1>
  <section id="suggestions" class="group/home-suggestions">
    <p id="suggestion-caption" class="mb-1 px-1 text-sm text-codex-description">建议从这里开始</p>
    <div id="suggestion-row" class="group/home-suggestion-list-item relative"><button id="suggestion" type="button" data-composer-mode="work" class="flex w-full items-center text-start text-size-chat text-codex-description hover:text-default"><span>检查最近的代码改动</span><span class="text-info" data-preserve>链接状态</span></button></div>
    <div class="group/home-suggestion-list-item relative"><div class="relative"><button id="overlay-hit" class="overlay" data-composer-mode="work" aria-label="复杂建议"></button><div id="suggestion-overlay" data-composer-mode="work" class="flex text-start text-size-chat text-codex-description pointer-events-none relative"><span>带独立操作的建议</span><button class="pointer-events-auto bg-primary-solid text-default" data-preserve>独立操作</button></div></div></div>
    <div class="group/home-suggestion-list-item relative"><button id="suggestion-primary" data-composer-mode="work" class="flex text-start text-size-chat text-default">主要建议</button></div>
    <button id="home-card" class="bg-surface"><span class="text-secondary">独立首页卡片</span></button>
    <div data-codexstyle-owner="other"><div class="group/home-suggestion-list-item"><button data-composer-mode="work" class="text-start text-size-chat text-codex-description" data-preserve>其他 owner 建议</button></div></div>
  </section>`;

const actionMarkup = `<div class="thread-scroll-container"><article id="turn" class="group">
  <div data-markdown-text-style="assistant-message"><p>这是已完成的助手回答。</p></div>
  <div id="action-bar" class="mt-1.5 flex turn-action-controls"><div id="action-visibility" class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
    <button id="copy" type="button" class="${ghost}" aria-label="复制">${icon}</button>
    <button class="${ghost} text-danger" data-preserve aria-label="语义操作">${icon}</button>
    <button class="${ghost} bg-primary-solid text-default" data-preserve>主要操作</button>
    <button class="${ghost} bg-surface text-default" data-preserve>独立表面</button>
    <button class="${ghost}" data-codexstyle-owner="other" data-preserve>其他 owner</button>
    <div class="bg-surface"><button class="${ghost}" data-preserve>嵌套操作</button></div>
  </div></div>
</article></div>`;

async function load(
  page: Page,
  palette: Palette,
  markup: string,
  outside: string,
) {
  await page.setContent(
    `<!doctype html><html data-theme="${palette.native}"><head><style>${nativeCss}</style></head><body><main class="main-surface" role="main">${markup}</main><aside id="outside">${outside}</aside></body></html>`,
  );
}

async function preserved(page: Page) {
  return page.locator("[data-preserve]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        color: style.color,
        fill: style.webkitTextFillColor,
        background: style.backgroundColor,
      };
    }),
  );
}

async function applyTheme(
  page: Page,
  palette: Palette,
  mode: "configured" | "advanced",
) {
  const config = readThemeConfiguration({});
  config.appearance = palette.name;
  config.art.taskMode = "full";
  config.art.safeArea = "none";
  config.styleConfig.mode = mode;
  Object.assign(config.colors, {
    background: palette.background,
    text: palette.text,
    muted: palette.muted,
    secondary: palette.secondary,
    // Deliberately distinct: page controls must not inherit card/bubble colors.
    homeCardText: "#8f172c",
    homeTitleText: "#cd6980",
    assistantMessageText: "#123456",
    assistantPanel: "#eef1f5",
  });
  const css =
    mode === "configured"
      ? generateConfiguredCss(config.styleConfig)
      : '[data-ds-part="root"] { color: var(--ds-theme-color-text); } [data-ds-part="main"] { background: var(--ds-theme-color-background); }';
  expect(
    await page.evaluate(
      buildThemePayload("codexstyle-foreground-test", css, "", {
        ...config,
        backgroundScope: "window",
        sidebarOverlayOpacity: 0,
      }),
    ),
  ).toBe(true);
}

for (const palette of palettes) {
  for (const mode of ["configured", "advanced"] as const) {
    test(`page headings follow ${palette.name} ${mode}`, async ({
      shell,
    }, testInfo) => {
      await load(
        shell,
        palette,
        headerMarkup,
        '<h1 class="text-default" data-preserve>范围外标题</h1><div class="text-secondary" data-preserve>范围外说明</div>',
      );
      const before = await preserved(shell);
      const nativeText = await shell
        .locator("#page-title")
        .evaluate((node) => getComputedStyle(node).color);
      const nativeMuted = await shell
        .locator("#page-description")
        .evaluate((node) => getComputedStyle(node).color);
      await applyTheme(shell, palette, mode);
      await expect(shell.locator("#page-title")).toHaveCSS(
        "color",
        palette.expectedText,
      );
      await expect(shell.locator("#page-title > span:first-child")).toHaveCSS(
        "color",
        palette.expectedText,
      );
      await expect(shell.locator("#page-description")).toHaveCSS(
        "color",
        palette.expectedMuted,
      );
      await expect(shell.locator("#page-description strong")).toHaveCSS(
        "color",
        palette.expectedMuted,
      );
      expect(await preserved(shell)).toEqual(before);
      expect(
        await shell
          .locator("#page-header")
          .evaluate(
            (node) => getComputedStyle(node, "::before").backgroundColor,
          ),
      ).toBe("rgba(0, 0, 0, 0)");
      await shell.getByRole("textbox", { name: "搜索" }).fill("new query");
      await expect(shell.getByRole("textbox", { name: "搜索" })).toHaveValue(
        "new query",
      );
      await shell
        .locator("#page-create")
        .evaluate((node) =>
          node.addEventListener("click", () =>
            node.setAttribute("data-clicked", "true"),
          ),
        );
      await shell.locator("#page-create").focus();
      await shell.keyboard.press("Enter");
      await expect(shell.locator("#page-create")).toHaveAttribute(
        "data-clicked",
        "true",
      );
      await shell.screenshot({ path: testInfo.outputPath("headings.png") });

      const inserted = await shell.locator("#page-header").evaluate((node) => {
        const replacement = node.cloneNode(true) as HTMLElement;
        node.replaceWith(replacement);
        replacement.querySelector("#page-description")!.remove();
        replacement.insertAdjacentHTML(
          "afterend",
          '<div class="contents"><div id="below-description" class="text-base leading-6 text-secondary"><div class="max-w-lg -translate-y-1.5">移至标题下方的说明</div></div></div>',
        );
        return {
          title: getComputedStyle(replacement.querySelector("h1")!).color,
          subtitle: getComputedStyle(
            document.querySelector("#below-description")!,
          ).color,
        };
      });
      expect(inserted).toEqual({
        title: palette.expectedText,
        subtitle: palette.expectedMuted,
      });
      const reverted = await shell.locator("#page-header").evaluate((node) => {
        node.removeAttribute("data-sticky");
        return {
          title: getComputedStyle(node.querySelector("h1")!).color,
          subtitle: getComputedStyle(
            document.querySelector("#below-description")!,
          ).color,
        };
      });
      expect(reverted).toEqual({ title: nativeText, subtitle: nativeMuted });
      await shell
        .locator("#page-header")
        .evaluate((node) => node.setAttribute("data-sticky", ""));
      await shell
        .locator("#header-host")
        .evaluate((node) =>
          node.setAttribute("data-codexstyle-owner", "other"),
        );
      await expect(shell.locator("#page-title")).toHaveCSS("color", nativeText);
      await expect(shell.locator("#below-description")).toHaveCSS(
        "color",
        nativeMuted,
      );
    });

    test(`home lists follow ${palette.name} ${mode}`, async ({
      shell,
    }, testInfo) => {
      await load(
        shell,
        palette,
        homeMarkup,
        '<div class="group/home-suggestion-list-item"><button data-composer-mode="work" class="text-start text-size-chat text-codex-description" data-preserve>范围外建议</button></div><p class="text-codex-description" data-preserve>范围外说明</p>',
      );
      const before = await preserved(shell);
      const nativeText = await shell
        .locator("#suggestion")
        .evaluate((node) => getComputedStyle(node).color);
      await applyTheme(shell, palette, mode);
      for (const selector of [
        "#suggestion",
        "#suggestion-caption",
        "#suggestion-overlay",
      ])
        await expect(shell.locator(selector)).toHaveCSS(
          "color",
          palette.expectedMuted,
        );
      await expect(shell.locator("#suggestion-primary")).toHaveCSS(
        "color",
        palette.expectedText,
      );
      await expect(shell.locator("#home-card span")).toHaveCSS(
        "color",
        "rgb(143, 23, 44)",
      );
      expect(await preserved(shell)).toEqual(before);
      await shell.locator("#suggestion").hover();
      await expect(shell.locator("#suggestion")).toHaveCSS(
        "color",
        palette.expectedText,
      );
      await shell
        .locator("#suggestion")
        .evaluate((node) =>
          node.addEventListener("click", () =>
            node.setAttribute("data-clicked", "true"),
          ),
        );
      await shell.locator("#suggestion").click();
      await expect(shell.locator("#suggestion")).toHaveAttribute(
        "data-clicked",
        "true",
      );
      await shell.mouse.move(1, 1);
      await shell
        .locator("#overlay-hit")
        .evaluate((node) =>
          node.addEventListener("click", () =>
            node.setAttribute("data-clicked", "true"),
          ),
        );
      await shell.locator("#overlay-hit").focus();
      await shell.keyboard.press("Enter");
      await expect(shell.locator("#overlay-hit")).toHaveAttribute(
        "data-clicked",
        "true",
      );
      await expect(shell.locator("#overlay-hit")).toHaveCSS(
        "outline-style",
        "solid",
      );
      await shell
        .locator("#suggestion")
        .evaluate((node) => node.setAttribute("disabled", ""));
      await expect(shell.locator("#suggestion")).toBeDisabled();
      await expect(shell.locator("#suggestion")).toHaveCSS("opacity", "0.4");
      await shell.screenshot({ path: testInfo.outputPath("home-list.png") });

      const inserted = await shell
        .locator("#suggestion-row")
        .evaluate((node) => {
          const replacement = node.cloneNode(true) as HTMLElement;
          node.replaceWith(replacement);
          return getComputedStyle(replacement.querySelector("button")!).color;
        });
      expect(inserted).toBe(palette.expectedMuted);
      const reverted = await shell
        .locator("#suggestion-row")
        .evaluate((node) => {
          node.classList.remove("group/home-suggestion-list-item");
          return getComputedStyle(node.querySelector("button")!).color;
        });
      expect(reverted).toBe(nativeText);
    });

    test(`answer controls follow ${palette.name} ${mode}`, async ({
      shell,
    }, testInfo) => {
      await load(
        shell,
        palette,
        actionMarkup,
        `<div class="turn-action-controls"><div><button class="${ghost}" data-preserve>范围外操作</button></div></div>`,
      );
      const before = await preserved(shell);
      const nativeText = await shell
        .locator("#copy")
        .evaluate((node) => getComputedStyle(node).color);
      await applyTheme(shell, palette, mode);
      await expect(shell.locator("#copy")).toHaveCSS(
        "color",
        palette.expectedSecondary,
      );
      await expect(shell.locator("#copy svg")).toHaveCSS(
        "stroke",
        palette.expectedSecondary,
      );
      await expect(shell.locator("#action-visibility")).toHaveCSS(
        "opacity",
        "0",
      );
      expect(await preserved(shell)).toEqual(before);
      await shell.locator("#turn").hover();
      await expect(shell.locator("#action-visibility")).toHaveCSS(
        "opacity",
        "1",
      );
      await shell.mouse.move(1060, 760);
      await expect(shell.locator("#action-visibility")).toHaveCSS(
        "opacity",
        "0",
      );
      await shell.locator("#copy").evaluate((node) =>
        node.addEventListener("click", () => {
          node.classList.add("text-default");
          node.setAttribute("aria-label", "已复制");
          node.setAttribute("data-clicked", "true");
        }),
      );
      await shell.locator("#copy").focus();
      await expect(shell.locator("#action-visibility")).toHaveCSS(
        "opacity",
        "1",
      );
      await expect(shell.locator("#copy")).toHaveCSS("outline-style", "solid");
      await shell.keyboard.press("Enter");
      await expect(shell.locator("#copy")).toHaveAttribute(
        "data-clicked",
        "true",
      );
      await expect(shell.locator("#copy")).toHaveCSS(
        "color",
        palette.expectedText,
      );
      await shell.screenshot({
        path: testInfo.outputPath("answer-controls.png"),
      });
      await shell
        .locator("#copy")
        .evaluate((node) => node.setAttribute("disabled", ""));
      await expect(shell.locator("#copy")).toBeDisabled();
      await expect(shell.locator("#copy")).toHaveCSS("opacity", "0.4");

      const inserted = await shell.locator("#action-bar").evaluate((node) => {
        const replacement = node.cloneNode(true) as HTMLElement;
        node.replaceWith(replacement);
        const button = replacement.querySelector("#copy")!;
        button.classList.remove("text-default");
        return getComputedStyle(button).color;
      });
      expect(inserted).toBe(palette.expectedSecondary);
      const reverted = await shell.locator("#action-bar").evaluate((node) => {
        node.classList.remove("turn-action-controls");
        return getComputedStyle(node.querySelector("#copy")!).color;
      });
      expect(reverted).toBe(nativeText);
    });
  }
}
