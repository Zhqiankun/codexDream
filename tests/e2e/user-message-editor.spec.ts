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

// Store 26.901.6511.0: pg replaces the bubble with a form, WH mounts the
// rich editor without data-codex-composer, and the toolbar has outline/primary
// buttons. Keep mentions outside the footer to catch overly broad button rules.
const editor = `<form class="relative flex w-full flex-col rounded-3xl bg-text/5">
  <div class="relative z-10 flex min-h-0 flex-1 flex-col">
    <div><button class="mention">Mention choice</button></div>
    <div class="mb-2 flex-grow overflow-y-auto px-3 pt-3">
      <div data-rich-text-layout="multiline"><div contenteditable="true" role="textbox" aria-label="编辑消息"><p>编辑已发送的消息</p></div></div>
    </div>
    <div class="flex justify-end gap-1.5 px-3 pb-3">
      <button type="button" class="outline">取消</button>
      <button type="submit" class="bg-primary-solid"><span>发送</span></button>
    </div>
  </div>
</form>`;

for (const appearance of ["light", "dark"] as const) {
  test(`themes inline message editing in ${appearance} mode`, async () => {
    const profile = await mkdtemp(join(tmpdir(), "codexstyle-message-editor-"));
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
      await page.setContent(`<style>
        body { padding: 40px; background: ${appearance === "light" ? "#f8d9e4" : "#1a2330"}; font: 16px sans-serif; }
        form { border-radius: 24px; padding: 12px; margin: 20px 0; }
        form[class~="bg-text/5"] { background: rgba(128,128,128,.05); }
        [contenteditable] { color: #111; min-height: 40px; }
        button { border: 1px solid #ddd; border-radius: 8px; padding: 6px 10px; }
        .outline { background: white; color: #111; }
        .bg-primary-solid { background: #111; color: white; }
        .mention { color: #123456; }
        button:disabled { opacity: .5; }
        button:focus-visible { outline: 2px solid blue; }
      </style><main class="main-surface">
        <div id="message" data-local-conversation-user-anchor="true"><div data-user-message-bubble="true">已发送消息</div></div>
        <div id="unrelated">${editor}</div>
        <div data-codex-composer-root><div data-composer-surface-variant="default"><div data-codex-composer contenteditable="true">普通输入框</div><button class="bg-primary-solid"><svg></svg></button></div></div>
      </main>`);
      const configuration = readThemeConfiguration({});
      const settings = {
        ...configuration,
        appearance,
        backgroundScope: "window" as const,
        sidebarOverlayOpacity: 75,
        art: { ...configuration.art, taskMode: "off" as const },
        colors: {
          ...configuration.colors,
          panelAlt: "rgba(220, 120, 150, 0.35)",
          composerText: appearance === "light" ? "#402030" : "#fff0f6",
          accent: "#903050",
          accentText: "#fffafa",
          secondary: "#735060",
        },
        styleConfig: {
          ...configuration.styleConfig,
          mode: "configured" as const,
          sendIcon: "custom" as const,
          sendIconDataUrl: "data:image/png;base64,AA==",
        },
      };
      const payload = () =>
        buildThemePayload(
          "codexstyle-00000000-0000-4000-8000-000000000000",
          "",
          "",
          settings,
        );
      expect(await page.evaluate(payload())).toBe(true);
      // Insert after injection, like double-clicking a previously sent bubble.
      const immediate = await page
        .locator("#message")
        .evaluate((node, html) => {
          node.innerHTML = html;
          return getComputedStyle(node.querySelector("form")!).backgroundColor;
        }, editor);
      expect(immediate).toBe("rgba(220, 120, 150, 0.35)");
      const form = page.locator("#message form");
      const input = form.locator("[contenteditable]");
      const submit = form.locator('[type="submit"]');
      await expect(form).toHaveAttribute("data-ds-part", "message-editor");
      await expect(input).toHaveCSS(
        "color",
        appearance === "light" ? "rgb(64, 32, 48)" : "rgb(255, 240, 246)",
      );
      await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(submit).toHaveCSS("background-color", "rgb(144, 48, 80)");
      await expect(submit.locator("span")).toHaveCSS(
        "color",
        "rgb(255, 250, 250)",
      );
      expect(
        await submit.evaluate(
          (node) => getComputedStyle(node, "::after").content,
        ),
      ).toBe("none");
      await expect(form.locator(".outline")).toHaveCSS(
        "color",
        "rgb(115, 80, 96)",
      );
      await expect(form.locator(".mention")).toHaveCSS(
        "color",
        "rgb(18, 52, 86)",
      );
      await expect(page.locator("#unrelated form")).not.toHaveAttribute(
        "data-ds-part",
      );
      await expect(page.locator("#unrelated [contenteditable]")).toHaveCSS(
        "color",
        "rgb(17, 17, 17)",
      );
      await expect(page.locator("[data-codex-composer-root] button")).toHaveCSS(
        "background-color",
        "rgb(144, 48, 80)",
      );
      await input.fill("修改后的内容");
      await expect(input).toHaveText("修改后的内容");
      await submit.focus();
      await expect(submit).toBeFocused();
      await submit.evaluate((node: HTMLButtonElement) => {
        node.disabled = true;
      });
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveCSS("opacity", "0.5");
      // Windows may suspend hidden-window screenshot compositing. Assert the
      // computed visual contract here; capture screenshots separately for QA.
      settings.colors.panelAlt = "rgba(220, 120, 150, 0)";
      await page.evaluate(payload());
      await expect(form).toHaveCSS(
        "background-color",
        "rgba(220, 120, 150, 0)",
      );
      settings.styleConfig.recipes.composer = false;
      await page.evaluate(payload());
      await expect(form).toHaveCSS(
        "background-color",
        "rgba(128, 128, 128, 0.05)",
      );
      await form.evaluate((node) => node.replaceChildren());
      await expect(form).not.toHaveAttribute("data-ds-part");
    } finally {
      await application?.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
