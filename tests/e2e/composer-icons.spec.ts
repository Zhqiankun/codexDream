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
      join(tmpdir(), `codexstyle-icons-${browserName}-`),
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

// Neutral colors and model-picker structure reduced from Store 26.1023.6123.0.
// Glyph geometry is illustrative; event handlers below only test hit targets.
const nativeCss = `
  html[data-theme="light"] { --color-text: #1a1c1f; --color-text-secondary: #6a6b6d; --color-text-tertiary: #8c8d8f; --color-codex-icon: #1a1c1f; }
  html[data-theme="dark"] { --color-text: #dfdfdf; --color-text-secondary: #999; --color-text-tertiary: #8c8c8c; --color-codex-icon: #dfdfdf; }
  html, body { margin: 0; font: 15px sans-serif; }
  main { padding: 48px; min-height: 300px; }
  button { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 18px; padding: 8px; background: transparent; color: var(--color-text); cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  button:focus-visible { outline: 2px solid #1682ff; outline-offset: 2px; }
  button:hover:not(:disabled) { background-color: #8882; }
  svg { width: 20px; height: 20px; flex-shrink: 0; }
  [data-composer-footer-responsive] { display: flex; align-items: center; gap: 10px; }
  [data-composer-surface-variant] { padding: 16px; }
  [contenteditable] { padding: 8px; margin-bottom: 16px; }
  .text-default { color: var(--color-text); }
  .text-secondary { color: var(--color-text-secondary); }
  .text-tertiary { color: var(--color-text-tertiary); }
  .text-codex-icon { color: var(--color-codex-icon); }
  .text-info { color: #1682ff; }
  .text-danger { color: #d32f2f; }
  .bg-primary-solid { background-color: #111; color: #fff; }
  ._Foreground_w220n_39 { color: var(--daybreak-text, var(--color-text)); }
  ._MutedForeground_w220n_43 { color: var(--daybreak-muted, var(--color-text-tertiary)); }
  :is(._ModelPickerTriggerLabel_13ikv_2, ._ModelPickerTriggerModelGroup_13ikv_2) > ._ModelPickerTriggerInlineModeIcon_13ikv_2 { color: var(--daybreak-text, var(--color-text)); }
`;
const plus =
  '<path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2"/>';
const mic =
  '<rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor"/><path d="M4 9a6 6 0 0 0 12 0M10 15v3" stroke="currentColor"/>';
const arrow = '<path d="m5 10 5-6 5 6h-4v7H9v-7z" fill="currentColor"/>';
const glyph = (id: string, classes: string, paths = plus) =>
  `<svg id="${id}" class="${classes}" viewBox="0 0 20 20" fill="none">${paths}</svg>`;
const toolbar = `<div id="toolbar" data-composer-footer-responsive>
  <button id="add" aria-label="添加文件">${glyph("add-icon", "text-default")}</button>
  <button id="permission" data-permission-mode="default">${glyph("permission-icon", "text-default")}帮助批准</button>
  <button id="model" data-codex-intelligence-trigger><span class="_ModelPickerTriggerModelGroup_13ikv_2">${glyph("model-icon", "_ModelPickerTriggerInlineModeIcon_13ikv_2", arrow)}<span>GPT-6 Astra Max</span></span>${glyph("chevron", "text-tertiary", '<path d="m5 8 5 5 5-5" stroke="currentColor"/>')}</button>
  <button id="dictation" aria-label="听写">${glyph("mic-icon", "icon-leading text-default", mic)}</button>
  <button id="voice" class="bg-primary-solid" aria-label="开始语音">${glyph("voice-icon", "icon-primary-action", '<path d="M4 8v4m4-7v10m4-12v14m4-9v4" stroke="currentColor" stroke-width="2"/>')}</button>
  <button id="send" class="bg-primary-solid" aria-label="Send">${glyph("send-icon", "text-default", arrow)}</button>
  <button id="disabled" disabled>${glyph("disabled-icon", "text-secondary")}</button>
  <button id="info">${glyph("info-icon", "text-info")}</button>
  <button id="multicolor">${glyph("multicolor-icon", "text-default", '<path id="fixed-fill" d="M2 2h7v16H2z" fill="#12ab34"/><path d="M11 2h7v16h-7z" fill="currentColor"/>')}</button>
  <div role="menu"><button>${glyph("menu-icon", "text-default")}</button></div>
  <div data-codexstyle-owner="other"><button>${glyph("foreign-icon", "text-default")}</button></div>
</div>`;

const palettes = [
  {
    name: "dark",
    native: "light",
    background: "#100b03",
    secondary: "#edbd57",
    accent: "#ffc65c",
    accentText: "#241600",
  },
  {
    name: "light",
    native: "dark",
    background: "#fff6df",
    secondary: "#654406",
    accent: "#805600",
    accentText: "#ffffff",
  },
] as const;

for (const palette of palettes) {
  for (const mode of ["configured", "advanced"] as const) {
    test(`composer icons inherit their control in ${palette.name} ${mode}`, async ({
      shell,
    }, testInfo) => {
      await shell.setContent(
        `<!doctype html><html data-theme="${palette.native}"><head><style>${nativeCss}</style></head><body><main class="main-surface"><div data-codex-composer-root><div data-composer-surface-variant="default"><div data-composer-layout><div data-codex-composer contenteditable="true">和 Codex 一起工作</div>${toolbar}</div></div></div></main><button id="outside">${glyph("outside-icon", "text-default")}</button></body></html>`,
      );
      const preserved = () =>
        shell
          .locator("#info-icon, #menu-icon, #foreign-icon, #outside-icon")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              color: getComputedStyle(node).color,
              fill: getComputedStyle(node).fill,
            })),
          );
      const before = await preserved();
      const config = readThemeConfiguration({});
      config.appearance = palette.name;
      config.styleConfig.mode = mode;
      Object.assign(config.colors, {
        background: palette.background,
        panelAlt: palette.background,
        secondary: palette.secondary,
        accent: palette.accent,
        accentText: palette.accentText,
        composerText: palette.secondary,
      });
      const css =
        mode === "configured"
          ? generateConfiguredCss(config.styleConfig)
          : `
        [data-ds-part="main"], [data-ds-part="composer"] { background: var(--ds-theme-color-panel-alt); }
        [data-ds-part="composer-toolbar"] button { color: var(--ds-theme-color-secondary); }
        [data-ds-part="composer-toolbar"] [data-permission-mode] { color: var(--ds-theme-color-accent); }
        [data-ds-part="composer-submit"] { background: var(--ds-theme-color-accent); color: var(--ds-theme-color-accent-text) !important; }
      `;
      expect(
        await shell.evaluate(
          buildThemePayload("codexstyle-icons-test", css, "", {
            ...config,
            backgroundScope: "window",
            sidebarOverlayOpacity: 0,
          }),
        ),
      ).toBe(true);
      const controlColor = (selector: string) =>
        shell
          .locator(selector)
          .evaluate((node) => getComputedStyle(node).color);
      const secondary = await controlColor("#add");
      for (const id of [
        "add-icon",
        "model-icon",
        "chevron",
        "mic-icon",
        "disabled-icon",
        "multicolor-icon",
      ]) {
        await expect(shell.locator(`#${id}`)).toHaveCSS("color", secondary);
      }
      await expect(shell.locator("#permission-icon")).toHaveCSS(
        "color",
        await controlColor("#permission"),
      );
      await expect(shell.locator("#send-icon")).toHaveCSS(
        "color",
        await controlColor("#send"),
      );
      await expect(shell.locator("#voice-icon")).toHaveCSS(
        "color",
        await controlColor("#voice"),
      );
      expect(await controlColor("#send")).not.toBe(secondary);
      expect(await preserved()).toEqual(before);
      await expect(shell.locator("#fixed-fill")).toHaveCSS(
        "fill",
        "rgb(18, 171, 52)",
      );
      await expect(shell.locator("#disabled")).toHaveCSS("opacity", "0.4");
      await expect(shell.locator("#disabled")).toBeDisabled();

      // Exercise genuine DOM hit/focus behavior without invoking official services.
      await shell.evaluate(() =>
        document
          .querySelector("#add")
          ?.addEventListener("click", () =>
            document
              .querySelector("#add")
              ?.setAttribute("data-clicked", "true"),
          ),
      );
      await shell.locator("#add").focus();
      await expect(shell.locator("#add")).toHaveCSS("outline-style", "solid");
      await shell.keyboard.press("Enter");
      await expect(shell.locator("#add")).toHaveAttribute(
        "data-clicked",
        "true",
      );
      await shell.locator("#dictation").hover();
      await expect(shell.locator("#mic-icon")).toHaveCSS("color", secondary);

      // State changes and new neutral icons inherit immediately, with no remap.
      const dynamic = await shell.evaluate(
        ({ glyph }) => {
          const button = document.querySelector("#dictation")!;
          button.innerHTML = glyph;
          return getComputedStyle(button.querySelector("svg")!).color;
        },
        { glyph: glyph("voice-mic", "shrink-0 text-codex-icon", mic) },
      );
      expect(dynamic).toBe(secondary);
      await shell
        .locator("#voice-mic")
        .evaluate((node) =>
          node.setAttribute("class", "icon-leading _MutedForeground_w220n_43"),
        );
      await expect(shell.locator("#voice-mic")).toHaveCSS("color", secondary);
      await shell
        .locator("#voice-mic")
        .evaluate((node) =>
          node.setAttribute("class", "icon-leading text-danger"),
        );
      await expect(shell.locator("#voice-mic")).toHaveCSS(
        "color",
        "rgb(211, 47, 47)",
      );
      await shell
        .locator("#voice-mic")
        .evaluate((node) =>
          node.setAttribute("class", "icon-leading _Foreground_w220n_39"),
        );
      await expect(shell.locator("#voice-mic")).toHaveCSS("color", secondary);
      await shell
        .locator("main")
        .screenshot({ path: testInfo.outputPath("composer.png") });

      await shell.locator("#toolbar").evaluate((node, html) => {
        node.outerHTML = html;
      }, toolbar);
      await expect(shell.locator("#add-icon")).toHaveCSS("color", secondary);
      // CSS scope must stop immediately even for attributes the mapper does not watch.
      const detachedColor = await shell
        .locator("[data-codex-composer-root]")
        .evaluate((node) => {
          node.removeAttribute("data-codex-composer-root");
          const color = getComputedStyle(
            node.querySelector("#add-icon")!,
          ).color;
          node.setAttribute("data-codex-composer-root", "");
          return color;
        });
      expect(detachedColor).toBe(before[3].color);
      await shell
        .locator("#toolbar")
        .evaluate((node) => document.body.appendChild(node));
      await expect(shell.locator("#toolbar")).not.toHaveAttribute(
        "data-ds-part",
        "composer-toolbar",
      );
      await expect(shell.locator("#add-icon")).toHaveCSS(
        "color",
        before[3].color,
      );
    });
  }
}

test("disabled composer recipe retains native icon colors", async ({
  shell,
}) => {
  await shell.setContent(
    `<html data-theme="light"><head><style>${nativeCss}</style></head><body><main class="main-surface"><div data-codex-composer-root>${toolbar}</div></main></body></html>`,
  );
  const colors = () =>
    shell
      .locator("svg")
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).color),
      );
  const before = await colors();
  const config = readThemeConfiguration({});
  config.styleConfig.mode = "configured";
  config.styleConfig.recipes.composer = false;
  expect(
    await shell.evaluate(
      buildThemePayload(
        "codexstyle-icons-test",
        generateConfiguredCss(config.styleConfig),
        "",
        { ...config, backgroundScope: "window", sidebarOverlayOpacity: 0 },
      ),
    ),
  ).toBe(true);
  expect(await colors()).toEqual(before);
});
