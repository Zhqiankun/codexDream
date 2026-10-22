import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readThemeConfiguration } from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

// 原生结构与闪光规则来自 Store 26.1016.6573.0 的 Lpd、uG、ltt 和
// collapsed-turn-disclosure。独立保留原生淡色，避免只复刻待测选择器。
const shimmer = (
  label: string,
  className = "min-w-0 flex-1 truncate select-none",
) =>
  `<span class="relative inline-block align-top _cadencedShimmer_wne66_2 _cadencedShimmerActive_wne66_71 ${className}" aria-hidden="false">${label}<span aria-hidden="true" class="_cadencedShimmerSweep_wne66_35"><span class="_cadencedShimmerHighlight_wne66_30">${label}</span></span></span>`;
const thinking = (label: string) =>
  `<div class="inline-flex max-w-full min-w-0 items-center overflow-hidden text-text/60 [&_*:not(button)]:!text-text/60"><span aria-hidden="true" class="h-4 w-0 shrink-0"></span>${shimmer(label)}</div>`;
const divider = (label: string, accessory = false) =>
  `<div class="flex min-h-0 flex-col items-start gap-2 text-size-chat text-secondary${accessory ? "" : " overflow-hidden"}">${accessory ? '<div class="flex items-start gap-2"><svg class="status-icon" width="12" height="12"></svg>' : ""}<span class="tabular-nums text-tertiary">${label}</span>${accessory ? "</div>" : ""}<div class="w-full border-t border-default"></div></div>`;
const disclosure = `<div class="text-size-chat text-secondary"><button id="disclosure" class="inline-flex max-w-full flex-wrap text-size-chat" aria-expanded="false"><span><span class="tabular-nums text-inherit">用时 6 分 18 秒</span></span><svg class="icon-2xs transition-transform duration-basic rotate-0" width="12" height="12"></svg><span data-denied-action-count="true" class="text-warning">1 denied action<svg class="text-warning" width="12" height="12"></svg></span></button></div>`;
const nativeCss = `
  body { margin: 24px; font: 16px sans-serif; --color-codex-description: #808080; }
  button { color: #888; background: transparent; border: 0; }
  .text-secondary, .text-tertiary { color: #888; }
  .text-inherit { color: inherit; }
  .status-icon { color: #1769aa; }
  .text-warning { color: #996600; }
  .rotate-90 { transform: rotate(90deg); }
  .border-t { border-top: 1px solid #888; }
  [class~="[&_*:not(button)]:!text-text/60"] :not(button) { color: #999 !important; }
  ._cadencedShimmer_wne66_2 { --shimmer-text-secondary: var(--loading-shimmer-base, color-mix(in srgb, var(--loading-shimmer-foreground, var(--color-codex-description)) 55%, transparent)); --shimmer-contrast: var(--loading-shimmer-highlight, #ffffffbf); -webkit-text-fill-color: currentColor; }
  ._cadencedShimmer_wne66_2, ._cadencedShimmer_wne66_2 * { color: var(--shimmer-text-secondary) !important; }
  ._cadencedShimmer_wne66_2 ._cadencedShimmerHighlight_wne66_30 { color: var(--shimmer-contrast) !important; }
  ._cadencedShimmerSweep_wne66_35 { position: absolute; inset: 0 auto 0 0; width: 100%; pointer-events: none; transform: translate(-50%); mask-image: linear-gradient(90deg, #0000 0%, #000 20% 30%, #0000 50% 100%); }
  ._cadencedShimmerHighlight_wne66_30 { display: block; width: 100%; transform: translate(50%); -webkit-text-fill-color: currentColor; }
  ._cadencedShimmerActive_wne66_71 ._cadencedShimmerSweep_wne66_35 { animation: _cadencedLoadingShimmerSweep_wne66_111 1s steps(48, end) 1; }
  @keyframes _cadencedLoadingShimmerSweep_wne66_111 { from { transform: translate(-50%); } to { transform: translate(125%); } }
  @media (prefers-reduced-motion: reduce) { ._cadencedShimmerActive_wne66_71 ._cadencedShimmerSweep_wne66_35 { animation: none; } }
`;

for (const appearance of ["dark", "light"] as const) {
  for (const mode of ["configured", "advanced"] as const) {
    test(`thinking and elapsed statuses follow assistant text in ${appearance} ${mode}`, async () => {
      const profile = await mkdtemp(join(tmpdir(), "codexstyle-thinking-"));
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && entry[0] !== "ELECTRON_RUN_AS_NODE",
        ),
      );
      const application = await electron.launch({
        executablePath: resolve("node_modules/electron/dist/electron.exe"),
        args: [resolve("tests/fixtures/theme-payload-shell.cjs")],
        env: { ...env, CODEXSTYLE_TEST_USER_DATA: profile },
      });
      try {
        const page = await application.firstWindow();
        const fixture = `<style>${nativeCss}</style><main class="main-surface"><div class="thread-scroll-container">
          <div id="thinking">${thinking("正在思考")}</div>
          <div id="reasoning">${thinking("检查当前实现")}</div>
          <div id="streamed-reasoning" style="--loading-shimmer-base: #050505">${shimmer("Checking the current implementation and verifying text colors.", "text-size-chat leading-[calc(var(--codex-chat-font-size)_+_8px)] select-none truncate")}</div>
          <span id="plain-thinking" class="text-size-chat leading-[calc(var(--codex-chat-font-size)_+_8px)] select-none truncate">Thinking</span>
          <div id="static-thinking"><div class="inline-flex text-text/60 [&_*:not(button)]:!text-text/60"><span aria-hidden="false" class="min-w-0 flex-1 truncate select-none">分析当前实现</span></div></div>
          <div id="running">${divider("正在执行 12 秒")}</div>
          <div id="completed">${divider("用时 1 分 30 秒", true)}</div>
          <div id="current">${disclosure}</div>
          <div data-markdown-text-style="assistant-message"><p id="answer">助手回答正文</p></div>
          <span id="other-time" class="tabular-nums text-tertiary">Unrelated timer</span>
          <span id="other-shimmer" class="_cadencedShimmer_wne66_2 text-lg">Unrelated shimmer</span>
          <div id="late"></div>
        </div><div id="outside">${thinking("Outside transcript")}${divider("Outside duration")}</div></main>`;
        await page.setContent(fixture);
        const settings = {
          ...readThemeConfiguration({}),
          appearance,
          backgroundScope: "window" as const,
          sidebarOverlayOpacity: 0,
        };
        settings.styleConfig.mode = mode;
        settings.art.taskMode = "off";
        settings.colors.background =
          appearance === "dark" ? "#000000" : "#ffffff";
        settings.colors.assistantMessageText =
          appearance === "dark" ? "#eeeeee" : "#263341";
        settings.colors.activityText = "#518032";
        settings.colors.activityMuted = "#b080c0";
        const native = await page.locator("#outside").evaluate((node) =>
          [...node.querySelectorAll("span")].map((span) => ({
            color: getComputedStyle(span).color,
            fill: getComputedStyle(span).webkitTextFillColor,
          })),
        );
        const payload = () =>
          buildThemePayload("codexstyle-thinking-test", "", "", settings);
        await expect(
          page.locator("#streamed-reasoning > span[aria-hidden=false]"),
        ).toHaveCSS("color", "rgb(5, 5, 5)");
        expect(await page.evaluate(payload())).toBe(true);
        const targets = [
          "#thinking > div > span[aria-hidden=false]",
          "#reasoning > div > span[aria-hidden=false]",
          "#streamed-reasoning > span[aria-hidden=false]",
          "#plain-thinking",
          "#static-thinking span",
          "#running .tabular-nums",
          "#completed .tabular-nums",
          "#disclosure",
          "#disclosure > span:first-child > span",
          "#disclosure > svg",
        ];
        const assertColors = async () => {
          const { expected, actual } = await page.evaluate(
            (selectors) => ({
              expected: getComputedStyle(document.querySelector("#answer")!)
                .color,
              actual: selectors.map((selector) => {
                const style = getComputedStyle(
                  document.querySelector(selector)!,
                );
                return { color: style.color, fill: style.webkitTextFillColor };
              }),
            }),
            targets,
          );
          for (const [index, selector] of targets.entries()) {
            expect
              .soft(actual[index], selector)
              .toEqual({ color: expected, fill: expected });
          }
        };
        await assertColors();
        await expect(page.locator("#other-time")).toHaveCSS(
          "color",
          "rgb(136, 136, 136)",
        );
        await expect(page.locator("#completed .status-icon")).toHaveCSS(
          "color",
          "rgb(23, 105, 170)",
        );
        await expect(page.locator("[data-denied-action-count]")).toHaveCSS(
          "color",
          "rgb(153, 102, 0)",
        );
        await expect(page.locator("[data-denied-action-count] svg")).toHaveCSS(
          "color",
          "rgb(153, 102, 0)",
        );
        await expect(page.locator("[data-denied-action-count]")).toHaveCSS(
          "-webkit-text-fill-color",
          "rgb(153, 102, 0)",
        );
        expect(
          await page.locator("#outside").evaluate((node) =>
            [...node.querySelectorAll("span")].map((span) => ({
              color: getComputedStyle(span).color,
              fill: getComputedStyle(span).webkitTextFillColor,
            })),
          ),
        ).toEqual(native);
        const sweep = page.locator("#thinking ._cadencedShimmerSweep_wne66_35");
        await expect(sweep).toHaveCSS(
          "animation-name",
          "_cadencedLoadingShimmerSweep_wne66_111",
        );
        expect(
          await sweep.evaluate((node) => getComputedStyle(node).maskImage),
        ).toContain("linear-gradient");
        await expect(
          page.locator("#thinking ._cadencedShimmerHighlight_wne66_30"),
        ).toHaveCSS("color", "rgba(255, 255, 255, 0.75)");
        // 英文长提示在原生闪光周期之间也必须可见，不能只靠扫光提供对比度。
        const englishSweep = page.locator(
          "#streamed-reasoning ._cadencedShimmerSweep_wne66_35",
        );
        await englishSweep.evaluate((node) =>
          node.parentElement!.classList.remove(
            "_cadencedShimmerActive_wne66_71",
          ),
        );
        await expect(englishSweep).toHaveCSS("animation-name", "none");
        await assertColors();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(sweep).toHaveCSS("animation-name", "none");
        await assertColors();
        await page.locator("#running .tabular-nums").evaluate((node) => {
          node.textContent = "已停止，用时 15 秒";
        });
        await page.locator("#disclosure").evaluate((node) => {
          node.addEventListener("click", () => {
            node.setAttribute("aria-expanded", "true");
            node
              .querySelector("svg")!
              .classList.replace("rotate-0", "rotate-90");
          });
        });
        await page.locator("#disclosure").click();
        await expect(page.locator("#disclosure")).toHaveAttribute(
          "aria-expanded",
          "true",
        );
        await assertColors();
        const immediate = await page.locator("#late").evaluate(
          (node, html) => {
            node.innerHTML = html;
            return [
              ...node.querySelectorAll("[aria-hidden=false], .tabular-nums"),
            ].map((element) => getComputedStyle(element).color);
          },
          thinking("Thinking") + divider("Working for 3s"),
        );
        const expected = await page
          .locator("#answer")
          .evaluate((node) => getComputedStyle(node).color);
        expect.soft(immediate).toEqual([expected, expected]);
        settings.colors.activityText = "#222222";
        settings.colors.activityMuted = "#654321";
        // 主题设置在新会话生效；新文档清除旧注入观察器，避免模拟未支持的热应用。
        await page.reload();
        await page.setContent(fixture);
        await page.evaluate(payload());
        await assertColors();
        settings.colors.assistantMessageText = "#65398a";
        await page.reload();
        await page.setContent(fixture);
        await page.evaluate(payload());
        await assertColors();
      } finally {
        await application.close();
        // 临时目录由本测试以固定前缀创建；只清理这一隔离数据根。
        expect(resolve(profile).startsWith(resolve(tmpdir()) + "\\")).toBe(
          true,
        );
        await rm(profile, { recursive: true, force: true });
      }
    });
  }
}
