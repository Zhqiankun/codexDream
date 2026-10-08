import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readThemeConfiguration } from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

// Verified against Store 26.924.2738.0 collapsed-turn-disclosure. Both labels
// use this structure; the arrow keeps an explicit native text-text/40 color.
const disclosure = (label: string) => `
  <div class="text-size-chat text-secondary">
    <button class="inline-flex max-w-full flex-wrap text-size-chat" aria-expanded="false">
      <span><span class="text-inherit">${label}</span></span>
      <svg class="icon-2xs text-text/40 rotate-0" width="12" height="12" viewBox="0 0 12 12"><path d="M4 2 L8 6 L4 10" stroke="currentColor" fill="none" /></svg>
    </button>
  </div><div class="pt-1 text-size-chat text-secondary"><div class="border-t"></div></div>`;

for (const appearance of ["dark", "light"] as const) {
  test(`turn disclosure follows theme text on ${appearance} backgrounds`, async () => {
    const profile = await mkdtemp(join(tmpdir(), "codexstyle-disclosure-"));
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
      await page.setContent(`<style>
        body { margin: 40px; font: 16px sans-serif; }
        button { color: #333; background: transparent; border: 0; }
        button:hover { color: #222; }
        button:focus-visible { outline: 2px solid blue; }
        button:disabled { opacity: .5; }
        svg { color: rgba(0,0,0,.4); }
        .rotate-90 { transform: rotate(90deg); }
        .border-t { border-top: 1px solid #888; }
        #body-text { color: #123456; }
      </style>
      <main class="main-surface"><div class="thread-scroll-container">
        <section id="duration">${disclosure("用时 6m 18s")}</section>
        <section id="messages">${disclosure("上 13 条消息")}</section>
        <p id="body-text">Ordinary content</p>
        <div class="text-size-chat text-secondary"><button id="unrelated" aria-expanded="false">Other disclosure</button></div>
        <section id="late"></section>
      </div><section id="outside">${disclosure("Outside conversation")}</section></main>`);
      const configuration = readThemeConfiguration({});
      const color = appearance === "dark" ? "#eeeeee" : "#333333";
      const expected =
        appearance === "dark" ? "rgb(238, 238, 238)" : "rgb(51, 51, 51)";
      const settings = {
        ...configuration,
        appearance,
        backgroundScope: "window" as const,
        sidebarOverlayOpacity: 75,
        art: { ...configuration.art, taskMode: "off" as const },
        colors: {
          ...configuration.colors,
          background: appearance === "dark" ? "#000000" : "#ffffff",
          activityMuted: color,
        },
      };
      const payload = () =>
        buildThemePayload("codexstyle-disclosure-test", "", "", settings);
      expect(await page.evaluate(payload())).toBe(true);
      for (const id of ["duration", "messages"]) {
        const button = page.locator(`#${id} button`);
        await expect(button).toHaveCSS("color", expected);
        await expect(button.locator("span span")).toHaveCSS(
          "-webkit-text-fill-color",
          expected,
        );
        await expect(button.locator("svg")).toHaveCSS("color", expected);
        await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }
      await expect(page.locator("#unrelated")).toHaveCSS(
        "color",
        "rgb(51, 51, 51)",
      );
      await expect(page.locator("#outside svg")).toHaveCSS(
        "color",
        "rgba(0, 0, 0, 0.4)",
      );
      await expect(page.locator("#body-text")).toHaveCSS(
        "color",
        "rgb(18, 52, 86)",
      );
      const button = page.locator("#duration button");
      await button.evaluate((node) =>
        node.addEventListener("click", () => {
          node.setAttribute("aria-expanded", "true");
          node.querySelector("svg")!.classList.replace("rotate-0", "rotate-90");
        }),
      );
      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(button).toHaveCSS("color", expected);
      await expect(button.locator("svg")).toHaveCSS(
        "transform",
        "matrix(0, 1, -1, 0, 0, 0)",
      );
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(button).toHaveCSS("outline-style", "solid");
      await button.evaluate((node) => node.setAttribute("disabled", ""));
      await expect(button).toBeDisabled();
      await expect(button).toHaveCSS("opacity", "0.5");
      const immediate = await page.locator("#late").evaluate((node, html) => {
        node.innerHTML = html;
        return getComputedStyle(node.querySelector("svg")!).color;
      }, disclosure("Previous 2 messages"));
      expect(immediate).toBe(expected);
      settings.colors.activityMuted = "#b080c0";
      await page.evaluate(payload());
      await expect(page.locator("#late svg")).toHaveCSS(
        "color",
        "rgb(176, 128, 192)",
      );
    } finally {
      await application.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
