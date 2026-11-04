import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  generateConfiguredCss,
  readThemeConfiguration,
  type BackgroundScope,
} from "../../src/contracts";
import {
  buildThemePayload,
  parseThemeCompatibility,
  readThemeCompatibilityExpression,
  type ThemePayloadSettings,
} from "../../src/main/session/theme-payload";
import {
  isCompatibleSelectorProbe,
  selectorProbeExpression,
} from "../../src/main/session/selector-profile";

const marker = "codexstyle-reasoning-background-test";
const effortSelector = "[data-codex-intelligence-trigger]";
const test = base.extend<{ shell: Page }>({
  shell: async ({ browserName }, use) => {
    const prefix = `codexstyle-effort-${browserName}-`;
    const profile = await mkdtemp(join(tmpdir(), prefix));
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
        dirname(resolve(profile)) !== resolve(tmpdir()) ||
        !basename(profile).startsWith(prefix)
      )
        throw new Error("Unexpected test profile");
      await rm(profile, { recursive: true, force: true });
    }
  },
});

const html = `<!doctype html><html><head><style>
html,body{margin:0;min-height:100vh}main{min-height:100vh}
[data-codex-composer-root]{position:absolute;top:20px;left:20px}
</style></head><body><main class="main-surface" role="main">
<div data-codex-composer-root><button data-codex-intelligence-trigger="true" data-selected-reasoning-effort="max">GPT-6 Astra Max</button><textarea id="draft">未发送内容</textarea></div>
<article id="messages"></article></main></body></html>`;

// Store 26.1029.7803.0 merges the titlebar into the header and identifies
// its native effort button through the composer navigation target.
const currentHtml = `<!doctype html><html data-codex-window-type="electron"><head><style>
html,body{margin:0;min-height:100vh}main{min-height:100vh}
[data-codex-composer-root]{position:absolute;top:40px;left:20px}
</style></head><body><div data-app-shell-frame="true"><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside>
<main data-app-shell-main-surface="default" role="main">
<header data-app-shell-titlebar="true" data-pip-obstacle="app-shell-header" data-app-shell-header-edge-scroll="false">当前会话</header>
<div data-codex-composer-root>
<button id="native-effort" data-composer-navigation-target="reasoning" data-selected-reasoning-effort="max">GPT-6 Astra Max</button>
<button data-composer-navigation-target="model" data-selected-reasoning-effort="ultra">选择模型</button>
<textarea id="draft">未发送内容</textarea></div>
<button data-composer-navigation-target="reasoning" data-selected-reasoning-effort="ultra">输入区外控件</button>
<article id="messages"></article></main></div></div></body></html>`;

async function artwork(color: string) {
  return `data:image/png;base64,${(
    await sharp({
      create: { width: 2, height: 2, channels: 4, background: color },
    })
      .png()
      .toBuffer()
  ).toString("base64")}`;
}

function settings(
  scope: BackgroundScope,
  mode: "configured" | "advanced",
  images: string[],
): ThemePayloadSettings {
  const base = readThemeConfiguration({});
  return {
    ...base,
    backgroundMode: "reasoning",
    backgroundScope: scope,
    sidebarOverlayOpacity: 0,
    reasoningBackgroundDataUrls: { max: images[1], ultra: images[2] },
    art: { ...base.art, taskMode: "full", safeArea: "none" },
    styleConfig: { ...base.styleConfig, mode },
    colors: { ...base.colors, background: "transparent", text: "#f4ecd9" },
  };
}

async function inject(
  shell: Page,
  config: ThemePayloadSettings,
  normal: string,
) {
  const css =
    config.styleConfig.mode === "configured"
      ? generateConfiguredCss(config.styleConfig)
      : '[data-ds-part="root"] { color: #f4ecd9; }';
  expect(
    await shell.evaluate(buildThemePayload(marker, css, normal, config)),
  ).toBe(true);
}

async function selectedBackground(shell: Page, scope: BackgroundScope) {
  return shell
    .locator(scope === "window" ? "body" : "main")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
}

async function compatibility(shell: Page) {
  return parseThemeCompatibility(
    await shell.evaluate(readThemeCompatibilityExpression(marker)),
  );
}

async function choose(shell: Page, value: string) {
  await shell
    .locator(effortSelector)
    .evaluate(
      (el, effort) => el.setAttribute("data-selected-reasoning-effort", effort),
      value,
    );
}

for (const scope of ["window", "content"] as const) {
  for (const mode of ["configured", "advanced"] as const) {
    test(`native effort changes replace only artwork in ${scope}/${mode}`, async ({
      shell,
    }, testInfo) => {
      await shell.setContent(html);
      const images = await Promise.all([
        artwork("#123654"),
        artwork("#f2aa11"),
        artwork("#19b8a2"),
      ]);
      await inject(shell, settings(scope, mode, images), images[0]);
      await expect
        .poll(() => selectedBackground(shell, scope))
        .toContain(images[1]);
      const textColor = await shell
        .locator("html")
        .evaluate((el) => getComputedStyle(el).color);
      await choose(shell, "ultra");
      await expect
        .poll(() => selectedBackground(shell, scope))
        .toContain(images[2]);
      expect(
        await shell
          .locator("html")
          .evaluate((el) => getComputedStyle(el).color),
      ).toBe(textColor);
      await expect(shell.locator("#draft")).toHaveValue("未发送内容");
      // 无该档位图片、未知档位以及暂无输入区都回退到原普通背景。
      for (const value of ["low", "future-effort", "__proto__"]) {
        await choose(shell, value);
        await expect
          .poll(() => selectedBackground(shell, scope))
          .toContain(images[0]);
      }
      await shell
        .locator("[data-codex-composer-root]")
        .evaluate((el) => el.remove());
      await expect
        .poll(() => selectedBackground(shell, scope))
        .toContain(images[0]);
      await shell
        .locator("main")
        .evaluate((el) =>
          el.insertAdjacentHTML(
            "afterbegin",
            '<div data-codex-composer-root><button data-codex-intelligence-trigger data-selected-reasoning-effort="ultra">新会话</button></div>',
          ),
        );
      await expect
        .poll(() => selectedBackground(shell, scope))
        .toContain(images[2]);
      // 原生外层属性变化也能重新识别，不能继续显示已离开的输入区背景。
      await shell.locator("[data-codex-composer-root]").evaluate((el) => {
        el.id = "new-composer";
        el.removeAttribute("data-codex-composer-root");
      });
      await expect
        .poll(() => selectedBackground(shell, scope))
        .toContain(images[0]);
      await shell
        .locator("#new-composer")
        .evaluate((el) => el.setAttribute("data-codex-composer-root", ""));
      await expect
        .poll(() => selectedBackground(shell, scope))
        .toContain(images[2]);
      await shell.screenshot({
        path: testInfo.outputPath("reasoning-background.png"),
      });
    });
  }
}

for (const scope of ["window", "content"] as const) {
  test(`current Store shell switches all six backgrounds in ${scope} scope`, async ({
    shell,
  }) => {
    await shell.goto("app://-/index.html");
    await shell.setContent(currentHtml);
    expect(
      isCompatibleSelectorProbe(
        await shell.evaluate(selectorProbeExpression()),
      ),
    ).toBe(true);
    const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
    const images = await Promise.all(
      [
        "#123654",
        "#dc4545",
        "#f2aa11",
        "#77c341",
        "#19b8a2",
        "#4056bb",
        "#a444ba",
      ].map(artwork),
    );
    const config = {
      ...settings(scope, "configured", images),
      reasoningBackgroundDataUrls: Object.fromEntries(
        efforts.map((effort, index) => [effort, images[index + 1]]),
      ),
    };
    await inject(shell, config, images[0]);
    await expect(shell.locator("header")).toHaveAttribute(
      "data-ds-part",
      "header",
    );
    await expect
      .poll(() => selectedBackground(shell, scope))
      .toContain(images[5]);
    await expect
      .poll(() => compatibility(shell))
      .toEqual({
        status: "full",
        unavailable: [],
      });
    const textColor = await shell
      .locator("html")
      .evaluate((el) => getComputedStyle(el).color);
    const control = shell.locator("#native-effort");
    for (const [index, effort] of efforts.entries()) {
      await control.evaluate(
        (el, value) => el.setAttribute("data-selected-reasoning-effort", value),
        effort,
      );
      await expect
        .poll(() => selectedBackground(shell, scope))
        .toContain(images[index + 1]);
    }
    await expect(shell.locator("#draft")).toHaveValue("未发送内容");
    expect(
      await shell.locator("html").evaluate((el) => getComputedStyle(el).color),
    ).toBe(textColor);

    // Changing the native target must invalidate the cached control, and
    // restoring it must rediscover the same node without a page reload.
    await control.evaluate((el) =>
      el.setAttribute("data-composer-navigation-target", "model"),
    );
    await expect
      .poll(() => selectedBackground(shell, scope))
      .toContain(images[0]);
    await control.evaluate((el) =>
      el.setAttribute("data-composer-navigation-target", "reasoning"),
    );
    await expect
      .poll(() => selectedBackground(shell, scope))
      .toContain(images[6]);
    await control.evaluate((el) =>
      el.setAttribute("data-selected-reasoning-effort", "future-effort"),
    );
    await expect
      .poll(() => selectedBackground(shell, scope))
      .toContain(images[0]);
    await control.evaluate((el) => {
      el.outerHTML =
        '<button id="native-effort" data-composer-navigation-target="reasoning" data-selected-reasoning-effort="medium">新输入区档位</button>';
    });
    await expect
      .poll(() => selectedBackground(shell, scope))
      .toContain(images[2]);
  });
}

test("optional shell parts degrade and recover while the available background keeps working", async ({
  shell,
}) => {
  await shell.goto("app://-/index.html");
  await shell.setContent(currentHtml);
  const images = await Promise.all([
    artwork("#123654"),
    artwork("#f2aa11"),
    artwork("#19b8a2"),
  ]);
  const config = settings("content", "configured", images);
  await inject(shell, config, images[0]);
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "full",
      unavailable: [],
    });

  await shell.locator("aside").evaluate((el) => el.remove());
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "partial",
      unavailable: ["sidebar"],
    });
  await shell.locator("header").evaluate((el) => el.remove());
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "partial",
      unavailable: ["sidebar", "titlebar", "header"],
    });
  expect(
    isCompatibleSelectorProbe(await shell.evaluate(selectorProbeExpression())),
  ).toBe(true);
  expect(await selectedBackground(shell, "content")).toContain(images[1]);
  await shell
    .locator("#native-effort")
    .evaluate((el) =>
      el.setAttribute("data-selected-reasoning-effort", "ultra"),
    );
  await expect
    .poll(() => selectedBackground(shell, "content"))
    .toContain(images[2]);
  await inject(shell, { ...config, backgroundMode: "normal" }, images[0]);
  await expect
    .poll(() => selectedBackground(shell, "content"))
    .toContain(images[0]);
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "partial",
      unavailable: ["sidebar", "titlebar", "header"],
    });

  // A foreign sidebar is not evidence that our sidebar styling works.
  await shell.locator("[data-app-shell-workspace-row]").evaluate((el) => {
    el.insertAdjacentHTML(
      "afterbegin",
      '<aside id="foreign-sidebar" class="app-shell-left-panel" data-codexstyle-owner="foreign">外部区域</aside>',
    );
  });
  await shell.locator("main").evaluate((el) => {
    el.insertAdjacentHTML(
      "afterbegin",
      '<header data-app-shell-header-edge-scroll="false" data-app-shell-titlebar="true" data-pip-obstacle="app-shell-header">恢复的页头</header>',
    );
  });
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "partial",
      unavailable: ["sidebar"],
    });
  await expect(shell.locator("#foreign-sidebar")).not.toHaveAttribute(
    "data-ds-part",
  );
  await shell.locator("[data-app-shell-workspace-row]").evaluate((el) => {
    el.insertAdjacentHTML(
      "afterbegin",
      '<aside class="app-shell-left-panel">恢复的侧栏</aside>',
    );
  });
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "full",
      unavailable: [],
    });
  await shell
    .locator("header")
    .evaluate((el) => el.removeAttribute("data-app-shell-titlebar"));
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "partial",
      unavailable: ["titlebar"],
    });
  await shell
    .locator("header")
    .evaluate((el) => el.setAttribute("data-app-shell-titlebar", "true"));
  await inject(shell, config, images[0]);
  await expect
    .poll(() => compatibility(shell))
    .toEqual({
      status: "full",
      unavailable: [],
    });
  await expect
    .poll(() => selectedBackground(shell, "content"))
    .toContain(images[2]);
  await expect(shell.locator('style[data-codexstyle-style="1"]')).toHaveCount(
    1,
  );
  await expect(shell.locator("#draft")).toHaveValue("未发送内容");
});

test("effort recognition failures report partial while unconfigured known levels and disabled artwork remain healthy", async ({
  shell,
}) => {
  await shell.goto("app://-/index.html");
  await shell.setContent(currentHtml);
  const images = await Promise.all([
    artwork("#123654"),
    artwork("#f2aa11"),
    artwork("#19b8a2"),
  ]);
  const config = settings("window", "advanced", images);
  await inject(shell, config, images[0]);
  const control = shell.locator("#native-effort");
  await control.evaluate((el) =>
    el.setAttribute("data-selected-reasoning-effort", "low"),
  );
  await expect
    .poll(() => selectedBackground(shell, "window"))
    .toContain(images[0]);
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await control.evaluate((el) =>
    el.setAttribute("data-selected-reasoning-effort", "future-effort"),
  );
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "partial", unavailable: ["reasoning-background"] });
  expect(await selectedBackground(shell, "window")).toContain(images[0]);
  await control.evaluate((el) =>
    el.setAttribute("data-selected-reasoning-effort", "ultra"),
  );
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await expect
    .poll(() => selectedBackground(shell, "window"))
    .toContain(images[2]);

  const composer = shell.locator("[data-codex-composer-root]");
  for (const attribute of [
    "hidden",
    "aria-hidden",
    "data-app-shell-active-page",
  ]) {
    await composer.evaluate(
      (el, name) =>
        el.setAttribute(
          name,
          name === "data-app-shell-active-page" ? "false" : "true",
        ),
      attribute,
    );
    await expect
      .poll(() => compatibility(shell))
      .toEqual({ status: "partial", unavailable: ["reasoning-background"] });
    await expect
      .poll(() => selectedBackground(shell, "window"))
      .toContain(images[0]);
    await composer.evaluate((el, name) => el.removeAttribute(name), attribute);
    await expect
      .poll(() => compatibility(shell))
      .toEqual({ status: "full", unavailable: [] });
    await expect
      .poll(() => selectedBackground(shell, "window"))
      .toContain(images[2]);
  }
  await control.evaluate((el) => el.remove());
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "partial", unavailable: ["reasoning-background"] });
  await expect
    .poll(() => selectedBackground(shell, "window"))
    .toContain(images[0]);
  await inject(shell, { ...config, backgroundMode: "normal" }, images[0]);
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await inject(
    shell,
    { ...config, art: { ...config.art, taskMode: "off" } },
    images[0],
  );
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await expect.poll(() => selectedBackground(shell, "window")).toBe("none");
  await inject(shell, config, images[0]);
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "partial", unavailable: ["reasoning-background"] });
  await composer.evaluate((el) =>
    el.insertAdjacentHTML(
      "afterbegin",
      '<button data-composer-navigation-target="reasoning" data-selected-reasoning-effort="max">恢复的档位</button>',
    ),
  );
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await expect
    .poll(() => selectedBackground(shell, "window"))
    .toContain(images[1]);
});

test("compatibility waits for a unique active main and refuses foreign or duplicate reports", async ({
  shell,
}) => {
  await shell.goto("app://-/index.html");
  await shell.setContent(currentHtml);
  const images = await Promise.all([
    artwork("#123654"),
    artwork("#f2aa11"),
    artwork("#19b8a2"),
  ]);
  await inject(shell, settings("window", "configured", images), images[0]);
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await shell
    .locator("main")
    .evaluate((el) => el.removeAttribute("data-app-shell-main-surface"));
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "checking", unavailable: [] });
  await shell
    .locator("main")
    .evaluate((el) =>
      el.setAttribute("data-app-shell-main-surface", "default"),
    );
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await shell
    .locator("[data-app-shell-workspace-row]")
    .evaluate((el) =>
      el.insertAdjacentHTML(
        "beforeend",
        '<section id="cached-page" data-app-shell-active-page="false"><main data-app-shell-main-surface="default"></main></section>',
      ),
    );
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await shell
    .locator("#cached-page")
    .evaluate((el) => el.setAttribute("data-app-shell-active-page", "true"));
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "checking", unavailable: [] });
  await shell.locator("#cached-page").evaluate((el) => el.remove());
  await expect
    .poll(() => compatibility(shell))
    .toEqual({ status: "full", unavailable: [] });
  await shell.evaluate(() => {
    const fake = document.createElement("style");
    fake.id = "foreign-report";
    fake.setAttribute("data-codexstyle-style", "1");
    fake.setAttribute("data-codexstyle-owner", "foreign");
    fake.setAttribute("data-codexstyle-compatibility", '["sidebar"]');
    document.head.append(fake);
  });
  expect(await compatibility(shell)).toEqual({
    status: "full",
    unavailable: [],
  });
  await shell.evaluate((owner) => {
    const fake = document.querySelector("#foreign-report")!;
    fake.setAttribute("data-codexstyle-owner", owner);
  }, marker);
  expect(await compatibility(shell)).toEqual({
    status: "checking",
    unavailable: [],
  });
  await shell.locator("#foreign-report").evaluate((el) => el.remove());
  expect(await compatibility(shell)).toEqual({
    status: "full",
    unavailable: [],
  });
  await shell
    .locator("html")
    .evaluate((el) => el.setAttribute("data-codexstyle-owner", "foreign"));
  expect(await compatibility(shell)).toEqual({
    status: "checking",
    unavailable: [],
  });
});

test("reasoning mode preserves one observer and switches rapidly without remapping the full document", async ({
  shell,
}) => {
  await shell.setContent(html);
  await shell.evaluate(() => {
    const state = { observers: 0, fullQueries: 0 };
    (window as Window & { effortCounters?: typeof state }).effortCounters =
      state;
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      private watching = false;
      override observe(target: Node, options?: MutationObserverInit) {
        // Playwright 自身也可能观察页面；这里只统计实际主题运行态的观察器。
        const productObserver =
          options?.attributeFilter?.includes("data-markdown-text-style") ??
          false;
        if (!this.watching && productObserver) state.observers++;
        this.watching ||= productObserver;
        super.observe(target, options);
      }
      override disconnect() {
        if (this.watching) state.observers--;
        this.watching = false;
        super.disconnect();
      }
    };
    const query = document.querySelectorAll.bind(document);
    document.querySelectorAll = ((selector: string) => {
      state.fullQueries++;
      return query(selector);
    }) as typeof document.querySelectorAll;
  });
  const images = await Promise.all([
    artwork("#123654"),
    artwork("#f2aa11"),
    artwork("#19b8a2"),
  ]);
  const config = settings("window", "configured", images);
  await inject(shell, config, images[0]);
  const count = () =>
    shell.evaluate(
      () =>
        (
          window as Window & {
            effortCounters?: { observers: number; fullQueries: number };
          }
        ).effortCounters!,
    );
  await expect.poll(async () => (await count()).observers).toBe(1);
  await shell.waitForTimeout(120);
  const before = await count();
  await shell.locator(effortSelector).evaluate((el) => {
    for (const value of ["ultra", "max", "low", "ultra"])
      el.setAttribute("data-selected-reasoning-effort", value);
  });
  await expect
    .poll(() => selectedBackground(shell, "window"))
    .toContain(images[2]);
  await shell.waitForTimeout(120);
  expect((await count()).fullQueries).toBe(before.fullQueries);
  const replacement = await artwork("#4056bb");
  await inject(
    shell,
    { ...config, reasoningBackgroundDataUrls: { ultra: replacement } },
    images[0],
  );
  await expect
    .poll(() => selectedBackground(shell, "window"))
    .toContain(replacement);
  expect((await count()).observers).toBe(1);
  await expect(
    shell.locator("style[data-codexstyle-reasoning-background]"),
  ).toHaveCount(1);
  await inject(shell, { ...config, backgroundMode: "normal" }, images[0]);
  await expect(
    shell.locator("style[data-codexstyle-reasoning-background]"),
  ).toHaveCount(0);
  await choose(shell, "max");
  await expect
    .poll(() => selectedBackground(shell, "window"))
    .toContain(images[0]);
  expect((await count()).observers).toBe(1);
});

test("ambiguous controls fall back, hidden and foreign controls do not select the background, and artwork off stays off", async ({
  shell,
}) => {
  await shell.setContent(html);
  const images = await Promise.all([
    artwork("#123654"),
    artwork("#f2aa11"),
    artwork("#19b8a2"),
  ]);
  const config = settings("content", "advanced", images);
  await inject(shell, config, images[0]);
  await shell
    .locator("main")
    .evaluate((el) =>
      el.insertAdjacentHTML(
        "beforeend",
        '<div id="extra-composer" data-codex-composer-root><button data-codex-intelligence-trigger data-selected-reasoning-effort="ultra">其他输入区</button></div>',
      ),
    );
  await expect
    .poll(() => selectedBackground(shell, "content"))
    .toContain(images[0]);
  await shell
    .locator("#extra-composer")
    .evaluate((el) => el.setAttribute("hidden", ""));
  await expect
    .poll(() => selectedBackground(shell, "content"))
    .toContain(images[1]);
  await shell.locator("#extra-composer").evaluate((el) => {
    el.removeAttribute("hidden");
    el.setAttribute("data-codexstyle-owner", "foreign");
  });
  await expect
    .poll(() => selectedBackground(shell, "content"))
    .toContain(images[1]);
  await inject(
    shell,
    { ...config, art: { ...config.art, taskMode: "off" } },
    images[0],
  );
  await expect.poll(() => selectedBackground(shell, "content")).toBe("none");
  await expect(
    shell.locator("style[data-codexstyle-reasoning-background]"),
  ).toHaveCount(0);
  await expect(shell.locator("#extra-composer")).toHaveAttribute(
    "data-codexstyle-owner",
    "foreign",
  );
});
