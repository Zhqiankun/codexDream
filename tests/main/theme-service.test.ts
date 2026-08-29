import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONFIGURED_STYLE,
  MAX_THEME_HOME_CARD_IMAGE_DATA_URL_LENGTH,
  type ThemeDetail,
} from "../../src/contracts";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import { createManagedRoot } from "../fixtures/managed-root";

const { showOpenDialog, showSaveDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  dialog: { showOpenDialog, showSaveDialog },
}));

import { ThemeService } from "../../src/main/app/theme-service";

describe("ThemeService", () => {
  const temporaryDirectories: string[] = [];
  const managedCleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    showOpenDialog.mockReset();
    showSaveDialog.mockReset();
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
    await Promise.all(managedCleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("decodes a PNG and stores a bounded 64px transparent icon", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexstyle-icon-"));
    temporaryDirectories.push(directory);
    const iconPath = join(directory, "icon.png");
    await sharp({
      create: {
        width: 128,
        height: 72,
        channels: 4,
        background: { r: 245, g: 185, b: 76, alpha: 0.65 },
      },
    })
      .png()
      .toFile(iconPath);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [iconPath],
    });

    const store = {
      get: vi.fn().mockReturnValue({
        json: { style: DEFAULT_CONFIGURED_STYLE },
      }),
      patch: vi.fn().mockResolvedValue({ libraryId: "theme-library-id" }),
      getDetail: vi.fn().mockReturnValue({} as ThemeDetail),
    };
    const service = new ThemeService(
      store as never,
      () => ({}) as never,
      () => ({}) as never,
    );

    await expect(
      service.chooseSendIcon("theme-library-id", 7),
    ).resolves.toEqual({ ok: true, data: {} });
    const patch = store.patch.mock.calls[0]?.[2] as {
      styleConfig: { sendIcon: string; sendIconDataUrl: string };
    };
    expect(store.patch).toHaveBeenCalledWith(
      "theme-library-id",
      7,
      expect.any(Object),
    );
    expect(patch.styleConfig.sendIcon).toBe("custom");
    expect(patch.styleConfig.sendIconDataUrl).toMatch(
      /^data:image\/png;base64,iVBORw0KGgo/,
    );

    const normalized = Buffer.from(
      patch.styleConfig.sendIconDataUrl.split(",")[1]!,
      "base64",
    );
    const metadata = await sharp(normalized).metadata();
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(64);
    expect(metadata.hasAlpha).toBe(true);
  });

  it("optimizes and stores one independently selected home card image", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codexstyle-home-card-"));
    temporaryDirectories.push(directory);
    const imagePath = join(directory, "card.png");
    await sharp({
      create: {
        width: 1_600,
        height: 1_000,
        channels: 4,
        background: { r: 24, g: 92, b: 160, alpha: 1 },
      },
    })
      .png()
      .toFile(imagePath);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [imagePath],
    });
    const store = {
      get: vi.fn().mockReturnValue({ json: {} }),
      patch: vi.fn().mockResolvedValue({ libraryId: "theme-library-id" }),
      getDetail: vi.fn().mockReturnValue({} as ThemeDetail),
    };
    const service = new ThemeService(
      store as never,
      () => ({}) as never,
      () => ({}) as never,
    );

    await expect(
      service.chooseHomeCardImage("theme-library-id", 11, 2),
    ).resolves.toEqual({ ok: true, data: {} });

    const patch = store.patch.mock.calls[0]?.[2] as {
      homeCards: ThemeDetail["homeCards"];
    };
    expect(patch.homeCards[2]).toMatchObject({
      mode: "image",
      color: "#2d2d2d",
    });
    expect(patch.homeCards[2].imageDataUrl).toMatch(
      /^data:image\/webp;base64,UklGR/u,
    );
    expect(patch.homeCards[2].imageDataUrl!.length).toBeLessThanOrEqual(
      MAX_THEME_HOME_CARD_IMAGE_DATA_URL_LENGTH,
    );
    expect(
      patch.homeCards.filter((card) => card.mode === "image"),
    ).toHaveLength(1);
    const optimized = Buffer.from(
      patch.homeCards[2].imageDataUrl!.split(",")[1]!,
      "base64",
    );
    const metadata = await sharp(optimized).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(480);
    expect(metadata.height).toBe(270);
  });
});
