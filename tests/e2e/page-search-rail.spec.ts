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
    name: "transparent artwork",
    background: "rgba(250, 199, 216, 0)",
    computed: "rgba(250, 199, 216, 0)",
    appearance: "light",
  },
  {
    name: "translucent artwork",
    background: "rgba(250, 199, 216, 0.2)",
    computed: "rgba(250, 199, 216, 0.2)",
    appearance: "light",
  },
  {
    name: "opaque dark surface",
    background: "#182230",
    computed: "rgb(24, 34, 48)",
    appearance: "dark",
  },
] as const;

// Reduced from the shared search surface in Store 26.901.2854.0: both pages
// render a sticky bg-surface wrapper with a 32px surface-to-transparent ::after.
// Native Chromium, rather than JSDOM, must resolve :has() and pseudo gradients.
const nativePage = `<!doctype html>
<html><head><style>
  :root { --color-surface: #fff; }
  body { margin: 0; }
  .bg-surface { background-color: var(--color-surface); }
  .sticky { position: sticky; top: 0; }
  .search-surface { padding: 20px; }
  .search-surface::after {
    content: ""; position: absolute; top: 100%; left: 0;
    width: 100%; height: 32px; pointer-events: none;
    background-image: linear-gradient(to bottom, var(--color-surface), transparent);
  }
  input { background-color: rgb(255, 250, 250); }
</style></head><body>
  <nav><button data-page="plugins">Plugins</button><button data-page="scheduled">Scheduled</button></nav>
  <main class="main-surface" role="main">
    <section id="page-content"></section>
    <div id="ordinary-surface" class="bg-surface">Ordinary surface</div>
    <div id="unrelated-sticky" class="sticky bg-surface"><input id="other-page-search"></div>
  </main>
  <script>
    const content = document.querySelector("#page-content");
    const render = (page) => {
      content.innerHTML = '<div id="search-rail" class="sticky z-30 bg-surface search-surface"><div><input id="' + page + '-page-search"></div></div>';
    };
    render("scheduled");
    document.querySelectorAll("button[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        render(button.dataset.page);
        const rail = document.querySelector("#search-rail");
        // Capture in the insertion task itself, before MutationObserver's
        // debounced mapping can hide an initial white flash.
        button.dataset.immediate = JSON.stringify({
          background: getComputedStyle(rail).backgroundColor,
          gradient: getComputedStyle(rail, "::after").backgroundImage,
          part: rail.getAttribute("data-ds-part"),
        });
      });
    });
  </script>
</body></html>`;

for (const theme of themes) {
  test(`themes scheduled and plugin search rails with ${theme.name}`, async () => {
    const profile = await mkdtemp(join(tmpdir(), "codexstyle-search-rail-"));
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
      const rail = page.locator("#search-rail");
      await expect(rail).toHaveCSS("background-color", "rgb(255, 255, 255)");
      expect(
        await rail.evaluate(
          (node) => getComputedStyle(node, "::after").backgroundImage,
        ),
      ).toBe("linear-gradient(rgb(255, 255, 255), rgba(0, 0, 0, 0))");

      const configuration = readThemeConfiguration({});
      const payload = buildThemePayload(marker, "", "", {
        ...configuration,
        colors: { ...configuration.colors, background: theme.background },
        appearance: theme.appearance,
        backgroundScope: "window",
        sidebarOverlayOpacity: 75,
      });
      expect(await page.evaluate(payload)).toBe(true);
      const expectedGradient = `linear-gradient(${theme.computed}, rgba(0, 0, 0, 0))`;

      // The scheduled page was the missing ID in the original plugins-only fix.
      await expect(rail).toHaveCSS("background-color", theme.computed);
      await expect(rail).toHaveAttribute("data-ds-part", "page-search-rail");
      expect(
        await rail.evaluate((node) => ({
          gradient: getComputedStyle(node, "::after").backgroundImage,
          height: getComputedStyle(node, "::after").height,
        })),
      ).toEqual({ gradient: expectedGradient, height: "32px" });

      for (const destination of ["Plugins", "Scheduled"]) {
        const button = page.getByRole("button", { name: destination });
        await button.click();
        const immediate = JSON.parse(
          (await button.getAttribute("data-immediate"))!,
        );
        expect(immediate).toEqual({
          background: theme.computed,
          gradient: expectedGradient,
          part: null,
        });
        await expect(rail).toHaveAttribute("data-ds-part", "page-search-rail");
        await expect(rail).toHaveCSS("background-color", theme.computed);
        expect(
          await rail.evaluate(
            (node) => getComputedStyle(node, "::after").backgroundImage,
          ),
        ).toBe(expectedGradient);
      }

      // Local rail overrides must not replace global surface tokens or input
      // styling; an unrelated sticky search remains a native white surface.
      for (const selector of ["#ordinary-surface", "#unrelated-sticky"]) {
        await expect(page.locator(selector)).toHaveCSS(
          "background-color",
          "rgb(255, 255, 255)",
        );
        await expect(page.locator(selector)).not.toHaveAttribute(
          "data-ds-part",
        );
      }
      await expect(rail.locator("input")).toHaveCSS(
        "background-color",
        "rgb(255, 250, 250)",
      );
    } finally {
      // Close only the application handle created above, then remove its unique
      // disposable profile. No process-name matching or user profile is involved.
      await application?.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
