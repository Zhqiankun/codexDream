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

  it("round-trips structured design and generated CSS in a compatibility ZIP", async () => {
    const managed = await createManagedRoot();
    managedCleanups.push(managed.cleanup);
    const store = new LocalThemeStore(managed.root);
    await store.init();
    const original = store.listRecords()[0];
    const configuration = readThemeConfiguration(original.json);
    const theme = await store.patch(original.libraryId, original.revision, {
      appearance: "dark",
      art: { ...configuration.art, focusX: 0.31, safeArea: "left" },
      colors: { ...configuration.colors, accent: "#336699" },
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
      colors: { accent: "#336699" },
      styleConfig: {
        mode: "configured",
        blur: 27,
        recipes: { dialog: false },
      },
    });
    expect(parsed.record.css).toBe(theme.css);
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
