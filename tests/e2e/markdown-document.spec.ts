import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readThemeConfiguration } from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

// Store 26.901.2854.0 uses an inset viewport around CodeMirror for Markdown
// previews. Its transparent editor and local semantic tokens are reproduced
// here, including source mode's different renderer and unrelated editors.
const documentPage = `<!doctype html><html><head><style>
  :root { --color-text: #fafafa; --color-text-secondary: #ccc;
    --color-text-tertiary: #aaa; --color-text-info: #89b4ff;
    --color-codex-editor-inline-code-background: #333;
    --color-codex-editor-inline-code-foreground: #fafafa;
    --color-background-secondary-soft-alpha: rgba(255,255,255,.06);
    --color-surface-secondary: #222; --color-codex-description: #aaa;
    --color-background-info-soft: #123; --color-background-info-surface: #234; }
  body { margin: 0; font: 16px system-ui; }
  main { height: 720px; padding: 12px; }
  #viewer { height: 560px; position: relative; }
  [data-editor-search-surface] { position: absolute; inset: 0; overflow: hidden; }
  .cm-editor { height: 100%; color: var(--color-text); background: transparent; }
  .cm-scroller { height: 100%; overflow: auto; }
  .cm-content { min-height: 100%; padding: 16px; box-sizing: border-box; }
  .file-editor-heading { color: var(--color-text); font-weight: 600; font-size: 24px; }
  .quote { color: var(--color-text-secondary); }
  .meta { color: var(--color-text-tertiary); }
  .link { color: var(--color-text-info); }
  .inline-code { color: var(--color-codex-editor-inline-code-foreground);
    background: var(--color-codex-editor-inline-code-background); }
  .cm-markdown-code-line { background: color-mix(in srgb, var(--color-background-secondary-soft-alpha) 10%, transparent); }
  .cm-text-file-search-panel { background: var(--color-surface-secondary); color: var(--color-text); }
  [data-codex-find-input] { background: transparent; color: var(--color-text); }
  .search-description { color: var(--color-codex-description); }
  .cm-searchMatch { background: var(--color-background-info-soft); }
  .cm-searchMatch-selected { background: var(--color-background-info-surface); }
  .syntax-token { color: rgb(163, 21, 21); }
  #other-editor { color: var(--color-text); }
</style></head><body><main class="main-surface">
  <div id="viewer"><div id="surface" data-editor-search-surface>
    <div class="cm-editor"><div class="cm-scroller"><div class="cm-content" data-language="markdown">
      <div class="file-editor-heading">Markdown 文档</div>
      <p id="copy">正文内容与背景应有清晰对比。<span class="cm-searchMatch">查找</span><span class="cm-searchMatch-selected">当前命中</span></p>
      <p class="quote">引用内容</p><p class="meta">辅助文字</p>
      <a class="link">文档链接</a> <span class="inline-code">inline_code</span>
      <p class="cm-markdown-code-line"><span class="syntax-token">const</span> example = true;</p>
    </div></div></div>
  </div></div>
  <div id="other-editor"><div class="cm-editor"><div class="cm-scroller"><div class="cm-content" data-language="typescript">Unrelated editor</div></div></div></div>
</main></body></html>`;

test("keeps Markdown document viewports white with readable local colors and releases reused editors", async () => {
  const profile = await mkdtemp(
    join(tmpdir(), "codexstyle-markdown-document-"),
  );
  let application: ElectronApplication | undefined;
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[0] !== "ELECTRON_RUN_AS_NODE",
      ),
    );
    application = await electron.launch({
      executablePath: resolve("node_modules/electron/dist/electron.exe"),
      args: [resolve("tests/fixtures/theme-payload-shell.cjs")],
      env: { ...env, CODEXSTYLE_TEST_USER_DATA: profile },
    });
    const page = await application.firstWindow();
    await page.setContent(documentPage);
    const surface = page.locator("#surface");
    await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const configuration = readThemeConfiguration({});
    const payload = buildThemePayload(
      "codexstyle-00000000-0000-4000-8000-000000000000",
      "",
      "",
      {
        ...configuration,
        colors: {
          ...configuration.colors,
          background: "rgba(255, 190, 210, 0)",
        },
        appearance: "dark",
        art: { ...configuration.art, taskMode: "off" },
        backgroundScope: "window",
        sidebarOverlayOpacity: 75,
      },
    );
    expect(await page.evaluate(payload)).toBe(true);
    await expect(surface).toHaveAttribute("data-ds-part", "markdown-document");
    await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(surface).toHaveCSS("background-image", "none");
    await expect(surface).toHaveCSS("height", "560px");
    await expect(surface).toHaveCSS("color-scheme", "light");
    for (const selector of ["#copy", ".file-editor-heading", ".inline-code"]) {
      await expect(page.locator(selector)).toHaveCSS(
        "color",
        "rgb(31, 35, 40)",
      );
    }
    await expect(page.locator(".quote")).toHaveCSS("color", "rgb(75, 85, 99)");
    await expect(page.locator(".meta")).toHaveCSS("color", "rgb(91, 100, 112)");
    await expect(page.locator(".link")).toHaveCSS("color", "rgb(9, 105, 218)");
    await expect(page.locator(".inline-code")).toHaveCSS(
      "background-color",
      "rgb(243, 244, 246)",
    );
    await expect(page.locator(".syntax-token")).toHaveCSS(
      "color",
      "rgb(163, 21, 21)",
    );
    await expect(page.locator(".cm-markdown-code-line")).toHaveCSS(
      "background-color",
      "rgb(243, 244, 246)",
    );
    await expect(page.locator(".cm-searchMatch")).toHaveCSS(
      "background-color",
      "rgb(219, 234, 254)",
    );
    await expect(page.locator(".cm-searchMatch-selected")).toHaveCSS(
      "background-color",
      "rgb(191, 219, 254)",
    );
    // Native find widgets are mounted inside the editor and use separate
    // surface/description aliases, even when the document's prose is dark.
    await surface.locator(".cm-editor").evaluate((node) => {
      node.insertAdjacentHTML(
        "afterbegin",
        '<div class="cm-text-file-search-panel"><input data-codex-find-input value="查找"><span class="search-description">1 / 2</span></div>',
      );
    });
    await expect(page.locator(".cm-text-file-search-panel")).toHaveCSS(
      "background-color",
      "rgb(243, 244, 246)",
    );
    await expect(page.locator("[data-codex-find-input]")).toHaveCSS(
      "color",
      "rgb(31, 35, 40)",
    );
    await expect(page.locator(".search-description")).toHaveCSS(
      "color",
      "rgb(91, 100, 112)",
    );
    await expect(page.locator("#other-editor")).toHaveCSS(
      "color",
      "rgb(250, 250, 250)",
    );
    await expect(page.locator("#other-editor")).not.toHaveAttribute(
      "data-ds-part",
    );
    // Keep hidden-window regression independent of screenshot compositing,
    // which Windows may suspend. Computed colors and viewport geometry above
    // assert the visual contract; screenshots are a separate manual QA artifact.

    // CodeMirror may reuse a viewport and change only its language attribute.
    // The theme must then release both the white surface and its local tokens.
    const language = surface.locator(".cm-content");
    await language.evaluate((node) =>
      node.setAttribute("data-language", "typescript"),
    );
    await expect(surface).not.toHaveAttribute("data-ds-part");
    await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator("#copy")).toHaveCSS(
      "color",
      "rgb(250, 250, 250)",
    );
    await language.evaluate((node) =>
      node.setAttribute("data-language", "markdown"),
    );
    await expect(surface).toHaveAttribute("data-ds-part", "markdown-document");
    await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");

    // Switching to source mode replaces CodeMirror with Pierre; it owns its
    // native theme and must not retain the preview's light token overrides.
    await surface.evaluate((node) => {
      node.innerHTML = "<div data-pierre-editor-surface>Source</div>";
    });
    await expect(surface).not.toHaveAttribute("data-ds-part");
    await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    // An asynchronously opened preview is styled immediately, before the
    // observer's debounced mapping, so opening a file does not flash wallpaper.
    const immediate = await surface.evaluate((node) => {
      node.innerHTML =
        '<div class="cm-editor"><div class="cm-scroller"><div class="cm-content" data-language="markdown">New document</div></div></div>';
      return {
        background: getComputedStyle(node).backgroundColor,
        part: node.getAttribute("data-ds-part"),
      };
    });
    expect(immediate).toEqual({ background: "rgb(255, 255, 255)", part: null });
    await expect(surface).toHaveAttribute("data-ds-part", "markdown-document");
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
