import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  generateConfiguredCss,
  readThemeConfiguration,
} from "../../src/contracts";
import {
  buildThemePayload,
  type ThemePayloadSettings,
} from "../../src/main/session/theme-payload";

const marker = "codexstyle-message-first-paint";
const test = base.extend<{ shell: Page }>({
  shell: async ({ browserName }, use) => {
    const profileDirectory = resolve(tmpdir());
    const profilePrefix = `codexstyle-first-paint-${browserName}-`;
    const profile = await mkdtemp(join(profileDirectory, profilePrefix));
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
      if (
        dirname(resolve(profile)) !== profileDirectory ||
        !basename(profile).startsWith(profilePrefix)
      ) {
        throw new Error("Refusing to remove an unexpected test profile path");
      }
      await rm(profile, { recursive: true, force: true });
    }
  },
});

// Store 26.1002.7124.0 user-message and MarkdownRoot anchors. Native tokens are
// independent of theme tokens so a delayed part cannot accidentally look themed.
const userMessage = `<div id="sent" data-user-message-bubble="true" class="bg-user-message text-user-message _bubble_11evq_1 relative text-start">
  <div data-markdown-text-tone="user-message"><p>New message <a data-native-link href="#link">link</a> <span data-markdown-copy="inline-code">code</span></p></div>
</div>`;

function theme(appearance: "light" | "dark"): ThemePayloadSettings {
  const configuration = readThemeConfiguration({});
  return {
    ...configuration,
    appearance,
    backgroundScope: "window",
    sidebarOverlayOpacity: 0,
    art: { ...configuration.art, taskMode: "off" },
    colors: {
      ...configuration.colors,
      panelAlt: "rgba(220, 120, 150, 0.35)",
      userMessageText: "#a42b68",
    },
    styleConfig: { ...configuration.styleConfig, mode: "configured" },
  };
}

async function prepare(
  page: Page,
  settings: ThemePayloadSettings,
  css: string,
) {
  await page.setContent(`<style>
    :root { --color-background-user-message: ${settings.appearance === "light" ? "#f1f1f1" : "#262626"}; --color-text-user-message: ${settings.appearance === "light" ? "#000" : "#fff"}; }
    body { margin: 20px; background: #f8b9ce; }
    .bg-user-message { background-color: var(--color-background-user-message); }
    .text-user-message, [data-markdown-text-tone="user-message"] { color: var(--color-text-user-message); }
    [data-native-link] { color: #0969da; }
    [data-markdown-copy="inline-code"] { color: var(--color-text-user-message); }
  </style><aside class="app-shell-left-panel"></aside><main class="main-surface"><div id="messages" class="thread-scroll-container"></div></main>`);
  expect(
    await page.evaluate(buildThemePayload(marker, css, "", settings)),
  ).toBe(true);
}

async function mountFrames(page: Page, html: string) {
  return page.locator("#messages").evaluate(async (container, markup) => {
    container.insertAdjacentHTML("beforeend", markup);
    const bubble = container.querySelector("#sent")!;
    const paragraph = bubble.querySelector("p")!;
    const start = performance.now();
    const sample = () => ({
      elapsed: performance.now() - start,
      part: bubble.getAttribute("data-ds-part"),
      owner: bubble.getAttribute("data-codexstyle-owner"),
      background: getComputedStyle(bubble).backgroundColor,
      color: getComputedStyle(paragraph).color,
      link: getComputedStyle(bubble.querySelector("a")!).color,
      code: getComputedStyle(
        bubble.querySelector('[data-markdown-copy="inline-code"]')!,
      ).color,
    });
    // Observe the pre-paint checkpoint in this task; no full-page timer can run
    // before it. Frame samples then detect a visible native-to-theme transition.
    await Promise.resolve();
    const beforePaint = sample();
    const frames = [];
    for (let index = 0; index < 8; index++) {
      await new Promise(requestAnimationFrame);
      frames.push(sample());
    }
    return { beforePaint, frames };
  }, html);
}

for (const appearance of ["light", "dark"] as const) {
  for (const mode of ["configured", "advanced"] as const) {
    test(`new message is themed before first paint in ${appearance} ${mode}`, async ({
      shell,
    }, testInfo) => {
      const settings = theme(appearance);
      settings.styleConfig.mode = mode;
      const css =
        mode === "configured"
          ? generateConfiguredCss(settings.styleConfig)
          : '[data-ds-part="message"] { background-color: #135264; border-radius: 7px; }';
      await prepare(shell, settings, css);
      const samples = await mountFrames(
        shell,
        `<section data-local-conversation-user-anchor="true">${userMessage}</section>`,
      );
      const trace = testInfo.outputPath("message-frame-styles.json");
      await writeFile(trace, JSON.stringify(samples, null, 2));
      await testInfo.attach("message-frame-styles", {
        path: trace,
        contentType: "application/json",
      });
      for (const sample of [samples.beforePaint, ...samples.frames]) {
        expect
          .soft(sample.part, `message part at ${sample.elapsed}ms`)
          .toBe("message");
        expect.soft(sample.owner).toBe(marker);
        expect
          .soft(sample.background)
          .toBe(
            mode === "configured"
              ? "rgba(220, 120, 150, 0.35)"
              : "rgb(19, 82, 100)",
          );
        expect.soft(sample.color).toBe("rgb(164, 43, 104)");
        expect.soft(sample.link).toBe("rgb(9, 105, 218)");
        expect
          .soft(sample.code)
          .toBe(appearance === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
      }
    });
  }

  for (const surface of ["zero-alpha", "recipe-off"] as const) {
    test(`new message preserves ${surface} in ${appearance}`, async ({
      shell,
    }) => {
      const settings = theme(appearance);
      if (surface === "zero-alpha") {
        settings.colors.panelAlt = "rgba(220, 120, 150, 0)";
      } else {
        settings.styleConfig.recipes.message = false;
      }
      await prepare(
        shell,
        settings,
        generateConfiguredCss(settings.styleConfig),
      );
      const samples = await mountFrames(shell, userMessage);
      for (const sample of [samples.beforePaint, ...samples.frames]) {
        expect(sample.part).toBe("message");
        expect(sample.background).toBe(
          surface === "zero-alpha"
            ? "rgba(220, 120, 150, 0)"
            : appearance === "light"
              ? "rgb(241, 241, 241)"
              : "rgb(38, 38, 38)",
        );
        expect(sample.color).toBe("rgb(164, 43, 104)");
      }
    });
  }
}

test("replaced and reused message nodes are mapped before paint", async ({
  shell,
}) => {
  const settings = theme("light");
  await prepare(shell, settings, generateConfiguredCss(settings.styleConfig));
  const result = await shell
    .locator("#messages")
    .evaluate(async (container, markup) => {
      container.innerHTML = markup;
      await Promise.resolve();
      const first = container.querySelector("#sent")!;
      const replacement = first.cloneNode(true) as HTMLElement;
      replacement.removeAttribute("data-ds-part");
      replacement.removeAttribute("data-codexstyle-owner");
      replacement.removeAttribute("data-codexstyle-part");
      first.replaceWith(replacement);
      await Promise.resolve();
      const replaced = replacement.getAttribute("data-ds-part");
      replacement.setAttribute("data-user-message-bubble", "false");
      await Promise.resolve();
      const removed = {
        part: replacement.getAttribute("data-ds-part"),
        owner: replacement.getAttribute("data-codexstyle-owner"),
        marker: replacement.getAttribute("data-codexstyle-part"),
      };
      replacement.setAttribute("data-user-message-bubble", "true");
      await Promise.resolve();
      const restored = replacement.getAttribute("data-ds-part");
      replacement.remove();
      replacement.removeAttribute("data-user-message-bubble");
      const wrapper = document.createElement("section");
      wrapper.appendChild(replacement);
      container.appendChild(wrapper);
      await Promise.resolve();
      return {
        replaced,
        removed,
        restored,
        reinserted: replacement.getAttribute("data-ds-part"),
      };
    }, userMessage);
  expect(result).toEqual({
    replaced: "message",
    removed: { part: null, owner: null, marker: null },
    restored: "message",
    reinserted: null,
  });
});

test("assistant semantics are activated and removed before paint", async ({
  shell,
}) => {
  const settings = theme("light");
  settings.colors.assistantMessageText = "#096939";
  await prepare(shell, settings, generateConfiguredCss(settings.styleConfig));
  const result = await shell
    .locator("#messages")
    .evaluate(async (container) => {
      const node = document.createElement("div");
      node.innerHTML = "<p>Assistant response</p>";
      container.appendChild(node);
      await Promise.resolve();
      const ordinaryPart = node.getAttribute("data-ds-part");
      node.setAttribute("data-markdown-text-style", "assistant-message");
      await Promise.resolve();
      const active = {
        part: node.getAttribute("data-ds-part"),
        color: getComputedStyle(node.firstElementChild!).color,
      };
      node.removeAttribute("data-markdown-text-style");
      await Promise.resolve();
      return {
        ordinaryPart,
        active,
        removed: node.getAttribute("data-ds-part"),
      };
    });
  expect(result).toEqual({
    ordinaryPart: null,
    active: { part: "message", color: "rgb(9, 105, 57)" },
    removed: null,
  });
});

test("fast mapping preserves ownership, role precedence and full-page batching", async ({
  shell,
}) => {
  const settings = theme("light");
  await prepare(shell, settings, generateConfiguredCss(settings.styleConfig));
  const result = await shell
    .locator("#messages")
    .evaluate(async (container) => {
      container.innerHTML = `<div id="foreign" data-user-message-bubble="true" data-ds-part="other-part" data-codexstyle-owner="other-owner"></div>
      <main id="priority" class="main-surface" data-user-message-bubble="true"></main>
      <main id="batched" class="main-surface"></main>`;
      await Promise.resolve();
      const foreign = container.querySelector("#foreign")!;
      const priority = container.querySelector("#priority")!;
      const batched = container.querySelector("#batched")!;
      const beforeBatch = {
        foreignPart: foreign.getAttribute("data-ds-part"),
        foreignOwner: foreign.getAttribute("data-codexstyle-owner"),
        priority: priority.getAttribute("data-ds-part"),
        batched: batched.getAttribute("data-ds-part"),
      };
      await new Promise((resolve) => setTimeout(resolve, 120));
      return {
        beforeBatch,
        afterBatch: [priority, batched].map((node) =>
          node.getAttribute("data-ds-part"),
        ),
      };
    });
  expect(result).toEqual({
    beforeBatch: {
      foreignPart: "other-part",
      foreignOwner: "other-owner",
      priority: null,
      batched: null,
    },
    afterBatch: ["main", "main"],
  });
});

for (const rootState of ["unowned", "foreign"] as const) {
  test(`fast mapping skips a ${rootState} root`, async ({ shell }) => {
    const settings = theme("light");
    await prepare(shell, settings, generateConfiguredCss(settings.styleConfig));
    const result = await shell.locator("#messages").evaluate(
      async (container, input) => {
        const root = document.documentElement;
        if (input.rootState === "unowned") root.removeAttribute("data-ds-part");
        else root.setAttribute("data-codexstyle-owner", "other-owner");
        container.insertAdjacentHTML("beforeend", input.markup);
        await Promise.resolve();
        const node = container.querySelector("#sent")!;
        return [
          node.getAttribute("data-ds-part"),
          node.getAttribute("data-codexstyle-owner"),
        ];
      },
      { rootState, markup: userMessage },
    );
    expect(result).toEqual([null, null]);
  });
}
