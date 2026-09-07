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

const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
const themes = [
  {
    name: "light surfaces and dark text",
    appearance: "light",
    surface: "#ffffff",
    user: "#314159",
    assistant: "#26372b",
    expectedUser: "rgb(49, 65, 89)",
    expectedAssistant: "rgb(38, 55, 43)",
  },
  {
    name: "dark surfaces and light text",
    appearance: "dark",
    surface: "#182230",
    user: "#f2e6d8",
    assistant: "#dcecf4",
    expectedUser: "rgb(242, 230, 216)",
    expectedAssistant: "rgb(220, 236, 244)",
  },
] as const;

// Keep the ordinary-text structure and color inheritance from Store
// 26.901.2854.0. FadeIn spans only animate opacity; they do not own a white
// foreground. The fixed native tokens below make accidental overrides visible.
const markdownContent = `
  <h2 class="_Heading_15pu8_117" data-plain>
    <span class="_FadeIn_15pu8_652" data-plain>Heading</span>
  </h2>
  <p class="_Paragraph_15pu8_105" data-plain>
    <span class="_FadeIn_15pu8_652" data-plain>Ordinary paragraph</span>
    <strong class="font-semibold" data-plain><span class="_FadeIn_15pu8_652" data-plain>Nested bold</span></strong>
    <em data-plain>Emphasis</em><del data-plain>Deleted prose</del>
  </p>
  <ul class="_List_15pu8_118 _UnorderedList_15pu8_203" data-plain>
    <li class="_ListItem_15pu8_118" data-plain data-marker>
      <span class="_FadeIn_15pu8_652" data-plain>Unordered item</span>
      <ol class="_List_15pu8_118 _OrderedList_15pu8_215" data-plain>
        <li class="_ListItem_15pu8_118" data-plain data-marker>
          <strong class="font-semibold" data-plain><span class="_FadeIn_15pu8_652" data-plain>Nested numbered item</span></strong>
        </li>
      </ol>
    </li>
  </ul>
  <blockquote class="_Blockquote_15pu8_279" data-plain>
    <p class="_Paragraph_15pu8_105" data-plain><span class="_FadeIn_15pu8_652" data-plain>Quoted paragraph</span></p>
  </blockquote>
  <table class="_Table_15pu8_33" data-plain>
    <thead data-plain><tr data-plain><th class="_TableHeaderCell_15pu8_541" data-plain><span class="_FadeIn_15pu8_652" data-plain>Header</span></th></tr></thead>
    <tbody data-plain><tr data-plain><td class="_TableCell_15pu8_537" data-plain><strong data-plain><span class="_FadeIn_15pu8_652" data-plain>Cell text</span></strong></td></tr></tbody>
  </table>
  <p class="_Paragraph_15pu8_105" data-plain>
    <span class="_FadeIn_15pu8_652"><a href="https://example.com"><strong><span>Native link</span></strong></a></span>
    <span class="_FadeIn_15pu8_652"><span class="inline-markdown _InlineMarkdownIsolate_15pu8_602" data-markdown-copy="inline-code">customer_code</span></span>
    <code class="inline-markdown" data-inline-code-fallback>fallback_code</code>
  </p>
  <div class="_CodeBlock_15pu8_584" data-markdown-copy="code-block">
    <pre><code><span class="syntax-keyword">const</span> value = <span class="syntax-string">"native syntax"</span>;</code></pre>
  </div>`;

const nativePage = `<!doctype html>
<html><head><style>
  :root {
    --color-text: #303030;
    --color-text-user-message: #4d4d4d;
    --color-text-link: #0969da;
    --color-background-primary-ghost-hover: #e8e8e8;
  }
  ._MarkdownRoot_15pu8_178 { --text-primary: currentColor; color: var(--color-text); }
  ._MarkdownRoot_15pu8_178[data-markdown-text-tone="user-message"] { color: var(--color-text-user-message); }
  ._Heading_15pu8_117, .font-semibold { font-weight: 600; }
  ._UnorderedList_15pu8_203 { list-style-type: disc; }
  ._OrderedList_15pu8_215 { list-style-type: decimal; }
  ._UnorderedList_15pu8_203 > ._ListItem_15pu8_118::marker,
  ._OrderedList_15pu8_215 > ._ListItem_15pu8_118::marker { color: var(--text-primary); font-weight: 600; }
  ._Blockquote_15pu8_279, ._TableHeaderCell_15pu8_541 { color: var(--text-primary); }
  @keyframes markdown-fade-in { to { opacity: 1; } }
  ._MarkdownRoot_15pu8_178[data-markdown-animated] :is(._FadeIn_15pu8_652, li, tr, blockquote) {
    opacity: 0; animation: markdown-fade-in 1ms forwards;
    animation-delay: var(--fade-delay, 0s);
  }
  a { color: var(--color-text-link); }
  .inline-markdown {
    background: color-mix(in srgb, var(--color-background-primary-ghost-hover) 60%, var(--color-text) 6%);
    border-radius: 6px; display: inline; font-family: monospace; padding: 1px 6px;
  }
  .syntax-keyword { color: #ab4f7a; }
  .syntax-string { color: #3a843f; }
</style></head><body>
  <main class="main-surface">
    <div data-user-message-bubble="true">
      <div id="user-markdown" class="_MarkdownRoot_15pu8_178" data-markdown-text-tone="user-message" data-markdown-animated>${markdownContent}</div>
    </div>
    <div id="assistant-markdown" class="_MarkdownRoot_15pu8_178" data-markdown-text-style="assistant-message" data-markdown-animated>${markdownContent}</div>
  </main>
</body></html>`;

for (const theme of themes) {
  test(`preserves Markdown chat colors with ${theme.name}`, async () => {
    const profile = await mkdtemp(join(tmpdir(), "codexstyle-markdown-chat-"));
    let application: ElectronApplication | undefined;
    try {
      const environment = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && entry[0] !== "ELECTRON_RUN_AS_NODE",
        ),
      );
      application = await electron.launch({
        executablePath: resolve("node_modules/electron/dist/electron.exe"),
        args: [resolve("tests/fixtures/theme-payload-shell.cjs")],
        env: { ...environment, CODEXSTYLE_TEST_USER_DATA: profile },
      });
      const page = await application.firstWindow();
      await expect(page).toHaveURL("app://test/");
      await page.setContent(nativePage);
      await expect(page.locator("#user-markdown")).toHaveCSS(
        "color",
        "rgb(77, 77, 77)",
      );
      await expect(page.locator("#assistant-markdown")).toHaveCSS(
        "color",
        "rgb(48, 48, 48)",
      );
      const inlineBackground = await page
        .locator("#assistant-markdown [data-markdown-copy='inline-code']")
        .evaluate((node) => getComputedStyle(node).backgroundColor);

      const configuration = readThemeConfiguration({});
      const payload = buildThemePayload(marker, "", "", {
        ...configuration,
        colors: {
          ...configuration.colors,
          panelAlt: theme.surface,
          assistantPanel: theme.surface,
          userMessageText: theme.user,
          assistantMessageText: theme.assistant,
        },
        appearance: theme.appearance,
        backgroundScope: "window",
        sidebarOverlayOpacity: 75,
      });
      expect(await page.evaluate(payload)).toBe(true);

      for (const state of ["streaming", "settled"]) {
        if (state === "settled") {
          // Store removes the FadeIn class for settled segments. Their normal
          // foreground must continue to inherit without relying on that class.
          await page.locator("._FadeIn_15pu8_652").evaluateAll((nodes) => {
            for (const node of nodes)
              node.classList.remove("_FadeIn_15pu8_652");
          });
        }
        for (const [role, color] of [
          ["user", theme.expectedUser],
          ["assistant", theme.expectedAssistant],
        ]) {
          const root = page.locator(`#${role}-markdown`);
          await expect(root).toHaveCSS("color", color);
          expect(
            await root.locator("[data-plain]").evaluateAll((nodes) =>
              nodes.map((node) => ({
                tag: node.tagName,
                color: getComputedStyle(node).color,
              })),
            ),
            `${role} ordinary Markdown in ${state} state`,
          ).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ tag: "SPAN", color }),
            ]),
          );
          expect(
            await root
              .locator("[data-plain]")
              .evaluateAll((nodes) => [
                ...new Set(nodes.map((node) => getComputedStyle(node).color)),
              ]),
          ).toEqual([color]);
          expect(
            await root
              .locator("[data-marker]")
              .evaluateAll((nodes) =>
                nodes.map((node) => getComputedStyle(node, "::marker").color),
              ),
          ).toEqual([color, color]);

          // The native inline span has no foreground declaration. Assistant
          // inline code inherits its themed text; the user bridge deliberately
          // restores the native user-message foreground for code only.
          const inlineColor = role === "user" ? "rgb(77, 77, 77)" : color;
          for (const selector of [
            "[data-markdown-copy='inline-code']",
            "[data-inline-code-fallback]",
          ]) {
            await expect(root.locator(selector)).toHaveCSS(
              "color",
              inlineColor,
            );
            await expect(root.locator(selector)).toHaveCSS(
              "background-color",
              inlineBackground,
            );
          }
          for (const selector of ["a", "a strong", "a span"]) {
            await expect(root.locator(selector)).toHaveCSS(
              "color",
              "rgb(9, 105, 218)",
            );
          }
          await expect(root.locator(".syntax-keyword")).toHaveCSS(
            "color",
            "rgb(171, 79, 122)",
          );
          await expect(root.locator(".syntax-string")).toHaveCSS(
            "color",
            "rgb(58, 132, 63)",
          );
        }
      }
    } finally {
      // This handle and unique profile belong only to this test, never to the
      // installed Codex process or a user's existing session.
      await application?.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
