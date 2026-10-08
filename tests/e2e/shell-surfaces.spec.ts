import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import {
  generateConfiguredCss,
  readThemeConfiguration,
  resolveSidebarSurface,
} from "../../src/contracts";
import {
  buildThemePayload,
  type ThemePayloadSettings,
} from "../../src/main/session/theme-payload";

const test = base.extend<{ shell: Page }>({
  shell: async ({ browserName }, use) => {
    const profile = await mkdtemp(
      join(tmpdir(), `codexstyle-shell-${browserName}-`),
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

// Paint layers and anchors verified in Store 26.1002.7124.0. Native colors
// remain independent of theme tokens, so a missed layer stays visibly opaque.
const nativeCss = `
  html, body { margin: 0; min-height: 100%; }
  :root { --native-surface: #fff; }
  aside.app-shell-left-panel { position: fixed; left: 20px; top: 20px; width: 200px; height: 500px; background: var(--native-surface); }
  aside.app-shell-left-panel::after { content: ''; position: absolute; inset: 0; background: inherit; pointer-events: none; }
  [data-slate-sidebar-content].sidebar-navigation { position: relative; z-index: 1; height: 100%; overflow-y: auto; background: color-mix(in oklab, var(--native-surface) 65%, transparent); }
  aside[data-slate-sidebar-peeking="true"] [data-slate-sidebar-content] { margin: 16px; height: calc(100% - 32px); border-radius: 18px; background: rgb(from var(--native-surface) r g b / 1); box-shadow: 0 8px 24px #0003; }
  #sidebar-row { display: block; border: 0; background: transparent; padding: 10px; }
  #sidebar-row:hover { background: rgba(60, 70, 80, .15); }
  #tooltip { position: fixed; left: 700px; background: #fff; }
  #top-parent { background: rgba(10, 20, 30, .2); }
  [class*="_MainContentTopFade_"] { position: absolute; top: 0; height: 28px; background: linear-gradient(var(--native-surface), transparent); pointer-events: none; }
  .bg-gradient-to-t { background-image: linear-gradient(to top, var(--native-surface), transparent); }
  .bg-surface, [data-thread-scroll-footer]:has([data-thread-focus-mode]) { background-color: var(--native-surface); }
  .pointer-events-none { pointer-events: none; }
  .absolute { position: absolute; }
  .sticky { position: sticky; }
  .bottom-0 { bottom: 0; }
  .inset-x-0 { left: 0; right: 0; }
  #edge-main { position: fixed; left: 280px; top: 120px; width: 600px; height: 480px; }
  #thread-layout { position: relative; width: 100%; height: 100%; }
  #scroll { height: 100%; display: flex; flex-direction: column-reverse; overflow-y: auto; mask-image: linear-gradient(#000, #000); --thread-scroll-padding-bottom: 144px; }
  #transcript { min-height: 100%; display: flex; flex-direction: column; flex-shrink: 0; }
  #message-content { position: relative; flex: 1; }
  #sticky-plate { height: 128px; flex-shrink: 0; }
  #split-fade { top: -32px; height: 32px; }
  #footer { height: 144px; }
  #footer-plate { top: -32px; margin-top: 32px; }
  #composer { position: relative; z-index: 10; margin-left: 200px; width: 360px; height: 96px; pointer-events: auto; }
  #user-message { width: fit-content; }
  #thread-layout[data-presentation="compact"] #scroll { flex-direction: column; }
  #thread-layout[data-presentation="compact"] #sticky-plate { height: 144px; }
  #composer, #user-message { background: var(--native-surface); }
`;

const sidebarHtml = `
  <aside id="sidebar" class="app-shell-left-panel _LeftPanel_test">
    <div id="sidebar-content" class="sidebar-navigation" data-slate-sidebar-content>
      <button id="sidebar-row">Task</button>
    </div>
  </aside>
  <div id="tooltip" role="tooltip">Native tooltip</div>`;

function settings(): ThemePayloadSettings {
  const configuration = readThemeConfiguration({});
  return {
    ...configuration,
    styleConfig: { ...configuration.styleConfig, mode: "configured" },
    backgroundScope: "window",
    sidebarOverlayOpacity: 0,
    art: { ...configuration.art, taskMode: "full", safeArea: "none" },
    colors: { ...configuration.colors, background: "rgba(255, 255, 255, 0)" },
  };
}

function payload(theme: ThemePayloadSettings, art = "", css?: string): string {
  return buildThemePayload(
    "codexstyle-shell-test",
    css ?? generateConfiguredCss(theme.styleConfig),
    art,
    theme,
  );
}

async function pinkArt(): Promise<string> {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "#f8b9ce" },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

for (const appearance of ["light", "dark"] as const) {
  test(`sidebar has one paint layer and matches Studio pixels in ${appearance}`, async ({
    shell,
  }, testInfo) => {
    const previewCss = await readFile("src/renderer/styles/global.css", "utf8");
    const art = await pinkArt();
    for (const [alpha, darkening, recipe] of [
      [0, 0, true],
      [0.09, 0, false],
      [1, 0, false],
      [0.36, 40, true],
    ] as const) {
      await shell.goto("app://test/");
      const theme = settings();
      theme.appearance = appearance;
      theme.sidebarOverlayOpacity = darkening;
      theme.colors.panel = `rgba(255, 66, 113, ${alpha})`;
      theme.styleConfig.blur = 9;
      theme.styleConfig.recipes.sidebar = recipe;
      const surface = resolveSidebarSurface(theme.colors.panel, darkening);
      await shell.setContent(`<style>${previewCss}\n${nativeCss}
        :root { --native-surface: ${appearance === "light" ? "#fff" : "#171718"}; }
        .mock-codex { position: fixed; left: 280px; top: 20px; width: 200px; height: 500px; border: 0; border-radius: 0; --preview-sidebar-surface: ${surface.color}; --preview-blur: 9px; }
        .mock-codex .mock-sidebar { width: 100%; max-width: none; min-width: 0; height: 100%; padding: 0; border: 0; }
      </style>${sidebarHtml}
      <section class="mock-codex" data-background-scope="window" data-task-mode="full" data-style-mode="configured" data-recipe-sidebar="${recipe}" data-sidebar-surface-transparent="${surface.transparent}">
        <img class="mock-background" src="${art}" /><aside id="preview" class="mock-sidebar"></aside>
      </section>`);
      expect(await shell.evaluate(payload(theme, art))).toBe(true);
      await shell
        .locator("img")
        .evaluate((node) => (node as HTMLImageElement).decode());
      const expectedColor = await shell
        .locator("#preview")
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      const expectedBlur = recipe && alpha !== 0 ? "blur(9px)" : "none";
      for (const peeking of [false, true, false]) {
        await shell.locator("#sidebar").evaluate((node, peek) => {
          if (peek) node.setAttribute("data-slate-sidebar-peeking", "true");
          else node.removeAttribute("data-slate-sidebar-peeking");
        }, peeking);
        await expect(shell.locator("#sidebar")).toHaveCSS(
          "background-color",
          peeking ? "rgba(0, 0, 0, 0)" : expectedColor,
        );
        await expect(shell.locator("#sidebar-content")).toHaveCSS(
          "background-color",
          peeking ? expectedColor : "rgba(0, 0, 0, 0)",
        );
        await expect(shell.locator("#sidebar")).toHaveCSS(
          "backdrop-filter",
          peeking ? "none" : expectedBlur,
        );
        await expect(shell.locator("#sidebar-content")).toHaveCSS(
          "backdrop-filter",
          peeking ? expectedBlur : "none",
        );
        expect(
          await shell
            .locator("#sidebar")
            .evaluate(
              (node) => getComputedStyle(node, "::after").backgroundColor,
            ),
        ).toBe("rgba(0, 0, 0, 0)");
        if (peeking) {
          await expect(shell.locator("#sidebar-content")).toHaveCSS(
            "border-radius",
            "18px",
          );
          await expect(shell.locator("#sidebar-content")).toHaveCSS(
            "overflow-y",
            "auto",
          );
        }
        const screenshot = await shell.screenshot({
          timeout: 8_000,
          path:
            alpha === 0.09 && peeking
              ? testInfo.outputPath("sidebar-native-vs-preview.png")
              : undefined,
        });
        const pixel = async (left: number) => [
          ...(await sharp(screenshot)
            .extract({ left, top: 300, width: 1, height: 1 })
            .removeAlpha()
            .raw()
            .toBuffer()),
        ];
        expect(await pixel(120)).toEqual(await pixel(380));
      }
      const immediate = await shell
        .locator("#sidebar-content")
        .evaluate((node) => {
          const replacement = node.cloneNode(true) as HTMLElement;
          node.replaceWith(replacement);
          return getComputedStyle(replacement).backgroundColor;
        });
      expect(immediate).toBe("rgba(0, 0, 0, 0)");
      await shell.locator("#sidebar-row").hover();
      await expect(shell.locator("#sidebar-row")).toHaveCSS(
        "background-color",
        "rgba(60, 70, 80, 0.15)",
      );
      await expect(shell.locator("#tooltip")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
    }
  });
}

const splitFade = `<div id="split-fade" aria-hidden="true" class="pointer-events-none absolute inset-x-0 -top-8 z-0 h-8 bg-gradient-to-t from-surface to-transparent"></div>`;
const footerPlate = `<div id="footer-plate" aria-hidden="true" class="pointer-events-none absolute inset-x-0 -top-8 z-0 bottom-0 mt-8 bg-surface"></div>`;
type ThreadPresentation = "default" | "compact";

// Default/panel put the footer inside the scroll container beside the transcript.
// Compact puts it outside the scroll container and omits both paint children.
function edgeHtml(presentation: ThreadPresentation = "default"): string {
  const compact = presentation === "compact";
  const footer = `<div id="footer" data-thread-scroll-footer="true" class="pointer-events-none absolute inset-x-0 z-20 bottom-0 has-[[data-thread-focus-mode]]:bg-surface">
    ${compact ? "" : footerPlate}<div data-codex-composer-root data-thread-focus-mode><div id="composer" data-composer-surface-variant="default"><div data-composer-layout>Composer</div></div></div>
  </div>`;
  return `${sidebarHtml}<main id="edge-main" class="main-surface">
  <div id="top-parent" data-app-shell-main-content-top-fade="true"><div id="top-fade" aria-hidden="true" class="_MainContentTopFade_test"></div></div>
  <div id="legacy-top" aria-hidden="true" data-app-shell-main-content-top-fade="true" class="bg-surface"></div>
  <div id="thread-layout" class="group/thread-scroll-layout" data-presentation="${presentation}">
    <div id="scroll" class="thread-scroll-container">
      <div id="transcript" class="[container-type:inline-size] flex min-h-full shrink-0 flex-col [container-name:thread-content]">
        <div id="message-content" data-mcp-app-portal-target="true" data-thread-user-message-navigation-content="true">
          <div id="legacy-fade" aria-hidden="true" class="bg-gradient-to-t from-surface via-surface to-transparent"></div>
          <div id="user-message" data-user-message-bubble="true">Message</div>
          <section><div aria-hidden="true" class="pointer-events-none sticky bottom-0"><div id="card-gradient" aria-hidden="true" class="pointer-events-none absolute inset-x-0 bg-gradient-to-t from-surface to-transparent"></div></div></section>
          <section><div id="nested-footer" data-thread-scroll-footer="true" class="bg-surface"></div></section>
        </div>
        <div id="sticky-plate" aria-hidden="true" class="pointer-events-none sticky bottom-0 z-10 mt-auto w-full shrink-0">${compact ? "" : splitFade}</div>
      </div>
      ${compact ? "" : footer}
    </div>
    ${compact ? footer : ""}
  </div></main>
  <section><div id="outside-gradient" aria-hidden="true" class="pointer-events-none absolute inset-x-0 bg-gradient-to-t from-surface via-surface"></div><div id="outside-footer" data-thread-scroll-footer="true" class="bg-surface"></div></section>`;
}

async function paint(page: Page, id: string) {
  return page.locator(`#${id}`).evaluate((node) => {
    const css = getComputedStyle(node);
    return {
      color: css.backgroundColor,
      image: css.backgroundImage,
      position: css.position,
      pointer: css.pointerEvents,
      mask: css.maskImage,
    };
  });
}

function edgeIds(presentation: ThreadPresentation): string[] {
  return [
    "top-fade",
    "legacy-top",
    "legacy-fade",
    ...(presentation === "default" ? ["split-fade", "footer-plate"] : []),
    "footer",
  ];
}

for (const presentation of ["default", "compact"] as const) {
  for (const alpha of [0, 0.2]) {
    test(`native edge layers clear in ${presentation} with ${alpha} alpha`, async ({
      shell,
    }, testInfo) => {
      await shell.setContent(
        `<style>${nativeCss}</style>${edgeHtml(presentation)}`,
      );
      const edges = edgeIds(presentation);
      const before = Object.fromEntries(
        await Promise.all(
          [
            ...edges,
            "top-parent",
            "card-gradient",
            "nested-footer",
            "outside-gradient",
            "outside-footer",
            "scroll",
          ].map(async (id) => [id, await paint(shell, id)]),
        ),
      );
      expect(before["top-fade"].image).toContain("linear-gradient");
      if (presentation === "default") {
        expect(before["split-fade"].image).toContain("linear-gradient");
        expect(before["footer-plate"].color).toBe("rgb(255, 255, 255)");
      }
      expect(before.footer.color).toBe("rgb(255, 255, 255)");
      const theme = settings();
      theme.colors.background = `rgba(255, 255, 255, ${alpha})`;
      theme.colors.panelAlt = "rgba(255, 66, 113, 0.24)";
      theme.styleConfig.recipes.composer = true;
      theme.styleConfig.recipes.message = true;
      const art = await pinkArt();
      expect(await shell.evaluate(payload(theme, art))).toBe(true);
      await shell.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
      }, art);
      const screenshot = await shell.screenshot({
        timeout: 8_000,
        path: testInfo.outputPath("thread-bottom.png"),
      });
      const pixel = async (left: number, top: number) => [
        ...(await sharp(screenshot)
          .extract({ left, top, width: 1, height: 1 })
          .removeAlpha()
          .raw()
          .toBuffer()),
      ];
      const background = await pixel(310, 300);
      expect
        .soft(await pixel(310, 448), "bottom fade pixels")
        .toEqual(background);
      expect
        .soft(await pixel(310, 570), "footer blank pixels")
        .toEqual(background);
      for (const id of edges) {
        const after = await paint(shell, id);
        expect.soft(after.color, id).toBe("rgba(0, 0, 0, 0)");
        expect.soft(after.image, id).toBe("none");
        expect(after.position).toBe(before[id].position);
        expect(after.pointer).toBe(before[id].pointer);
      }
      for (const id of [
        "top-parent",
        "card-gradient",
        "nested-footer",
        "outside-gradient",
        "outside-footer",
        "scroll",
      ]) {
        expect(await paint(shell, id)).toEqual(before[id]);
      }
      for (const id of [
        "card-gradient",
        "nested-footer",
        "outside-gradient",
        "outside-footer",
      ]) {
        expect(
          await shell.locator(`#${id}`).getAttribute("data-ds-part"),
        ).toBeNull();
      }
      for (const id of ["composer", "user-message"]) {
        await expect(shell.locator(`#${id}`)).toHaveCSS(
          "background-color",
          "rgba(255, 66, 113, 0.24)",
        );
      }
      const composerRoot = shell.locator("[data-codex-composer-root]");
      for (const focused of [false, true]) {
        await composerRoot.evaluate((node, enabled) => {
          if (enabled) node.setAttribute("data-thread-focus-mode", "true");
          else node.removeAttribute("data-thread-focus-mode");
        }, focused);
        expect
          .soft((await paint(shell, "footer")).color)
          .toBe("rgba(0, 0, 0, 0)");
      }
      for (const id of edges.filter(
        (id) => id !== "legacy-fade" && id !== "legacy-top",
      )) {
        const immediate = await shell.locator(`#${id}`).evaluate((node) => {
          const replacement = node.cloneNode(true) as HTMLElement;
          for (const descendant of [
            replacement,
            ...replacement.querySelectorAll("*"),
          ]) {
            for (const name of [...descendant.getAttributeNames()]) {
              if (
                name.startsWith("data-codexstyle-") ||
                name === "data-ds-part"
              )
                descendant.removeAttribute(name);
            }
          }
          node.replaceWith(replacement);
          const css = getComputedStyle(replacement);
          return { color: css.backgroundColor, image: css.backgroundImage };
        });
        expect
          .soft(immediate, `replaced ${id}`)
          .toEqual({ color: "rgba(0, 0, 0, 0)", image: "none" });
      }
      if (presentation === "default") {
        for (const id of ["split-fade", "footer-plate"]) {
          await expect(shell.locator(`#${id}`)).toHaveAttribute(
            "data-ds-part",
            "composer-backdrop",
          );
        }
      }
    });
  }
}

test("native edges and content sidebar retain their scoped fallbacks", async ({
  shell,
}) => {
  for (const mode of ["content", "off"] as const) {
    await shell.goto("app://test/");
    await shell.setContent(`<style>${nativeCss}</style>${edgeHtml()}`);
    const edges = edgeIds("default");
    const ids = mode === "content" ? [...edges, "sidebar-content"] : edges;
    const before = await Promise.all(ids.map((id) => paint(shell, id)));
    const theme = settings();
    theme.styleConfig.recipes.sidebar = false;
    if (mode === "content") theme.backgroundScope = "content";
    else theme.art.taskMode = "off";
    expect(await shell.evaluate(payload(theme))).toBe(true);
    expect(await Promise.all(ids.map((id) => paint(shell, id)))).toEqual(
      before,
    );
  }
});

test("advanced sidebar blur stays custom, with zero alpha still fully clear", async ({
  shell,
}) => {
  for (const alpha of [0.3, 0]) {
    await shell.goto("app://test/");
    await shell.setContent(`<style>${nativeCss}</style>${sidebarHtml}`);
    const theme = settings();
    theme.colors.panel = `rgba(255, 66, 113, ${alpha})`;
    theme.styleConfig.mode = "advanced";
    expect(
      await shell.evaluate(
        payload(
          theme,
          "",
          '[data-ds-part="sidebar"] { backdrop-filter: blur(7px); }',
        ),
      ),
    ).toBe(true);
    for (const peeking of [false, true]) {
      await shell
        .locator("#sidebar")
        .evaluate(
          (node, peek) =>
            node.setAttribute("data-slate-sidebar-peeking", String(peek)),
          peeking,
        );
      await expect(shell.locator("#sidebar")).toHaveCSS(
        "backdrop-filter",
        alpha === 0 ? "none" : "blur(7px)",
      );
      await expect(shell.locator("#sidebar-content")).toHaveCSS(
        "backdrop-filter",
        "none",
      );
    }
  }
});
