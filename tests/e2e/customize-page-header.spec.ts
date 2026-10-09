import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { readThemeConfiguration } from "../../src/contracts";
import { buildThemePayload } from "../../src/main/session/theme-payload";

const marker = "codexstyle-00000000-0000-4000-8000-000000000000";
const transparent = "rgba(0, 0, 0, 0)";
const themes = [
  {
    name: "transparent pink",
    background: "rgba(250, 199, 216, 0)",
    appearance: "light",
  },
  {
    name: "translucent pink",
    background: "rgba(250, 199, 216, 0.2)",
    appearance: "light",
  },
  { name: "opaque white", background: "#ffffff", appearance: "light" },
  { name: "opaque dark", background: "#182230", appearance: "dark" },
] as const;

// Store 26.1002.7124.0 shares this header between Skills and Plugins. The
// shell has no sticky/bg-surface utility classes: its white surface is ::before.
// Retain the actual CSS module hierarchy and semantic attributes, independently
// of the payload's selectors, so a missed surface remains visibly white.
const nativePage = `<!doctype html><html data-codex-window-type="electron">
<head><style>
  html, body { margin: 0; }
  :root { --color-surface: #fff; }
  nav { height: 48px; }
  main { position: fixed; top: 48px; left: 20px; right: 20px; height: 650px; }
  [data-app-shell-inline-page-header] { position: relative; height: 100%; overflow-y: auto; }
  .page-body { min-height: 1500px; }
  ._shell_bomwa_2 { padding-top: 16px; border-bottom: 1px solid transparent; container-type: inline-size; }
  ._shell_bomwa_2[data-sticky] { top: -16px; z-index: 30; position: sticky; }
  ._shell_bomwa_2[data-sticky]::before {
    content: ""; pointer-events: none; z-index: -1; inset-inline: 0;
    inset-block: var(--header-background-top-inset, 0px) 0;
    background-color: var(--color-surface); position: absolute;
  }
  ._content_bomwa_2 { display: flex; margin: auto; padding: 0 32px; max-width: 960px; }
  ._headerRow_bomwa_2 { display: flex; align-items: center; gap: 16px; width: 100%; height: 76px; }
  ._title_bomwa_2 { flex: 1; }
  ._actions_bomwa_2, ._toolbar_bomwa_2 { display: flex; align-items: center; gap: 12px; }
  .search-control { display: flex; height: 32px; border: 1px solid #ddd; border-radius: 999px; background: transparent; }
  input { background: transparent; }
  #header-action { background: #191b1d; color: #fff; border-radius: 999px; height: 32px; }
  .bg-surface { background: var(--color-surface); }
  #content-card { margin: 140px 32px; width: 200px; height: 80px; }
  #unrelated-header { position: fixed; top: 720px; left: 20px; width: 300px; }
</style></head><body>
  <nav><button data-page="plugins">Plugins</button><button data-page="skills">Skills</button></nav>
  <main class="main-surface" role="main">
    <div id="page-scroll" data-app-shell-inline-page-header data-new-slate-layout>
      <div id="page-body" class="page-body"></div>
    </div>
  </main>
  <div id="unrelated-header" class="_shell_bomwa_2" data-sticky><input id="plugins-page-search"></div>
  <script>
    const body = document.querySelector('#page-body');
    const render = (page) => {
      body.innerHTML = '<div id="page-header" class="_shell_bomwa_2 border-transparent" data-sticky data-scroll-collapse data-expand-search data-wrap-actions>' +
        '<div class="_content_bomwa_2 mx-auto w-full"><div class="_headerRow_bomwa_2">' +
        '<div class="_title_bomwa_2"><div class="_titleContent_bomwa_2"><h1>' + page + '</h1></div></div>' +
        '<div class="_actions_bomwa_2"><div class="_toolbar_bomwa_2"><div class="_search_bomwa_2">' +
        '<div class="no-drag search-control"><input id="plugins-page-search"></div></div>' +
        '<div class="_pageActions_bomwa_2"><button id="header-action">Add</button></div></div></div></div>' +
        '<div class="_navigation_bomwa_2"></div></div></div><div id="content-card" class="bg-surface">Native card</div>';
      document.querySelector('#header-action').addEventListener('click', (event) => { event.target.dataset.clicked = 'true'; });
    };
    render('plugins');
    document.querySelectorAll('button[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        render(button.dataset.page);
        const header = document.querySelector('#page-header');
        button.dataset.immediate = JSON.stringify({
          background: getComputedStyle(header, '::before').backgroundColor,
          part: header.getAttribute('data-ds-part'),
        });
      });
    });
  </script>
</body></html>`;

async function headerAndContentPixels(page: Page, screenshotPath?: string) {
  const header = await page.locator("#page-header").boundingBox();
  if (!header) throw new Error("Missing header bounds");
  const { data, info } = await sharp(
    await page.screenshot({ path: screenshotPath }),
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sample = (y: number) => {
    const offset =
      (Math.floor(y) * info.width + Math.floor(header.x + 8)) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };
  return {
    header: sample(header.y + 24),
    content: sample(header.y + header.height + 64),
  };
}

for (const theme of themes) {
  test(`themes Skills and Plugins headers immediately with ${theme.name}`, async ({
    browserName,
  }, testInfo) => {
    const profile = await mkdtemp(
      join(tmpdir(), `codexstyle-customize-header-${browserName}-`),
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
        env: {
          ...env,
          CODEXSTYLE_TEST_USER_DATA: profile,
          CODEXSTYLE_TEST_OFFSCREEN: "1",
        },
      });
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(
          false,
        ),
      );
      const page = await application.firstWindow();
      await expect(page).toHaveURL("app://test/");
      await page.setContent(nativePage);
      const header = page.locator("#page-header");
      const surface = () =>
        header.evaluate(
          (node) => getComputedStyle(node, "::before").backgroundColor,
        );
      expect(await surface()).toBe("rgb(255, 255, 255)");
      expect(
        (
          await headerAndContentPixels(
            page,
            testInfo.outputPath("native-header.png"),
          )
        ).header,
      ).toEqual([255, 255, 255]);

      const configuration = readThemeConfiguration({});
      const artwork =
        "data:image/svg+xml;base64," +
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="#fac7d8" d="M0 0h1v1H0z"/></svg>',
        ).toString("base64");
      expect(
        await page.evaluate(
          buildThemePayload(marker, "", artwork, {
            ...configuration,
            colors: { ...configuration.colors, background: theme.background },
            appearance: theme.appearance,
            backgroundScope: "window",
            sidebarOverlayOpacity: 0,
            art: { ...configuration.art, taskMode: "full", safeArea: "none" },
          }),
        ),
      ).toBe(true);

      expect(await surface()).toBe(transparent);
      await expect(header).toHaveAttribute("data-ds-part", "page-search-rail");
      for (const destination of ["Skills", "Plugins"]) {
        const button = page.getByRole("button", {
          name: destination,
          exact: true,
        });
        await button.click();
        expect(
          JSON.parse((await button.getAttribute("data-immediate"))!),
        ).toEqual({ background: transparent, part: null });
        await expect(header).toHaveAttribute(
          "data-ds-part",
          "page-search-rail",
        );
        const pixels = await headerAndContentPixels(
          page,
          testInfo.outputPath(`${destination.toLowerCase()}-themed.png`),
        );
        expect(pixels.header).toEqual(pixels.content);
        await expect(header).toHaveCSS("background-color", transparent);
        await expect(header.locator(".search-control")).toHaveCSS(
          "background-color",
          transparent,
        );
        await header.locator("input").fill("Codex");
        await expect(header.locator("input")).toHaveValue("Codex");
        await header.getByRole("button", { name: "Add" }).click();
        await expect(header.locator("#header-action")).toHaveAttribute(
          "data-clicked",
          "true",
        );
        await expect(header.locator("#header-action")).toHaveCSS(
          "background-color",
          "rgb(25, 27, 29)",
        );
        await page.locator("#page-scroll").evaluate((node) => {
          node.scrollTop = 200;
        });
        await expect.poll(async () => (await header.boundingBox())?.y).toBe(32);
        expect(await surface()).toBe(transparent);
        await page.locator("#page-scroll").evaluate((node) => {
          node.scrollTop = 0;
        });
      }

      // Removing only an attribute must also release stale ownership; a
      // subsequent reuse regains immediate CSS without waiting for the mapper.
      await header.locator("input").evaluate((node) => {
        node.id = "other-page-search";
      });
      await expect(header).not.toHaveAttribute("data-ds-part");
      expect(await surface()).toBe("rgb(255, 255, 255)");
      await header.locator("input").evaluate((node) => {
        node.id = "plugins-page-search";
      });
      expect(await surface()).toBe(transparent);
      await expect(header).toHaveAttribute("data-ds-part", "page-search-rail");
      await header.evaluate((node) => node.removeAttribute("data-sticky"));
      await expect(header).not.toHaveAttribute("data-ds-part");
      await header.evaluate((node) => node.setAttribute("data-sticky", ""));
      expect(await surface()).toBe(transparent);
      await expect(header).toHaveAttribute("data-ds-part", "page-search-rail");

      await expect(page.locator("#content-card")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      await expect(page.locator("#content-card")).not.toHaveAttribute(
        "data-ds-part",
      );
      await expect(page.locator("#unrelated-header")).not.toHaveAttribute(
        "data-ds-part",
      );
      expect(
        await page
          .locator("#unrelated-header")
          .evaluate(
            (node) => getComputedStyle(node, "::before").backgroundColor,
          ),
      ).toBe("rgb(255, 255, 255)");
      await page
        .locator("#page-scroll")
        .evaluate((node) =>
          node.removeAttribute("data-app-shell-inline-page-header"),
        );
      await expect(header).not.toHaveAttribute("data-ds-part");
      expect(await surface()).toBe("rgb(255, 255, 255)");
      await page
        .locator("#page-scroll")
        .evaluate((node) =>
          node.setAttribute("data-app-shell-inline-page-header", ""),
        );
      expect(await surface()).toBe(transparent);
      await expect(header).toHaveAttribute("data-ds-part", "page-search-rail");
      expect(
        await page.evaluate(() => {
          document.documentElement.setAttribute(
            "data-codexstyle-owner",
            "foreign",
          );
          const current = document.querySelector("#page-header")!;
          const replacement = current.cloneNode(true) as HTMLElement;
          replacement.removeAttribute("data-ds-part");
          replacement.removeAttribute("data-codexstyle-owner");
          current.replaceWith(replacement);
          return getComputedStyle(replacement, "::before").backgroundColor;
        }),
      ).toBe("rgb(255, 255, 255)");
    } finally {
      await application?.close();
      if (
        dirname(resolve(profile)) !== resolve(tmpdir()) ||
        !basename(profile).startsWith("codexstyle-customize-header-")
      )
        throw new Error("Unexpected disposable profile path");
      await rm(profile, { recursive: true, force: true });
    }
  });
}
