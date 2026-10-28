import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readThemeConfiguration } from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

const test = base.extend<{ shell: Page }>({
  shell: async ({ browserName }, use) => {
    const profile = await mkdtemp(
      join(tmpdir(), `codexstyle-navigation-${browserName}-`),
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

// Reduced from Store 26.1023.6123.0's floating-navigation-rail component.
// Keep its native currentColor, opacity and state rules so theme tokens are
// tested independently of the compatibility bridge. The handlers only model
// the UI hit targets; this fixture does not execute the official application.
const markerCss = `
  :root { --color-text: #111111; --color-codex-description: #5d5d5d; }
  body { margin: 0; font: 14px sans-serif; }
  main { position: relative; height: 640px; }
  nav { position: absolute; left: 16px; top: 160px; z-index: 20; }
  #rail { display: flex; flex-direction: column; }
  #rail button, #outside button { display: flex; align-items: center; width: 36px; height: 10px; padding: 0; border: 0; outline: none; background: transparent; }
  ._Marker_k7ebw_2 { width: 26px; height: 2px; display: flex; position: relative; color: var(--color-codex-description); opacity: var(--bookmarked-opacity, .4); }
  ._Marker_k7ebw_2:has(._BookmarkDot_k7ebw_2) { --bookmarked-opacity: 1; }
  ._MarkerLine_k7ebw_2, ._BookmarkDot_k7ebw_2 { background-color: currentColor; }
  ._MarkerLine_k7ebw_2 { width: 100%; height: 100%; transform: scaleX(.2308); transform-origin: 0; }
  ._BookmarkDot_k7ebw_2 { position: absolute; left: 10px; width: 2px; height: 2px; border-radius: 100%; }
  button[aria-current="true"] ._Marker_k7ebw_2 { color: var(--color-text); opacity: var(--bookmarked-opacity, .6); }
  :is(button:focus-visible, button[data-scrub-target]) ._Marker_k7ebw_2 { color: var(--color-text); opacity: 1; }
  :is(button:focus-visible, button[data-scrub-target]) ._MarkerLine_k7ebw_2 { transform: scaleX(1); }
  @media (hover: hover) {
    [data-floating-navigation-rail-list] button:hover ._Marker_k7ebw_2 { color: var(--color-text); opacity: 1; }
    [data-floating-navigation-rail-list] button:hover ._MarkerLine_k7ebw_2 { transform: scaleX(1); }
  }
  #scroll { margin-left: 160px; height: 600px; overflow: auto; }
  article { min-height: 500px; padding-top: 16px; }
  #preview { position: absolute; left: 56px; top: 160px; background: #ffffff; color: var(--color-text); padding: 12px; }
  #outside { position: fixed; bottom: 12px; right: 12px; background: #ffffff; }
`;

function marker(bookmarked = false): string {
  return `<span class="_Marker_k7ebw_2"><span class="_MarkerLine_k7ebw_2"></span>${bookmarked ? '<span class="_BookmarkDot_k7ebw_2"></span>' : ""}</span>`;
}

function nativePage(background: string): string {
  return `<style>${markerCss} main { background: ${background}; }</style>
    <main class="main-surface">
      <nav aria-label="History"><div id="rail" data-floating-navigation-rail-list data-thread-user-message-navigation-rail-list>
        ${Array.from({ length: 24 }, (_, i) => `<button type="button" data-thread-user-message-navigation-item-id="message-${i}" aria-label="Jump to message ${i}"${i === 0 ? ' aria-current="true"' : ""}>${marker(i === 2)}</button>`).join("")}
      </div></nav>
      <div id="scroll" class="thread-scroll-container">${Array.from({ length: 24 }, (_, i) => `<article id="message-${i}">History message ${i}</article>`).join("")}</div>
      <div id="preview" role="tooltip" hidden></div>
    </main>
    <div id="outside" data-floating-navigation-rail-list><button>${marker()}</button></div>
    <script>
      document.querySelectorAll('#rail button').forEach(button => {
        const id = button.getAttribute('data-thread-user-message-navigation-item-id');
        button.addEventListener('click', () => {
          document.getElementById(id).scrollIntoView({block: 'start', behavior: 'instant'});
          document.querySelector('#scroll').dataset.lastJump = id;
        });
        button.addEventListener('pointerenter', () => {
          const preview = document.querySelector('#preview');
          preview.textContent = document.getElementById(id).textContent;
          preview.hidden = false;
        });
      });
    </script>`;
}

for (const theme of [
  {
    name: "dark wallpaper with native light appearance",
    background: "#090705",
    secondary: "#edd9b1",
    text: "#fff8eb",
    expectedSecondary: "rgb(237, 217, 177)",
    expectedText: "rgb(255, 248, 235)",
    mode: "configured",
  },
  {
    name: "light surface with advanced styles",
    background: "#faf3e7",
    secondary: "#64502e",
    text: "#281b08",
    expectedSecondary: "rgb(100, 80, 46)",
    expectedText: "rgb(40, 27, 8)",
    mode: "advanced",
  },
] as const) {
  test(`history marks follow ${theme.name}`, async ({ shell }, testInfo) => {
    await shell.setContent(nativePage(theme.background));
    const button = (index: number) =>
      shell.getByRole("button", {
        name: `Jump to message ${index}`,
        exact: true,
      });
    const line = (index: number) =>
      button(index).locator("._MarkerLine_k7ebw_2");
    await expect(line(1)).toHaveCSS("background-color", "rgb(93, 93, 93)");

    const configuration = readThemeConfiguration({});
    expect(
      await shell.evaluate(
        buildThemePayload("codexstyle-navigation-test", "", "", {
          ...configuration,
          colors: {
            ...configuration.colors,
            background: theme.background,
            secondary: theme.secondary,
            text: theme.text,
          },
          styleConfig: { ...configuration.styleConfig, mode: theme.mode },
          appearance: "light",
          backgroundScope: "window",
          sidebarOverlayOpacity: 0,
        }),
      ),
    ).toBe(true);
    await shell.screenshot({ path: testInfo.outputPath("history-marks.png") });
    await expect(line(1)).toHaveCSS(
      "background-color",
      theme.expectedSecondary,
    );
    await expect(line(0)).toHaveCSS("background-color", theme.expectedText);
    await expect(button(1).locator("._Marker_k7ebw_2")).toHaveCSS(
      "opacity",
      "0.4",
    );
    await expect(button(2).locator("._Marker_k7ebw_2")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(button(2).locator("._BookmarkDot_k7ebw_2")).toHaveCSS(
      "background-color",
      theme.expectedSecondary,
    );
    await expect(shell.locator("#outside ._MarkerLine_k7ebw_2")).toHaveCSS(
      "background-color",
      "rgb(93, 93, 93)",
    );

    await button(3).hover();
    await expect(line(3)).toHaveCSS("background-color", theme.expectedText);
    await expect(shell.getByRole("tooltip")).toHaveText("History message 3");
    await expect(shell.getByRole("tooltip")).toHaveCSS(
      "color",
      "rgb(17, 17, 17)",
    );
    await button(3).click();
    await expect(shell.locator("#scroll")).toHaveAttribute(
      "data-last-jump",
      "message-3",
    );
    expect(
      await shell.locator("#scroll").evaluate((node) => node.scrollTop),
    ).toBeGreaterThan(1000);
    await button(4).focus();
    await shell.keyboard.press("Enter");
    await expect(line(4)).toHaveCSS("background-color", theme.expectedText);
    await expect(shell.locator("#scroll")).toHaveAttribute(
      "data-last-jump",
      "message-4",
    );
    await button(6).evaluate((node) =>
      node.setAttribute("data-scrub-target", "true"),
    );
    await expect(line(6)).toHaveCSS("background-color", theme.expectedText);

    // The semantic selector must work in the insertion task, before mapping.
    const immediate = await shell.locator("#rail").evaluate((node) => {
      const replacement = node.cloneNode(true) as HTMLElement;
      node.replaceWith(replacement);
      return getComputedStyle(
        replacement.querySelector("button:nth-child(2) ._MarkerLine_k7ebw_2")!,
      ).backgroundColor;
    });
    expect(immediate).toBe(theme.expectedSecondary);
    await shell
      .locator("#rail")
      .evaluate((node) =>
        node.removeAttribute("data-thread-user-message-navigation-rail-list"),
      );
    await expect(line(1)).toHaveCSS("background-color", "rgb(93, 93, 93)");
  });
}
