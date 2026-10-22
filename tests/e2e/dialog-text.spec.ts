import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_BACKGROUND_SCOPE,
  DEFAULT_SIDEBAR_OVERLAY_OPACITY,
  readThemeConfiguration,
} from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

// 结构来自 Store 26.1016.6573.0 的创建项目、IF 输入和共用 Header/Button。
// 原生颜色独立保留；更新内容只复用同一弹窗原语，不执行任何真实更新。
const ghost = "no-drag cursor-interaction text-tertiary border-transparent";
const dialog = (
  id: string,
  title: string,
) => `<section id="${id}" role="dialog" aria-modal="true">
  <button class="close no-drag cursor-interaction leading-none hover:bg-primary-ghost-hover text-text/80" aria-label="关闭"><svg width="12" height="12"></svg></button>
  <button type="button" class="surface-close no-drag cursor-interaction leading-none hover:bg-primary-ghost-hover bg-surface text-text/80">独立表面关闭</button>
  <form><div class="heading-dialog min-w-0 font-semibold"><h2 class="contents">${title}</h2></div>
  <div class="text-codex-description description"><p>说明：<strong>普通弹窗文字</strong></p></div>
  <label class="text-default">源文件夹</label>
  <div class="field bg-primary-soft text-default"><button type="button" class="text-codex-description">图标</button><input aria-label="项目名称" placeholder="项目名称" value="demo" /></div>
  <div class="folder bg-primary-soft"><span class="text-tertiary">在此电脑上添加文件夹</span><button type="button" class="folder-path">E:/sample</button><button type="button" class="${ghost}">添加</button></div>
  <div class="outlined bg-surface"><span class="text-default">独立输入表面</span></div>
  <p role="alert" class="text-danger"><span>原生错误文字</span></p><span class="text-warning">原生警告</span><a href="#native">原生链接<span>链接说明</span></a><pre><code>const value = 1;</code></pre>
  <span class="foreign-copy text-default" data-codexstyle-owner="other">独立 owner 文字</span>
  <footer><button type="button" class="cancel ${ghost}"><span>取消</span></button><button type="button" class="secondary no-drag cursor-interaction text-default bg-text/5"><span>稍后</span></button><button type="submit" class="primary no-drag cursor-interaction bg-primary-solid text-primary-solid"><span>确认</span></button></footer>
  </form></section>`;
const nativeCss = `<style>
  body { margin: 24px; font: 16px sans-serif; --color-text: #202020; }
  aside, #outside { color: #111; } [role=dialog] { position: relative; background: white; color: #111; margin: 12px 0; padding: 24px; }
  .text-default { color: var(--color-text); } .text-tertiary, .text-codex-description { color: #666; }
  [class~="text-text/80"] { color: #333; } button { color: #111; background: transparent; border: 0; }
  button:focus-visible { outline: 2px solid #166eff; } button:disabled { opacity: .4; }
  .close { position: absolute; right: 12px; top: 12px; } .bg-primary-soft, .bg-surface { background: #f4f4f4; }
  .field { display: flex; } input { color: inherit; background: transparent; } input::placeholder { color: #777; }
  .text-danger { color: #b42318; } .text-warning { color: #996600; } a, a span { color: #166eff; } code { color: #237131; }
  .primary { background: #181818; color: white; } footer { display: flex; gap: 12px; margin-top: 12px; }
</style>`;

for (const appearance of ["dark", "light"] as const) {
  for (const mode of ["configured", "advanced"] as const) {
    test(`dialog text follows sidebar in ${appearance} ${mode}`, async () => {
      const profile = await mkdtemp(join(tmpdir(), "codexstyle-dialog-"));
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
        const page = await application.firstWindow();
        await page.setContent(
          `${nativeCss}<aside class="app-shell-left-panel"><span id="sidebar">侧栏文字</span></aside><main class="main-surface"><p id="outside">范围外普通文字</p></main>${dialog("project", "创建项目")}${dialog("update", "更新可用")}${dialog("foreign", "其他 owner")}<div id="late"></div>`,
        );
        await page.locator("#foreign").evaluate((node) => {
          node.setAttribute("data-ds-part", "dialog");
          node.setAttribute("data-codexstyle-owner", "other");
        });
        const preserved = [
          "#project input",
          "#project .field",
          "#project .field button",
          "#project .folder span",
          "#project .folder-path",
          "#project .folder button:last-child",
          "#project .outlined span",
          "#project [role=alert] span",
          "#project .text-warning",
          "#project a span",
          "#project code",
          "#project .primary span",
          "#project .surface-close",
          "#project .foreign-copy",
          "#foreign h2",
          "#outside",
        ];
        const snapshot = () =>
          page.evaluate(
            (selectors) =>
              selectors.map((selector) => {
                const style = getComputedStyle(
                  document.querySelector(selector)!,
                );
                return {
                  color: style.color,
                  fill: style.webkitTextFillColor,
                  background: style.backgroundColor,
                };
              }),
            preserved,
          );
        const before = await snapshot();
        const settings = {
          ...readThemeConfiguration({}),
          backgroundScope: DEFAULT_BACKGROUND_SCOPE,
          sidebarOverlayOpacity: DEFAULT_SIDEBAR_OVERLAY_OPACITY,
        };
        settings.appearance = appearance;
        settings.styleConfig.mode = mode;
        settings.art.taskMode = "off";
        settings.colors.panel = appearance === "dark" ? "#000000" : "#ffffff";
        settings.colors.sidebarText =
          appearance === "dark" ? "#ffe4aa" : "#243653";
        settings.colors.text = "#111111";
        settings.colors.assistantMessageText = "#a13c84";
        const css =
          '[data-ds-part="root"] { color: var(--ds-theme-color-text); } [data-ds-part="dialog"] { background-color: var(--ds-theme-color-panel); }';
        expect(
          await page.evaluate(
            buildThemePayload("codexstyle-dialog-test", css, "", settings),
          ),
        ).toBe(true);
        const targets = [
          "h2",
          ".description",
          ".description p",
          ".description strong",
          "label",
          ".cancel",
          ".cancel span",
          ".secondary span",
          ".close",
          ".close svg",
        ];
        const assertColors = async (id: string) => {
          const actual = await page.evaluate(
            ({ id, targets }) => ({
              expected: getComputedStyle(document.querySelector("#sidebar")!)
                .color,
              values: targets.map((selector) => {
                const style = getComputedStyle(
                  document.querySelector(`#${id} ${selector}`)!,
                );
                return { color: style.color, fill: style.webkitTextFillColor };
              }),
            }),
            { id, targets },
          );
          for (const [index, selector] of targets.entries())
            expect
              .soft(actual.values[index], `${id} ${selector}`)
              .toEqual({ color: actual.expected, fill: actual.expected });
        };
        await assertColors("project");
        await assertColors("update");
        expect(await snapshot()).toEqual(before);
        // The picker has no foreground of its own: use the native field token
        // rather than inheriting bright sidebar text onto its light surface.
        await expect(page.locator("#project .folder")).toHaveCSS(
          "color",
          "rgb(32, 32, 32)",
        );
        await expect(page.locator("#project .folder")).toHaveCSS(
          "background-color",
          "rgb(244, 244, 244)",
        );
        await page
          .getByRole("textbox", { name: "项目名称" })
          .first()
          .fill("new name");
        await expect(
          page.getByRole("textbox", { name: "项目名称" }).first(),
        ).toHaveValue("new name");
        const cancel = page.locator("#project .cancel");
        await cancel.focus();
        await expect(cancel).toHaveCSS("outline-style", "solid");
        await cancel.evaluate((node) =>
          node.addEventListener("click", () =>
            node.setAttribute("data-clicked", "true"),
          ),
        );
        await page.keyboard.press("Enter");
        await expect(cancel).toHaveAttribute("data-clicked", "true");
        await cancel.evaluate((node) => node.setAttribute("disabled", ""));
        await expect(cancel).toBeDisabled();
        await expect(cancel).toHaveCSS("opacity", "0.4");
        await page.locator("#late").evaluate(
          (node, html) => {
            node.innerHTML = html;
          },
          dialog("late-dialog", "更新项目"),
        );
        await expect(page.locator("#late-dialog")).toHaveAttribute(
          "data-ds-part",
          "dialog",
        );
        await assertColors("late-dialog");
        await page
          .locator("#late-dialog")
          .evaluate((node) => node.removeAttribute("role"));
        await expect(page.locator("#late-dialog")).not.toHaveAttribute(
          "data-ds-part",
          "dialog",
        );
        if (mode === "configured")
          await page.screenshot({
            path: test.info().outputPath(`dialog-${appearance}.png`),
            fullPage: true,
          });
      } finally {
        await application.close();
        expect(resolve(profile).startsWith(resolve(tmpdir()) + "\\")).toBe(
          true,
        );
        await rm(profile, { recursive: true, force: true });
      }
    });
  }
}
