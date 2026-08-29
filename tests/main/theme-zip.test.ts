import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import sharp from "sharp";
import yazl from "yazl";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import {
  readThemeZip,
  writeFormalZip,
  writeSimplifiedZip,
} from "../../src/main/infra/theme-zip";
import { createManagedRoot } from "../fixtures/managed-root";
import {
  DEFAULT_ADVANCED_STYLE,
  DEFAULT_CONFIGURED_STYLE,
  DEFAULT_THEME_ART,
  DEFAULT_THEME_COLORS,
  readThemeConfiguration,
} from "../../src/contracts";

const roots: string[] = [];
const managedCleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  await Promise.all(managedCleanups.splice(0).map((operation) => operation()));
});

describe("theme zip compatibility", () => {
  it("exports and re-reads a strict three-file package", async () => {
    const managed = await createManagedRoot();
    managedCleanups.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const theme = store.listRecords()[0];
    theme.backgroundScope = "content";
    theme.sidebarOverlayOpacity = 38;
    const image = store.getBackground(theme.libraryId)!;
    const zipPath = join(managed.localAppData, "theme.zip");
    await writeSimplifiedZip(zipPath, theme, image);
    const parsed = await readThemeZip(zipPath);
    expect(parsed.record.packageFormat).toBe("simplified");
    expect(parsed.record.name).toBe(theme.name);
    expect(parsed.record.css).toBe(theme.css);
    expect(parsed.record.backgroundScope).toBe("content");
    expect(parsed.record.sidebarOverlayOpacity).toBe(38);
  });

  it("round-trips structured design and generated CSS in the current ZIP", async () => {
    const managed = await createManagedRoot();
    managedCleanups.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const original = store.listRecords()[0];
    const configuration = readThemeConfiguration(original.json);
    const cardImage = await sharp({
      create: { width: 32, height: 18, channels: 3, background: "#336699" },
    })
      .webp()
      .toBuffer();
    const cardImageDataUrl =
      "data:image/webp;base64," + cardImage.toString("base64");
    const theme = await store.patch(original.libraryId, original.revision, {
      appearance: "dark",
      art: { ...configuration.art, focusX: 0.31, safeArea: "left" },
      colors: {
        ...configuration.colors,
        accent: "#336699",
        threadTabBackground: "rgba(21, 22, 23, 0.6)",
        threadTabText: "#cab123",
        homeTitleText: "#aabbcc",
        homeCardBackground: "rgba(31, 32, 33, 0.7)",
        homeCardText: "#ddeeff",
        assistantMessageText: "rgba(101, 102, 103, 0.8)",
        userMessageText: "rgba(12, 34, 56, 0.72)",
        changeCardBackground: "rgba(61, 62, 63, 0.64)",
        changeCardText: "#fedcba",
        activityBackground: "rgba(41, 42, 43, 0.5)",
        activityText: "#bedace",
        activityMuted: "#789abc",
        topBarBackground: "rgba(90, 80, 70, 0.35)",
        topBarText: "#abcdef",
      },
      homeCards: [
        { mode: "color", color: "#102030" },
        {
          mode: "image",
          color: "#203040",
          imageDataUrl: cardImageDataUrl,
        },
        { mode: "color", color: "rgba(48, 64, 80, 0.7)" },
        { mode: "color", color: "#405060" },
      ],
      styleConfig: {
        ...DEFAULT_CONFIGURED_STYLE,
        recipes: { ...DEFAULT_CONFIGURED_STYLE.recipes, dialog: false },
        blur: 27,
      },
    });
    const image = store.getBackground(theme.libraryId)!;
    const zipPath = join(managed.localAppData, "configured-theme.zip");

    await writeSimplifiedZip(zipPath, theme, image);
    const parsed = await readThemeZip(zipPath);

    expect(readThemeConfiguration(parsed.record.json)).toMatchObject({
      appearance: "dark",
      art: { focusX: 0.31, safeArea: "left" },
      colors: {
        accent: "#336699",
        threadTabBackground: "rgba(21, 22, 23, 0.6)",
        threadTabText: "#cab123",
        homeTitleText: "#aabbcc",
        homeCardBackground: "rgba(31, 32, 33, 0.7)",
        homeCardText: "#ddeeff",
        assistantMessageText: "rgba(101, 102, 103, 0.8)",
        userMessageText: "rgba(12, 34, 56, 0.72)",
        changeCardBackground: "rgba(61, 62, 63, 0.64)",
        changeCardText: "#fedcba",
        activityBackground: "rgba(41, 42, 43, 0.5)",
        activityText: "#bedace",
        activityMuted: "#789abc",
        topBarBackground: "rgba(90, 80, 70, 0.35)",
        topBarText: "#abcdef",
      },
      homeCards: [
        { mode: "color", color: "#102030" },
        {
          mode: "image",
          color: "#203040",
          imageDataUrl: cardImageDataUrl,
        },
        { mode: "color", color: "rgba(48, 64, 80, 0.7)" },
        { mode: "color", color: "#405060" },
      ],
      styleConfig: {
        mode: "configured",
        blur: 27,
        recipes: { dialog: false },
      },
    });
    expect(parsed.record.css).toBe(theme.css);
  });

  it("accepts a twelve-color theme from the previous v1 extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-zip-"));
    roots.push(root);
    const image = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#334455" },
    })
      .png()
      .toBuffer();
    const {
      threadTabBackground: _threadTabBackground,
      threadTabText: _threadTabText,
      homeTitleText: _homeTitleText,
      homeCardBackground: _homeCardBackground,
      homeCardText: _homeCardText,
      assistantMessageText: _assistantMessageText,
      userMessageText: _userMessageText,
      changeCardBackground: _changeCardBackground,
      changeCardText: _changeCardText,
      activityBackground: _activityBackground,
      activityText: _activityText,
      activityMuted: _activityMuted,
      topBarBackground: _topBarBackground,
      topBarText: _topBarText,
      ...previousColors
    } = DEFAULT_THEME_COLORS;
    const zipPath = join(root, "previous-v1.zip");
    await writeZip(zipPath, [
      [
        "theme.json",
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            id: "previous-v1",
            name: "Previous v1",
            image: "background.png",
            appearance: "dark",
            art: DEFAULT_THEME_ART,
            colors: previousColors,
            style: DEFAULT_ADVANCED_STYLE,
          }),
        ),
      ],
      ["theme.css", Buffer.from('[data-ds-part="root"] { color: #ffffff; }')],
      ["background.png", image],
    ]);

    const parsed = await readThemeZip(zipPath);
    const colors = readThemeConfiguration(parsed.record.json).colors;
    expect(colors.assistantMessageText).toBe(previousColors.text);
    expect(colors.userMessageText).toBe(previousColors.text);
    expect(colors.changeCardBackground).toBe(previousColors.panelAlt);
    expect(colors.changeCardText).toBe(previousColors.text);
    expect(colors.threadTabBackground).toBe("rgba(0, 0, 0, 0)");
    expect(colors.threadTabText).toBe(previousColors.muted);
    expect(colors.homeTitleText).toBe(previousColors.text);
    expect(colors.homeCardBackground).toBe(previousColors.panelAlt);
    expect(colors.homeCardText).toBe(previousColors.text);
    expect(colors.activityBackground).toBe("rgba(0, 0, 0, 0)");
    expect(colors.activityText).toBe(previousColors.muted);
    expect(colors.activityMuted).toBe(previousColors.muted);
    expect(colors.topBarBackground).toBe("rgba(0, 0, 0, 0)");
    expect(colors.topBarText).toBe(previousColors.muted);
  });

  it("rejects an image whose bytes do not match its extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-zip-"));
    roots.push(root);
    const fake = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#fff" },
    })
      .png()
      .toBuffer();
    const zipPath = join(root, "bad.zip");
    const zip = new yazl.ZipFile();
    zip.addBuffer(
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          id: "bad",
          name: "Bad",
          image: "background.jpg",
        }),
      ),
      "theme.json",
    );
    zip.addBuffer(
      Buffer.from('[data-ds-part="root"] { color: #fff; }'),
      "theme.css",
    );
    zip.addBuffer(fake, "background.jpg");
    await new Promise<void>((resolve, reject) => {
      zip.outputStream
        .pipe(createWriteStream(zipPath))
        .on("close", resolve)
        .on("error", reject);
      zip.end();
    });
    await expect(readThemeZip(zipPath)).rejects.toThrow("UNSAFE_IMAGE");
  });

  it("rejects a configured package whose CSS does not match its settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-zip-"));
    roots.push(root);
    const image = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#fff" },
    })
      .png()
      .toBuffer();
    const zipPath = join(root, "mismatched-config.zip");
    await writeZip(zipPath, [
      [
        "theme.json",
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            id: "mismatched-config",
            name: "Mismatched config",
            image: "background.png",
            appearance: "dark",
            art: DEFAULT_THEME_ART,
            colors: DEFAULT_THEME_COLORS,
            style: DEFAULT_CONFIGURED_STYLE,
          }),
        ),
      ],
      ["theme.css", Buffer.from('[data-ds-part="root"] { color: #ffffff; }')],
      ["background.png", image],
    ]);

    await expect(readThemeZip(zipPath)).rejects.toThrow(
      "configured-css-mismatch",
    );
  });

  it("re-exports an untouched formal package without invalidating its hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-formal-"));
    roots.push(root);
    const image = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#123456" },
    })
      .png()
      .toBuffer();
    const theme = Buffer.from(
      '{"schemaVersion":1,"id":"formal.theme","name":"Formal","image":"background.png"}',
      "utf8",
    );
    const css = Buffer.from('[data-ds-part="root"] { color: #f8fafc; }');
    const manifest = Buffer.from(
      JSON.stringify({
        packageVersion: 1,
        themeId: "formal.theme",
        version: "1.0.0",
        skinApiVersion: 1,
        minClientVersion: "0.1.0",
        platforms: ["windows"],
        capabilities: ["background", "safe-css"],
        publisher: { id: "codexstyle", displayName: "CodexStyle" },
        license: "MIT",
        provenance: { aiGenerated: false, summary: "fixture" },
        files: [
          fileRecord("theme.json", "application/json", theme),
          fileRecord("theme.css", "text/css", css),
          fileRecord("background.png", "image/png", image),
        ],
        createdAt: "2026-08-01T00:00:00Z",
      }),
      "utf8",
    );
    const input = join(root, "formal.zip");
    await writeZip(input, [
      ["manifest.json", manifest],
      ["theme.json", theme],
      ["theme.css", css],
      ["background.png", image],
    ]);
    const parsed = await readThemeZip(input);
    expect(parsed.record.backgroundScope).toBe("window");
    expect(parsed.record.sidebarOverlayOpacity).toBe(75);
    const output = join(root, "formal-copy.zip");
    await writeFormalZip(output, parsed.record, parsed.image);
    const exported = await readThemeZip(output);
    expect(exported.record.packageFormat).toBe("formal");
    expect(exported.record.css).toBe(css.toString("utf8"));
  });

  it("rejects unknown files from a formal package", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-formal-"));
    roots.push(root);
    const image = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#123456" },
    })
      .png()
      .toBuffer();
    const theme = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        id: "formal.theme",
        name: "Formal",
        image: "background.png",
      }),
    );
    const css = Buffer.from('[data-ds-part="root"] { color: #f8fafc; }');
    const manifest = Buffer.from(
      JSON.stringify({
        packageVersion: 1,
        themeId: "formal.theme",
        version: "1.0.0",
        skinApiVersion: 1,
        minClientVersion: "0.1.0",
        platforms: ["windows"],
        capabilities: ["safe-css"],
        publisher: { id: "codexstyle", displayName: "CodexStyle" },
        license: "MIT",
        provenance: { aiGenerated: false, summary: "fixture" },
        files: [
          fileRecord("theme.json", "application/json", theme),
          fileRecord("theme.css", "text/css", css),
          fileRecord("background.png", "image/png", image),
        ],
        createdAt: "2026-08-01T00:00:00Z",
      }),
    );
    const input = join(root, "unknown.zip");
    await writeZip(input, [
      ["manifest.json", manifest],
      ["theme.json", theme],
      ["theme.css", css],
      ["background.png", image],
      ["README.txt", Buffer.from("not allowed")],
    ]);
    await expect(readThemeZip(input)).rejects.toThrow("UNSAFE_ARCHIVE");
  });
});

function fileRecord(path: string, mediaType: string, data: Buffer) {
  return {
    path,
    mediaType,
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

async function writeZip(
  path: string,
  entries: Array<[string, Buffer]>,
): Promise<void> {
  const zip = new yazl.ZipFile();
  for (const [name, data] of entries) zip.addBuffer(data, name);
  await new Promise<void>((resolve, reject) => {
    zip.outputStream
      .pipe(createWriteStream(path))
      .on("close", resolve)
      .on("error", reject);
    zip.end();
  });
}
