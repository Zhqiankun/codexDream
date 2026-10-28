import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { buildThemePayload } from "../../src/main/session/theme-payload";
import { SELECTOR_PARTS } from "../../src/main/session/selector-profile";

const marker = "codexstyle-incremental-test";
const test = base.extend<{ shell: Page }>({
  shell: async ({ browserName }, use) => {
    const prefix = `codexstyle-incremental-${browserName}-`;
    const profile = await mkdtemp(join(tmpdir(), prefix));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) =>
          typeof value === "string" && key !== "ELECTRON_RUN_AS_NODE",
      ),
    );
    const app = await electron.launch({
      executablePath: resolve("node_modules/electron/dist/electron.exe"),
      args: [resolve("tests/fixtures/theme-payload-shell.cjs")],
      env: {
        ...env,
        CODEXSTYLE_TEST_USER_DATA: profile,
        CODEXSTYLE_TEST_OFFSCREEN: "1",
      },
    });
    try {
      await use(await app.firstWindow());
    } finally {
      await app.close();
      if (
        dirname(resolve(profile)) !== resolve(tmpdir()) ||
        !basename(profile).startsWith(prefix)
      )
        throw new Error("Unexpected test profile");
      await rm(profile, { recursive: true, force: true });
    }
  },
});

async function prepare(page: Page, content: string) {
  await page.setContent(
    `<div class="_ApplicationMenuTopBar_fixture"></div><aside class="app-shell-left-panel"><button>Project</button></aside><main class="main-surface" role="main"><header class="app-header-tint"><span id="status">Ready</span></header>${content}</main>`,
  );
  expect(
    await page.evaluate(
      buildThemePayload(
        marker,
        '[data-ds-part="message"] { color: #abcdef; }',
        "",
      ),
    ),
  ).toBe(true);
  await page.waitForTimeout(120);
}

// The full profile is the independent oracle after each native DOM transition.
// It checks precedence and stale parts, rather than reproducing the incremental
// invalidation algorithm in the test.
async function expectProfile(page: Page) {
  await page.waitForTimeout(120);
  const mismatches = await page.evaluate(
    ({ parts, marker }) => {
      const expected = new Map<Element, string>([
        [document.documentElement, "root"],
        [document.body, "canvas"],
      ]);
      for (const [part, selector] of parts) {
        for (const node of document.querySelectorAll(selector))
          if (!expected.has(node)) expected.set(node, part);
      }
      const nodes = new Set([
        ...expected.keys(),
        ...document.querySelectorAll(
          `[data-ds-part][data-codexstyle-owner="${marker}"]`,
        ),
      ]);
      return [...nodes].flatMap((node) => {
        if (node.getAttribute("data-codexstyle-owner") === "foreign") return [];
        const actual = node.getAttribute("data-ds-part");
        return actual === (expected.get(node) ?? null)
          ? []
          : [
              {
                id: node.id,
                tag: node.tagName,
                actual,
                expected: expected.get(node) ?? null,
              },
            ];
      });
    },
    { parts: SELECTOR_PARTS, marker },
  );
  expect(mismatches).toEqual([]);
}

test("text updates and local message edits do not rescan unrelated long transcripts", async ({
  shell,
}) => {
  const row = (index: number) =>
    `<section><div data-user-message-bubble="true">Question ${index}</div><div data-markdown-text-style="assistant-message"><p>Answer ${index}</p></div></section>`;
  await prepare(
    shell,
    `<div id="transcript" class="thread-scroll-container">${Array.from({ length: 1000 }, (_, index) => row(index)).join("")}</div>`,
  );
  const result = await shell.evaluate(
    async ({ selectors, row }) => {
      const known = new Set<string>(selectors);
      const counters = {
        documentScans: 0,
        largeSubtreeScans: 0,
        unchangedPartWrites: 0,
        batches: 0,
      };
      const documentQuery = document.querySelectorAll;
      document.querySelectorAll = function <T extends Element>(
        selector: string,
      ): NodeListOf<T> {
        if (known.has(selector)) counters.documentScans++;
        return documentQuery.call(this, selector) as NodeListOf<T>;
      };
      const elementQuery = Element.prototype.querySelectorAll;
      Element.prototype.querySelectorAll = function <T extends Element>(
        selector: string,
      ): NodeListOf<T> {
        if (
          known.has(selector) &&
          [
            document.documentElement,
            document.body,
            document.querySelector("main"),
            document.querySelector("#transcript"),
          ].includes(this as HTMLElement)
        )
          counters.largeSubtreeScans++;
        return elementQuery.call(this, selector) as NodeListOf<T>;
      };
      const setAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (
          name === "data-codexstyle-part" &&
          this.getAttribute(name) === value
        )
          counters.unchangedPartWrites++;
        return setAttribute.call(this, name, value);
      };
      const timeout = window.setTimeout;
      window.setTimeout = ((
        callback: TimerHandler,
        delay?: number,
        ...args: unknown[]
      ) => {
        if (delay === 80) counters.batches++;
        return timeout(callback, delay, ...args);
      }) as typeof window.setTimeout;
      document.querySelector("#status")!.textContent = "Still ready";
      await new Promise((resolve) => setTimeout(resolve, 120));
      const textOnly = { ...counters };
      document
        .querySelector("#transcript")!
        .insertAdjacentHTML("beforeend", row);
      await Promise.resolve();
      const firstPaint = document
        .querySelector("#transcript")!
        .lastElementChild!.lastElementChild!.getAttribute("data-ds-part");
      document.querySelector("#transcript p")!.classList.add("ordinary-copy");
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { textOnly, localUpdate: { ...counters }, firstPaint };
    },
    {
      selectors: SELECTOR_PARTS.map(([, selector]) => selector),
      row: row(1001),
    },
  );
  expect(result.textOnly).toEqual({
    documentScans: 0,
    largeSubtreeScans: 0,
    unchangedPartWrites: 0,
    batches: 0,
  });
  expect(result.localUpdate).toEqual({
    documentScans: 0,
    largeSubtreeScans: 0,
    unchangedPartWrites: 0,
    batches: 1,
  });
  expect(result.firstPaint).toBe("message");
  await expectProfile(shell);
});

test("reconciles ancestor relations, part precedence, roles and moved cards", async ({
  shell,
}) => {
  await prepare(
    shell,
    `<h1 id="home-title">Home</h1><div id="home-anchor"></div>
    <section class="group/home-suggestions" id="cards"><button id="card-a" class="bg-surface">A</button><button id="card-b" class="bg-surface">B</button></section>
    <div class="sticky bg-surface" id="search-rail"><div><input id="plugins-page-search"></div></div>
    <div id="document" data-editor-search-surface><div class="cm-editor"><div class="cm-scroller"><div class="cm-content" data-language="markdown"></div></div></div></div>
    <div id="diff"><div class="group/turn-diff-header" id="diff-header"></div></div>
    <div id="dialog" role="dialog"><p>Dialog</p></div>
    <div id="foreign" role="dialog" data-ds-part="foreign-part" data-codexstyle-owner="foreign"></div>`,
  );
  await shell
    .locator("header")
    .evaluate((header) =>
      header.insertAdjacentHTML(
        "beforeend",
        '<div id="tabs" data-app-shell-tab-controller><div class="group/tab" id="surface-a"><button id="tab-a" role="tab" aria-selected="true">A</button></div><div class="group/tab" id="surface-b"><button id="tab-b" role="tab" aria-selected="false">B</button></div></div>',
      ),
    );
  await expectProfile(shell);
  // main wins over home, but changing its losing home match must still update
  // home-title descendants. This catches a part-only ancestor cache.
  await shell
    .locator("#home-anchor")
    .evaluate(
      (node) => (node.innerHTML = '<span data-testid="home-icon"></span>'),
    );
  await expectProfile(shell);
  await expect(shell.locator("#home-title")).toHaveAttribute(
    "data-ds-part",
    "home-title",
  );
  await shell.evaluate(() => {
    document.querySelector("#home-anchor")!.replaceChildren();
    document.querySelector("#tab-a")!.setAttribute("aria-selected", "false");
    document.querySelector("#tab-b")!.setAttribute("aria-selected", "true");
    document.querySelector("#plugins-page-search")!.id = "unrelated-search";
    document
      .querySelector(".cm-content")!
      .setAttribute("data-language", "typescript");
    document.querySelector("#diff-header")!.className = "ordinary-header";
    document.querySelector("#dialog")!.removeAttribute("role");
    document
      .querySelector("#cards")!
      .prepend(document.querySelector("#card-b")!);
  });
  await expectProfile(shell);
  await expect(shell.locator("#card-b")).toHaveAttribute(
    "data-codexstyle-home-card-index",
    "0",
  );
  await expect(shell.locator("#card-a")).toHaveAttribute(
    "data-codexstyle-home-card-index",
    "1",
  );
  await shell.evaluate(() => {
    document.querySelector("#unrelated-search")!.id = "scheduled-page-search";
    document
      .querySelector(".cm-content")!
      .setAttribute("data-language", "markdown");
    document.querySelector("#diff-header")!.className =
      "group/turn-diff-header";
    document.querySelector("#dialog")!.setAttribute("role", "dialog");
    document.querySelector("header")!.className = "ordinary-header";
  });
  await expectProfile(shell);
  await expect(shell.locator("#foreign")).toHaveAttribute(
    "data-ds-part",
    "foreign-part",
  );
});

test("cleans removed nodes and recovers replaced styles and shell bodies", async ({
  shell,
}) => {
  await prepare(
    shell,
    '<div id="transcript" class="thread-scroll-container"><div id="removed-message" data-user-message-bubble="true">Message</div></div>',
  );
  const removed = await shell.locator("#removed-message").elementHandle();
  // A connected node can still leave the document's selector scope, e.g. when
  // a native component moves it into a shadow tree. It must lose our part too.
  await removed!.evaluate((node) => {
    const host = document.createElement("div");
    document.body.append(host);
    host.attachShadow({ mode: "open" }).append(node);
  });
  await expectProfile(shell);
  expect(await removed!.getAttribute("data-ds-part")).toBeNull();
  await removed!.evaluate((node) =>
    document.querySelector("#transcript")!.append(node),
  );
  await expectProfile(shell);
  expect(await removed!.getAttribute("data-ds-part")).toBe("message");
  await removed!.evaluate((node) => node.remove());
  await expectProfile(shell);
  expect(await removed!.getAttribute("data-ds-part")).toBeNull();
  await shell
    .locator('style[data-codexstyle-style="1"]')
    .evaluate((node) => node.remove());
  await expect(shell.locator('style[data-codexstyle-style="1"]')).toHaveCount(
    1,
  );
  await shell.evaluate(() => {
    const body = document.createElement("body");
    body.innerHTML =
      '<aside class="app-shell-left-panel"></aside><main class="main-surface"><div role="dialog">New dialog</div></main>';
    document.body.replaceWith(body);
  });
  await expectProfile(shell);
  await expect(shell.locator("body")).toHaveAttribute("data-ds-part", "canvas");
  await shell.evaluate(() => {
    document.documentElement.setAttribute("data-codexstyle-owner", "foreign");
    document.querySelector('[role="dialog"]')!.removeAttribute("role");
    document
      .querySelector("main")!
      .insertAdjacentHTML(
        "beforeend",
        '<div id="external-message" data-user-message-bubble="true">External</div>',
      );
  });
  await shell.waitForTimeout(120);
  await expect(shell.locator("#external-message")).not.toHaveAttribute(
    "data-ds-part",
  );
  await expect(shell.locator("html")).toHaveAttribute(
    "data-codexstyle-owner",
    "foreign",
  );
});
