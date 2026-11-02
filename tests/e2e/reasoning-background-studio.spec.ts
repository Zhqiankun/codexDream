import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Studio stores reasoning wallpapers, previews real asset URLs, and preserves them after reload", async ({}, testInfo) => {
  test.setTimeout(90_000);
  // 独立原生存储与用户目录，只有文件选择框被替换；不访问用户正在使用的主题库。
  const isolatedRoot = await mkdtemp(join(tmpdir(), "codexstyle-effort-ui-"));
  const packageVersion = (
    JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string",
    ),
  ) as Record<string, string>;
  const application = await electron.launch({
    executablePath: resolve("node_modules/electron/dist/electron.exe"),
    args: [
      resolve("out/main/index.js"),
      `--user-data-dir=${join(isolatedRoot, "electron-user-data")}`,
    ],
    cwd: process.cwd(),
    env: {
      ...environment,
      LOCALAPPDATA: isolatedRoot,
      NODE_ENV: "production",
      npm_package_version: packageVersion,
    },
  });
  try {
    const page = await application.firstWindow();
    await expect(
      page.getByRole("button", { name: "＋ 新建主题" }),
    ).toBeEnabled();
    const images: Record<string, { path: string; bytes: number[] }> = {};
    for (const [name, channels] of Object.entries({
      normal: [25, 80, 155, 255],
      max: [225, 40, 60, 255],
      maxReplacement: [180, 80, 220, 255],
      ultra: [20, 180, 100, 255],
    })) {
      const bytes = await application.evaluate(
        ({ nativeImage }, rgba) =>
          Array.from(
            nativeImage
              .createFromBitmap(Buffer.from(rgba), { width: 1, height: 1 })
              .toPNG(),
          ),
        channels,
      );
      const imagePath = join(isolatedRoot, `${name}.png`);
      await writeFile(imagePath, Buffer.from(bytes));
      images[name] = { path: imagePath, bytes };
    }
    const selectFile = (path: string) =>
      application.evaluate(({ dialog }, selectedPath) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [selectedPath],
        });
      }, path);
    const assertPreviewImage = async (name: string) => {
      const preview = page.locator(".mock-background");
      await expect(preview).toHaveCount(1);
      await expect
        .poll(() =>
          preview.evaluate(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth,
          ),
        )
        .toBe(1);
      await expect
        .poll(async () => {
          const src = await preview.getAttribute("src");
          expect(src).toMatch(/^app:\/\/theme-asset\//);
          return application.evaluate(
            async ({ net }, url) =>
              Array.from(
                new Uint8Array(await (await net.fetch(url!)).arrayBuffer()),
              ),
            src,
          );
        })
        .toEqual(images[name].bytes);
    };
    await page.getByRole("button", { name: "＋ 新建主题" }).click();
    await expect(page.getByLabel("名称", { exact: true })).toHaveValue(
      "新主题",
    );
    await expect(
      page.getByRole("button", { name: "＋ 新建主题" }),
    ).toBeEnabled();
    await page.getByLabel("名称", { exact: true }).fill("档位背景验收");
    await page.getByRole("tab", { name: "画面", exact: true }).click();
    await selectFile(images.normal.path);
    await page.getByRole("button", { name: "选择图片", exact: true }).click();
    await assertPreviewImage("normal");
    await expect(
      page.getByRole("heading", { name: "档位背景验收", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "根据档位更换背景" }).click();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^为 .+ 选择图片$/u }),
    ).toHaveCount(6);
    for (const label of ["轻度", "中", "高", "极高", "Max", "Ultra"]) {
      await expect(
        page.getByRole("button", { name: `为 ${label} 选择图片` }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: `${label} 预览`, exact: true }),
      ).toBeVisible();
    }
    for (const label of ["无", "极低", "持续"]) {
      await expect(
        page.getByRole("button", { name: `为 ${label} 选择图片` }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: `${label} 预览`, exact: true }),
      ).toHaveCount(0);
    }
    for (const [value, label] of [
      ["max", "Max"],
      ["ultra", "Ultra"],
    ]) {
      await selectFile(images[value].path);
      await page.getByRole("button", { name: `为 ${label} 选择图片` }).click();
      await assertPreviewImage(value);
    }
    await selectFile(images.maxReplacement.path);
    await page.getByRole("button", { name: "为 Max 选择图片" }).click();
    await assertPreviewImage("maxReplacement");
    await page.getByRole("button", { name: "中 预览", exact: true }).click();
    await assertPreviewImage("normal");
    await page.getByRole("button", { name: "Max 预览", exact: true }).click();
    await assertPreviewImage("maxReplacement");
    await page.getByRole("button", { name: "正常背景", exact: true }).click();
    await assertPreviewImage("normal");
    await page.getByRole("button", { name: "根据档位更换背景" }).click();
    await assertPreviewImage("maxReplacement");
    await page.getByRole("button", { name: "保存主题", exact: true }).click();
    await expect
      .poll(async () => {
        const snapshot = await page.evaluate(() =>
          window.codexStyle.getSnapshot(),
        );
        return snapshot.ok
          ? snapshot.data.themes.find((item) => item.name === "档位背景验收")
              ?.status
          : undefined;
      })
      .toBe("ready");
    await page.reload();
    await page
      .locator(".theme-row")
      .filter({ hasText: "档位背景验收" })
      .click();
    await page.getByRole("tab", { name: "画面", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "根据档位更换背景" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Max 预览", exact: true }).click();
    await assertPreviewImage("maxReplacement");
    await page.getByRole("button", { name: "Ultra 预览", exact: true }).click();
    await assertPreviewImage("ultra");
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 800),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("reasoning-background-studio.png"),
      fullPage: true,
    });
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 1050),
    );
    await page.locator(".reasoning-background-list").scrollIntoViewIfNeeded();
    await page.locator(".reasoning-background-list").screenshot({
      path: testInfo.outputPath("reasoning-background-cards.png"),
    });
    await page.getByRole("button", { name: "Max 预览", exact: true }).click();
    await page.getByRole("button", { name: "Max 使用正常背景" }).click();
    await assertPreviewImage("normal");
    await page.getByRole("button", { name: "Ultra 预览", exact: true }).click();
    await assertPreviewImage("ultra");
    await page.getByRole("button", { name: "保存主题", exact: true }).click();
    await expect
      .poll(async () => {
        const snapshot = await page.evaluate(() =>
          window.codexStyle.getSnapshot(),
        );
        return snapshot.ok
          ? snapshot.data.themes.find((item) => item.name === "档位背景验收")
              ?.status
          : undefined;
      })
      .toBe("ready");
    await page.reload();
    await page
      .locator(".theme-row")
      .filter({ hasText: "档位背景验收" })
      .click();
    await page.getByRole("tab", { name: "画面", exact: true }).click();
    await page.getByRole("button", { name: "Max 预览", exact: true }).click();
    await assertPreviewImage("normal");
    await expect(
      page.getByRole("button", { name: "Max 使用正常背景" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Ultra 预览", exact: true }).click();
    await assertPreviewImage("ultra");
  } finally {
    await application.close();
  }
});
