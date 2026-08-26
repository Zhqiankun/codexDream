import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, promises as fs, type Stats } from "node:fs";
import { basename, dirname, extname } from "node:path";
import yauzl from "yauzl";
import yazl from "yazl";
import {
  DEFAULT_BACKGROUND_SCOPE,
  DEFAULT_SIDEBAR_OVERLAY_OPACITY,
  generateConfiguredCss,
  isCompleteThemeArt,
  isCompatibleThemeColors,
  isCompleteThemeStyleConfig,
  isThemeAppearance,
  readThemeConfiguration,
  writeThemeConfiguration,
  type BackgroundScope,
  type ImportResult,
} from "../../contracts";
import { themeFingerprint, type ThemeRecord } from "../domain/theme";
import { validateImage } from "./image";
import { validateSafeCss } from "./safe-css";

export interface ParsedThemePackage {
  record: ThemeRecord;
  image: Buffer;
  manifest?: Record<string, unknown>;
  signaturePresent: boolean;
}

interface Entry {
  name: string;
  data: Buffer;
  compressedSize: number;
  uncompressedSize: number;
  directory: boolean;
}

interface FormalPackage {
  manifest: Record<string, unknown>;
  theme: Record<string, unknown>;
  css: string;
  imageName: string;
  image: Buffer;
  signaturePresent: boolean;
}

interface SimplifiedPackage {
  theme: Record<string, unknown>;
  css: string;
  imageName: string;
  image: Buffer;
}

const MAX_ZIP_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 32;
const MAX_UNPACKED = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_THEME_BYTES = 64 * 1024;
const MAX_SIMPLE_THEME_BYTES = 1024 * 1024;
const MAX_CSS_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_LICENSE_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 4 * 1024;
const CLIENT_VERSION = "0.1.0";
const decoder = new TextDecoder("utf-8", { fatal: true });

const BACKGROUND_MEDIA = new Map<string, string>([
  ["background.webp", "image/webp"],
  ["background.jpg", "image/jpeg"],
  ["background.png", "image/png"],
]);
const PAYLOAD_MEDIA = new Map<string, string>([
  ["theme.json", "application/json"],
  ...BACKGROUND_MEDIA,
  ["theme.css", "text/css"],
  ["LICENSE.txt", "text/plain"],
]);
const FORMAL_FILES = new Set([
  "manifest.json",
  "manifest.sig",
  ...PAYLOAD_MEDIA.keys(),
]);
const MANIFEST_REQUIRED = [
  "packageVersion",
  "themeId",
  "version",
  "skinApiVersion",
  "minClientVersion",
  "platforms",
  "capabilities",
  "publisher",
  "license",
  "provenance",
  "files",
  "createdAt",
];
const THEME_REQUIRED = ["schemaVersion", "id", "name", "image"];
const THEME_COPY_KEYS = [
  "brandSubtitle",
  "tagline",
  "projectPrefix",
  "projectLabel",
  "statusText",
  "quote",
  "promoTitle",
  "promoSub",
];
const COLOR_KEYS = [
  "background",
  "panel",
  "panelAlt",
  "accent",
  "accentAlt",
  "secondary",
  "highlight",
  "text",
  "muted",
  "line",
];
const OPTIONAL_COLOR_KEYS = ["sidebarText", "assistantPanel"];
const THEME_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const RFC3339_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const PROVENANCE_CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const COLOR_PATTERN =
  /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|#[0-9a-fA-F]{3,4}|rgb\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*\)|rgba\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*(?:0|1|1\.0|0?\.[0-9]{1,6})\s*\))$/u;

export async function readThemeZip(
  filePath: string,
): Promise<ParsedThemePackage> {
  const archive = await readInputArchive(filePath);
  const entries = normalizeEntries(await readEntries(archive));
  const formal = entries.has("manifest.json");
  const parsed = formal
    ? await readFormalPackage(entries)
    : await readSimplifiedPackage(entries);
  const formalPackage = formal ? (parsed as FormalPackage) : undefined;
  const imageInfo = await validateImage(parsed.image, parsed.imageName);
  const libraryId = randomUUID();
  const sourceId = typeof parsed.theme.id === "string" ? parsed.theme.id : "";
  const themeId = canonicalThemeId(
    sourceId,
    parsed.theme,
    parsed.css,
    parsed.image,
  );
  const name = normalizedText(parsed.theme.name, "Imported theme", 80);
  const description = normalizedText(
    typeof parsed.theme.description === "string"
      ? parsed.theme.description
      : parsed.theme.copy,
    "",
    2000,
  );
  const backgroundFile = `${libraryId}.${imageInfo.extension}`;
  validatePortableThemeConfiguration(parsed.theme);
  const configuration = readThemeConfiguration(parsed.theme);
  if (
    configuration.styleConfig.mode === "configured" &&
    parsed.css !== generateConfiguredCss(configuration.styleConfig)
  )
    throw new Error("UNSAFE_ARCHIVE:configured-css-mismatch");
  const backgroundScope = readBackgroundScope(parsed.theme.backgroundScope);
  const sidebarOverlayOpacity = readSidebarOverlayOpacity(
    parsed.theme.sidebarOverlayOpacity,
  );
  const record: ThemeRecord = {
    libraryId,
    themeId,
    name,
    description,
    css: parsed.css,
    backgroundScope,
    sidebarOverlayOpacity,
    backgroundFile,
    backgroundMime: imageInfo.mime,
    backgroundSha256: imageInfo.sha256,
    backgroundBytes: imageInfo.bytes,
    json: writeThemeConfiguration(
      {
        ...parsed.theme,
        schemaVersion: 1,
        id: themeId,
        name,
        image: backgroundFile,
        backgroundScope,
        sidebarOverlayOpacity,
      },
      configuration,
    ),
    status: "ready",
    revision: 1,
    updatedAt: new Date().toISOString(),
    fingerprint: "",
    packageFormat: formal ? "formal" : "simplified",
    signed: false,
    importedFormal: formal
      ? {
          manifest: formalPackage!.manifest,
          signaturePresent: formalPackage!.signaturePresent,
          edited: false,
          originalThemeJson: { ...parsed.theme },
          originalThemeJsonBase64: entries
            .get("theme.json")!
            .data.toString("base64"),
          originalCssBase64: entries.get("theme.css")!.data.toString("base64"),
          originalManifestBase64: entries
            .get("manifest.json")!
            .data.toString("base64"),
          originalImageName: formalPackage!.imageName,
          licenseBase64: entries.get("LICENSE.txt")?.data.toString("base64"),
          signatureBase64: entries.get("manifest.sig")?.data.toString("base64"),
        }
      : undefined,
    validation: {
      css: "valid",
      image: "valid",
      package: "ready",
      warnings: formalPackage?.signaturePresent ? ["signature-unverified"] : [],
    },
  };
  record.fingerprint = themeFingerprint(record);
  return {
    record,
    image: Buffer.from(parsed.image),
    manifest: formalPackage?.manifest,
    signaturePresent: formalPackage?.signaturePresent ?? false,
  };
}

export async function writeSimplifiedZip(
  filePath: string,
  record: ThemeRecord,
  image: Buffer,
): Promise<void> {
  const extension = await validateExportImage(record, image);
  const imageName = `background.${extension}`;
  const css = validateSafeCss(record.css);
  if (!css.valid || css.empty) throw new Error("UNSAFE_CSS:export-css");
  const configuration = readThemeConfiguration(record.json);
  const themeJson = Buffer.from(
    JSON.stringify(
      writeThemeConfiguration(
        {
          ...record.json,
          schemaVersion: 1,
          id: record.themeId,
          name: record.name,
          image: imageName,
          backgroundScope: record.backgroundScope,
          sidebarOverlayOpacity: record.sidebarOverlayOpacity,
        },
        configuration,
      ),
      null,
      2,
    ),
    "utf8",
  );
  await writeZipAtomically(filePath, (zip) => {
    zip.addBuffer(themeJson, "theme.json");
    zip.addBuffer(Buffer.from(record.css, "utf8"), "theme.css");
    zip.addBuffer(image, imageName);
  });
}

export async function writeFormalZip(
  filePath: string,
  record: ThemeRecord,
  image: Buffer,
): Promise<void> {
  const source = await formalExportSource(record, image);
  await writeZipAtomically(filePath, (zip) => {
    zip.addBuffer(source.manifest, "manifest.json");
    if (source.signature) zip.addBuffer(source.signature, "manifest.sig");
    zip.addBuffer(source.theme, "theme.json");
    zip.addBuffer(source.css, "theme.css");
    zip.addBuffer(source.image, source.imageName);
    if (source.license) zip.addBuffer(source.license, "LICENSE.txt");
  });
}

async function readSimplifiedPackage(
  entries: Map<string, Entry>,
): Promise<SimplifiedPackage> {
  if (
    entries.size !== 3 ||
    !entries.has("theme.json") ||
    !entries.has("theme.css")
  )
    throw new Error("UNSAFE_ARCHIVE:simplified-layout");
  const themeEntry = requireEntry(
    entries,
    "theme.json",
    MAX_SIMPLE_THEME_BYTES,
  );
  const cssEntry = requireEntry(entries, "theme.css", MAX_CSS_BYTES);
  const theme = decodeObject(themeEntry.data, "theme-json");
  if (theme.schemaVersion !== 1 || typeof theme.image !== "string")
    throw new Error("UNSAFE_ARCHIVE:simplified-theme-fields");
  const imageName = theme.image;
  if (!isSimpleImageName(imageName) || !entries.has(imageName))
    throw new Error("UNSAFE_ARCHIVE:image-reference");
  const image = requireEntry(entries, imageName, MAX_IMAGE_BYTES).data;
  const css = decodeUtf8(cssEntry.data, "css");
  assertSafeCss(css);
  return { theme, css, imageName, image };
}

async function readFormalPackage(
  entries: Map<string, Entry>,
): Promise<FormalPackage> {
  for (const name of entries.keys()) {
    if (!FORMAL_FILES.has(name)) throw new Error("UNSAFE_ARCHIVE:formal-file");
  }
  const manifestEntry = requireEntry(
    entries,
    "manifest.json",
    MAX_MANIFEST_BYTES,
  );
  const themeEntry = requireEntry(entries, "theme.json", MAX_THEME_BYTES);
  const cssEntry = requireEntry(entries, "theme.css", MAX_CSS_BYTES);
  if (entries.has("manifest.sig"))
    requireEntry(entries, "manifest.sig", MAX_SIGNATURE_BYTES);
  if (entries.has("LICENSE.txt"))
    requireEntry(entries, "LICENSE.txt", MAX_LICENSE_BYTES);
  const manifest = decodeObject(manifestEntry.data, "manifest-json");
  const theme = decodeObject(themeEntry.data, "theme-json");
  const formal = validateFormalManifest(manifest, entries);
  validateFormalTheme(theme);
  if (manifest.themeId !== theme.id)
    throw new Error("UNSAFE_ARCHIVE:theme-id-mismatch");
  if (theme.image !== formal.imageName)
    throw new Error("UNSAFE_ARCHIVE:image-reference");
  const image = requireEntry(entries, formal.imageName, MAX_IMAGE_BYTES).data;
  await validateImage(image, formal.imageName);
  const css = decodeUtf8(cssEntry.data, "css");
  assertSafeCss(css);
  return {
    manifest,
    theme,
    css,
    imageName: formal.imageName,
    image,
    signaturePresent: entries.has("manifest.sig"),
  };
}

function validateFormalManifest(
  manifest: Record<string, unknown>,
  entries: Map<string, Entry>,
): { imageName: string } {
  assertExactKeys(manifest, MANIFEST_REQUIRED, ["keyId"], "manifest");
  if (manifest.packageVersion !== 1 || manifest.skinApiVersion !== 1)
    throw new Error("UNSAFE_ARCHIVE:manifest-version");
  assertString(manifest.themeId, "manifest-theme-id", {
    min: 3,
    max: 64,
    pattern: THEME_ID_PATTERN,
    controls: undefined,
  });
  parseSemver(manifest.version, "manifest-version");
  const minimum = parseSemver(
    manifest.minClientVersion,
    "manifest-client-version",
  );
  if (compareSemver(minimum, parseSemver(CLIENT_VERSION, "client-version")) > 0)
    throw new Error("UNSAFE_ARCHIVE:manifest-client-version");
  assertStringSet(manifest.platforms, "manifest-platforms", 1, 2, [
    "macos",
    "windows",
  ]);
  if (!(manifest.platforms as string[]).includes("windows"))
    throw new Error("UNSAFE_ARCHIVE:manifest-platform");
  assertStringSet(manifest.capabilities, "manifest-capabilities", 1, 3, [
    "background",
    "tokens",
    "safe-css",
  ]);
  if (!(manifest.capabilities as string[]).includes("safe-css"))
    throw new Error("UNSAFE_ARCHIVE:manifest-capability");
  validatePublisher(manifest.publisher);
  assertString(manifest.license, "manifest-license", {
    min: 1,
    max: 64,
    pattern: /^[A-Za-z0-9][A-Za-z0-9 .+()-]*$/u,
  });
  validateProvenance(manifest.provenance);
  if (manifest.keyId !== undefined)
    assertString(manifest.keyId, "manifest-key-id", {
      min: 1,
      max: 64,
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
      controls: undefined,
    });
  assertString(manifest.createdAt, "manifest-created-at", {
    min: 1,
    max: 40,
    pattern: RFC3339_PATTERN,
    controls: undefined,
  });
  if (!Number.isFinite(Date.parse(manifest.createdAt as string)))
    throw new Error("UNSAFE_ARCHIVE:manifest-created-at");

  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length < 2 ||
    manifest.files.length > 8
  )
    throw new Error("UNSAFE_ARCHIVE:manifest-files");
  const declared = new Set<string>();
  for (const item of manifest.files) {
    if (!isRecord(item)) throw new Error("UNSAFE_ARCHIVE:manifest-file-entry");
    assertExactKeys(
      item,
      ["path", "mediaType", "bytes", "sha256"],
      [],
      "manifest-file",
    );
    if (typeof item.path !== "string" || !PAYLOAD_MEDIA.has(item.path))
      throw new Error("UNSAFE_ARCHIVE:manifest-file-path");
    if (item.mediaType !== PAYLOAD_MEDIA.get(item.path))
      throw new Error("UNSAFE_ARCHIVE:manifest-file-media");
    const maxBytes = expectedPayloadLimit(item.path);
    const bytes = item.bytes;
    const hash = item.sha256;
    if (
      typeof bytes !== "number" ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > maxBytes ||
      typeof hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(hash) ||
      declared.has(item.path)
    )
      throw new Error("UNSAFE_ARCHIVE:manifest-file-entry");
    const entry = entries.get(item.path);
    if (
      !entry ||
      entry.data.byteLength !== bytes ||
      sha256(entry.data) !== hash
    )
      throw new Error("UNSAFE_ARCHIVE:manifest-hash");
    declared.add(item.path);
  }
  const payload = [...entries.keys()].filter(
    (name) => name !== "manifest.json" && name !== "manifest.sig",
  );
  if (
    payload.length !== declared.size ||
    payload.some((name) => !declared.has(name)) ||
    !declared.has("theme.json") ||
    !declared.has("theme.css")
  )
    throw new Error("UNSAFE_ARCHIVE:manifest-coverage");
  const imageNames = [...declared].filter((name) => BACKGROUND_MEDIA.has(name));
  if (imageNames.length !== 1)
    throw new Error("UNSAFE_ARCHIVE:formal-background");
  return { imageName: imageNames[0] };
}

function validateFormalTheme(theme: Record<string, unknown>): void {
  assertExactKeys(
    theme,
    THEME_REQUIRED,
    [
      ...THEME_COPY_KEYS,
      "promoUrl",
      "appearance",
      "art",
      "colors",
      "style",
      "backgroundScope",
      "sidebarOverlayOpacity",
    ],
    "theme",
  );
  if (theme.schemaVersion !== 1)
    throw new Error("UNSAFE_ARCHIVE:theme-schema-version");
  assertString(theme.id, "theme-id", {
    min: 3,
    max: 64,
    pattern: THEME_ID_PATTERN,
    controls: undefined,
  });
  assertString(theme.name, "theme-name", { min: 1, max: 80 });
  assertString(theme.image, "theme-image", {
    min: 1,
    max: 32,
    controls: undefined,
  });
  if (typeof theme.image !== "string" || !BACKGROUND_MEDIA.has(theme.image))
    throw new Error("UNSAFE_ARCHIVE:theme-image");
  for (const key of THEME_COPY_KEYS) {
    if (theme[key] !== undefined)
      assertString(theme[key], `theme-${key}`, { max: 120 });
  }
  if (theme.promoUrl !== undefined)
    assertString(theme.promoUrl, "theme-promo-url", { max: 512 });
  if (
    theme.appearance !== undefined &&
    !["auto", "light", "dark"].includes(theme.appearance as string)
  )
    throw new Error("UNSAFE_ARCHIVE:theme-appearance");
  if (theme.art !== undefined) validateArt(theme.art);
  if (theme.colors !== undefined) validateColors(theme.colors);
  if (theme.style !== undefined && !isCompleteThemeStyleConfig(theme.style))
    throw new Error("UNSAFE_ARCHIVE:theme-style");
  readBackgroundScope(theme.backgroundScope);
  readSidebarOverlayOpacity(theme.sidebarOverlayOpacity);
}

function validatePortableThemeConfiguration(
  theme: Record<string, unknown>,
): void {
  if (
    (theme.appearance !== undefined && !isThemeAppearance(theme.appearance)) ||
    (theme.art !== undefined && !isCompleteThemeArt(theme.art)) ||
    (theme.colors !== undefined && !isCompatibleThemeColors(theme.colors)) ||
    (theme.style !== undefined && !isCompleteThemeStyleConfig(theme.style))
  )
    throw new Error("UNSAFE_ARCHIVE:theme-configuration");
}

function readBackgroundScope(value: unknown): BackgroundScope {
  if (value === undefined) return DEFAULT_BACKGROUND_SCOPE;
  if (value !== "content" && value !== "window")
    throw new Error("UNSAFE_ARCHIVE:theme-presentation");
  return value;
}

function readSidebarOverlayOpacity(value: unknown): number {
  if (value === undefined) return DEFAULT_SIDEBAR_OVERLAY_OPACITY;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 100
  )
    throw new Error("UNSAFE_ARCHIVE:theme-presentation");
  return value;
}

function validatePublisher(value: unknown): void {
  if (!isRecord(value)) throw new Error("UNSAFE_ARCHIVE:manifest-publisher");
  assertExactKeys(value, ["id", "displayName"], [], "manifest-publisher");
  assertString(value.id, "manifest-publisher-id", {
    min: 1,
    max: 64,
    pattern: /^[A-Za-z0-9_-]+$/u,
    controls: undefined,
  });
  assertString(value.displayName, "manifest-publisher-name", {
    min: 1,
    max: 80,
  });
}

function validateProvenance(value: unknown): void {
  if (!isRecord(value)) throw new Error("UNSAFE_ARCHIVE:manifest-provenance");
  assertExactKeys(value, ["aiGenerated", "summary"], [], "manifest-provenance");
  if (typeof value.aiGenerated !== "boolean")
    throw new Error("UNSAFE_ARCHIVE:manifest-provenance");
  assertString(value.summary, "manifest-provenance-summary", {
    min: 1,
    max: 500,
    controls: PROVENANCE_CONTROL_PATTERN,
  });
}

function validateArt(value: unknown): void {
  if (!isRecord(value)) throw new Error("UNSAFE_ARCHIVE:theme-art");
  assertExactKeys(
    value,
    [],
    ["focusX", "focusY", "safeArea", "taskMode"],
    "theme-art",
  );
  for (const key of ["focusX", "focusY"]) {
    const item = value[key];
    if (
      item !== undefined &&
      (typeof item !== "number" ||
        !Number.isFinite(item) ||
        item < 0 ||
        item > 1)
    )
      throw new Error("UNSAFE_ARCHIVE:theme-art");
  }
  if (
    value.safeArea !== undefined &&
    !["left", "right", "none"].includes(value.safeArea as string)
  )
    throw new Error("UNSAFE_ARCHIVE:theme-art");
  if (
    value.taskMode !== undefined &&
    !["ambient", "full", "off"].includes(value.taskMode as string)
  )
    throw new Error("UNSAFE_ARCHIVE:theme-art");
}

function validateColors(value: unknown): void {
  if (!isRecord(value)) throw new Error("UNSAFE_ARCHIVE:theme-colors");
  assertExactKeys(value, COLOR_KEYS, OPTIONAL_COLOR_KEYS, "theme-colors");
  for (const key of COLOR_KEYS) {
    assertString(value[key], `theme-color-${key}`, {
      min: 1,
      max: 64,
      pattern: COLOR_PATTERN,
      controls: undefined,
    });
  }
  if (value.sidebarText !== undefined) {
    assertString(value.sidebarText, "theme-color-sidebarText", {
      min: 1,
      max: 64,
      pattern: COLOR_PATTERN,
      controls: undefined,
    });
  }
  if (value.assistantPanel !== undefined) {
    assertString(value.assistantPanel, "theme-color-assistantPanel", {
      min: 1,
      max: 64,
      pattern: COLOR_PATTERN,
      controls: undefined,
    });
  }
}

function normalizeEntries(entries: Entry[]): Map<string, Entry> {
  if (entries.length === 0 || entries.length > MAX_ENTRIES)
    throw new Error("UNSAFE_ARCHIVE:entry-count");
  const paths = entries.map((entry) => ({
    entry,
    parts: archivePathParts(entry.name, entry.directory),
  }));
  const files = paths.filter(({ entry }) => !entry.directory);
  if (!files.length) throw new Error("UNSAFE_ARCHIVE:empty");
  const rootLayout = files.every(({ parts }) => parts.length === 1);
  const folder = rootLayout ? undefined : files[0].parts[0];
  if (
    !rootLayout &&
    (!folder ||
      !files.every(({ parts }) => parts.length === 2 && parts[0] === folder))
  )
    throw new Error("UNSAFE_ARCHIVE:layout");
  for (const { entry, parts } of paths) {
    if (entry.directory) {
      if (!folder || parts.length !== 1 || parts[0] !== folder)
        throw new Error("UNSAFE_ARCHIVE:layout");
      continue;
    }
    if (
      (rootLayout && parts.length !== 1) ||
      (!rootLayout && parts.length !== 2)
    )
      throw new Error("UNSAFE_ARCHIVE:layout");
  }
  const normalized = new Map<string, Entry>();
  for (const { entry, parts } of files) {
    const name = parts.at(-1)!;
    if (normalized.has(name)) throw new Error("UNSAFE_ARCHIVE:duplicate-path");
    normalized.set(name, entry);
  }
  return normalized;
}

function archivePathParts(name: string, directory: boolean): string[] {
  const raw = directory ? name.slice(0, -1) : name;
  if (
    !raw ||
    CONTROL_PATTERN.test(name) ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/u.test(name) ||
    (!directory && name.endsWith("/"))
  )
    throw new Error("UNSAFE_ARCHIVE:path");
  const parts = raw.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.endsWith(".") ||
        part.endsWith(" ") ||
        /[:*?"<>|]/u.test(part) ||
        /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu.test(part),
    )
  )
    throw new Error("UNSAFE_ARCHIVE:path");
  return parts;
}

function readEntries(archive: Buffer): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (code: string, zip?: yauzl.ZipFile) => {
      if (settled) return;
      settled = true;
      zip?.close();
      reject(new Error(code));
    };
    yauzl.fromBuffer(
      archive,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true },
      (openError, zip) => {
        if (openError || !zip) return fail("UNSAFE_ARCHIVE:zip-open");
        const entries: Entry[] = [];
        let total = 0;
        zip.on("error", () => fail("UNSAFE_ARCHIVE:zip-error", zip));
        zip.on("end", () => {
          if (!settled) {
            settled = true;
            resolve(entries);
          }
        });
        zip.on("entry", (entry) => {
          if (settled) return;
          const directory = entry.fileName.endsWith("/");
          if (entries.length >= MAX_ENTRIES)
            return fail("UNSAFE_ARCHIVE:entry-count", zip);
          try {
            archivePathParts(entry.fileName, directory);
          } catch {
            return fail("UNSAFE_ARCHIVE:path", zip);
          }
          const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
          const dosAttributes = entry.externalFileAttributes & 0xffff;
          if (
            (entry.generalPurposeBitFlag & 0x1) !== 0 ||
            unixType === 0xa000 ||
            (dosAttributes & 0x0400) !== 0
          )
            return fail("UNSAFE_ARCHIVE:encrypted-or-link", zip);
          if (directory) {
            entries.push({
              name: entry.fileName,
              data: Buffer.alloc(0),
              compressedSize: entry.compressedSize,
              uncompressedSize: entry.uncompressedSize,
              directory: true,
            });
            zip.readEntry();
            return;
          }
          if (
            entry.uncompressedSize < 1 ||
            entry.uncompressedSize > MAX_UNPACKED ||
            entry.compressedSize > MAX_ZIP_BYTES ||
            (entry.compressedSize === 0 && entry.uncompressedSize > 0) ||
            entry.uncompressedSize / Math.max(entry.compressedSize, 1) > 1000 ||
            /\.(?:zip|7z|rar|tar|gz)$/iu.test(entry.fileName)
          )
            return fail("UNSAFE_ARCHIVE:entry-size", zip);
          total += entry.uncompressedSize;
          if (total > MAX_UNPACKED)
            return fail("UNSAFE_ARCHIVE:unpacked-size", zip);
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return fail("UNSAFE_ARCHIVE:read", zip);
            const chunks: Buffer[] = [];
            let actual = 0;
            stream.on("data", (chunk: Buffer) => {
              if (settled) return;
              actual += chunk.byteLength;
              if (actual > entry.uncompressedSize || actual > MAX_UNPACKED) {
                stream.destroy();
                fail("UNSAFE_ARCHIVE:stream-size", zip);
                return;
              }
              chunks.push(chunk);
            });
            stream.on("error", () => fail("UNSAFE_ARCHIVE:read", zip));
            stream.on("end", () => {
              if (settled) return;
              if (actual !== entry.uncompressedSize)
                return fail("UNSAFE_ARCHIVE:stream-size", zip);
              entries.push({
                name: entry.fileName,
                data: Buffer.concat(chunks, actual),
                compressedSize: entry.compressedSize,
                uncompressedSize: entry.uncompressedSize,
                directory: false,
              });
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}

async function formalExportSource(
  record: ThemeRecord,
  image: Buffer,
): Promise<{
  manifest: Buffer;
  signature?: Buffer;
  theme: Buffer;
  css: Buffer;
  image: Buffer;
  imageName: string;
  license?: Buffer;
}> {
  const provenance = record.importedFormal;
  if (!provenance || provenance.edited || record.packageFormat !== "formal")
    throw new Error("INCOMPLETE_THEME:formal-export-unavailable");
  const manifest = decodeBase64(provenance.originalManifestBase64, "manifest");
  const theme = decodeBase64(provenance.originalThemeJsonBase64, "theme");
  const css = decodeBase64(provenance.originalCssBase64, "css");
  const imageName = provenance.originalImageName;
  const signature = provenance.signatureBase64
    ? decodeBase64(provenance.signatureBase64, "signature")
    : undefined;
  const license = provenance.licenseBase64
    ? decodeBase64(provenance.licenseBase64, "license")
    : undefined;
  const entries = new Map<string, Entry>([
    ["manifest.json", syntheticEntry("manifest.json", manifest)],
    ["theme.json", syntheticEntry("theme.json", theme)],
    ["theme.css", syntheticEntry("theme.css", css)],
    [imageName, syntheticEntry(imageName, image)],
  ]);
  if (signature)
    entries.set("manifest.sig", syntheticEntry("manifest.sig", signature));
  if (license)
    entries.set("LICENSE.txt", syntheticEntry("LICENSE.txt", license));
  const verified = await readFormalPackage(entries);
  if (
    record.css !== verified.css ||
    record.name !== verified.theme.name ||
    record.themeId !== verified.theme.id ||
    record.backgroundSha256 !== sha256(image) ||
    record.fingerprint !== themeFingerprint(record)
  )
    throw new Error("INCOMPLETE_THEME:formal-export-modified");
  return { manifest, signature, theme, css, image, imageName, license };
}

async function writeZipAtomically(
  filePath: string,
  populate: (zip: yazl.ZipFile) => void,
): Promise<void> {
  await assertOutputPath(filePath);
  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}.zip`;
  try {
    const zip = new yazl.ZipFile();
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(tempPath, { flags: "wx", mode: 0o600 });
      const fail = (error: Error) => reject(error);
      output.once("error", fail);
      zip.outputStream.once("error", fail).pipe(output).once("close", resolve);
      try {
        populate(zip);
        zip.end();
      } catch (error) {
        fail(
          error instanceof Error ? error : new Error("UNSAFE_ARCHIVE:export"),
        );
      }
    });
    // Verify the exact generated archive before it can replace user data.
    await readThemeZip(tempPath);
    await replaceOutput(tempPath, filePath);
  } catch (error) {
    await removeIfRegularFile(tempPath);
    throw error;
  }
}

async function replaceOutput(tempPath: string, target: string): Promise<void> {
  const existing = await lstatIfExists(target);
  if (existing && (!existing.isFile() || existing.isSymbolicLink()))
    throw new Error("UNSAFE_ARCHIVE:export-target");
  // The temporary archive lives in the same directory, so Node's replacement
  // rename keeps the old target in place until the new file is committed.
  await fs.rename(tempPath, target);
}

async function readInputArchive(filePath: string): Promise<Buffer> {
  if (extname(filePath).toLowerCase() !== ".zip")
    throw new Error("UNSAFE_ARCHIVE:extension");
  let before: Stats;
  try {
    before = await fs.lstat(filePath);
  } catch {
    throw new Error("UNSAFE_ARCHIVE:archive-read");
  }
  if (!isSafeArchiveStat(before))
    throw new Error("UNSAFE_ARCHIVE:archive-size");
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(filePath, "r");
    const [opened, after] = await Promise.all([
      handle.stat(),
      fs.lstat(filePath),
    ]);
    if (
      !isSafeArchiveStat(opened) ||
      !isSafeArchiveStat(after) ||
      !sameArchiveFile(before, opened) ||
      !sameArchiveFile(after, opened)
    )
      throw new Error("UNSAFE_ARCHIVE:archive-raced");
    const archive = await handle.readFile();
    if (
      archive.byteLength !== opened.size ||
      !isSafeArchiveSize(archive.byteLength)
    )
      throw new Error("UNSAFE_ARCHIVE:archive-raced");
    return archive;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("UNSAFE_ARCHIVE"))
      throw error;
    throw new Error("UNSAFE_ARCHIVE:archive-read");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function isSafeArchiveStat(stat: Stats): boolean {
  return (
    stat.isFile() && !stat.isSymbolicLink() && isSafeArchiveSize(stat.size)
  );
}

function isSafeArchiveSize(size: number): boolean {
  return Number.isSafeInteger(size) && size >= 1 && size <= MAX_ZIP_BYTES;
}

function sameArchiveFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertOutputPath(filePath: string): Promise<void> {
  if (extname(filePath).toLowerCase() !== ".zip" || !basename(filePath))
    throw new Error("UNSAFE_ARCHIVE:export-path");
  const parent = await fs.lstat(dirname(filePath));
  if (!parent.isDirectory() || parent.isSymbolicLink())
    throw new Error("UNSAFE_ARCHIVE:export-parent");
}

function requireEntry(
  entries: Map<string, Entry>,
  name: string,
  maximum: number,
): Entry {
  const entry = entries.get(name);
  if (!entry || entry.data.byteLength < 1 || entry.data.byteLength > maximum)
    throw new Error("UNSAFE_ARCHIVE:file-size");
  return entry;
}

function assertSafeCss(css: string): void {
  const validation = validateSafeCss(css);
  if (!validation.valid || validation.empty)
    throw new Error("UNSAFE_CSS:" + validation.errors.join(","));
}

function decodeObject(data: Buffer, label: string): Record<string, unknown> {
  const text = decodeUtf8(data, label);
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) throw new Error("not-object");
    return value;
  } catch {
    throw new Error(`UNSAFE_ARCHIVE:${label}`);
  }
}

function decodeUtf8(data: Buffer, label: string): string {
  try {
    const value = decoder.decode(data);
    if (value.includes("\0")) throw new Error("nul");
    return value;
  } catch {
    throw new Error(`UNSAFE_ARCHIVE:${label}-utf8`);
  }
}

function decodeBase64(value: string, label: string): Buffer {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  )
    throw new Error(`UNSAFE_ARCHIVE:formal-${label}`);
  return Buffer.from(value, "base64");
}

function syntheticEntry(name: string, data: Buffer): Entry {
  return {
    name,
    data,
    compressedSize: data.byteLength,
    uncompressedSize: data.byteLength,
    directory: false,
  };
}

function isSimpleImageName(value: string): boolean {
  return (
    value === basename(value) &&
    !CONTROL_PATTERN.test(value) &&
    !value.includes("\\") &&
    /\.(?:png|jpe?g|webp)$/iu.test(value)
  );
}

function canonicalThemeId(
  sourceId: string,
  json: Record<string, unknown>,
  css: string,
  image: Buffer,
): string {
  const trimmed = sourceId.trim();
  if (isStorageThemeId(trimmed)) return trimmed;
  const semantic = { ...json };
  delete semantic.id;
  delete semantic.image;
  const seed = trimmed || JSON.stringify(semantic);
  return `import-${createHash("sha256")
    .update(seed)
    .update(css)
    .update(image)
    .digest("hex")
    .slice(0, 24)}`;
}

function isStorageThemeId(value: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) &&
    !value.endsWith(".") &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu.test(value)
  );
}

function normalizedText(
  value: unknown,
  fallback: string,
  maximum: number,
): string {
  if (typeof value !== "string" || CONTROL_PATTERN.test(value)) return fallback;
  const normalized = value.trim();
  return Array.from(normalized).slice(0, maximum).join("") || fallback;
}

function expectedPayloadLimit(name: string): number {
  if (name === "theme.json") return MAX_THEME_BYTES;
  if (name === "theme.css") return MAX_CSS_BYTES;
  if (name === "LICENSE.txt") return MAX_LICENSE_BYTES;
  if (BACKGROUND_MEDIA.has(name)) return MAX_IMAGE_BYTES;
  return 0;
}

function parseSemver(value: unknown, label: string): [bigint, bigint, bigint] {
  assertString(value, label, {
    min: 1,
    max: 32,
    pattern: SEMVER_PATTERN,
    controls: undefined,
  });
  return (value as string).split(".").map(BigInt) as [bigint, bigint, bigint];
}

function compareSemver(
  left: [bigint, bigint, bigint],
  right: [bigint, bigint, bigint],
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

function assertStringSet(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  allowed: string[],
): void {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    throw new Error(`UNSAFE_ARCHIVE:${label}`);
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item) || seen.has(item))
      throw new Error(`UNSAFE_ARCHIVE:${label}`);
    seen.add(item);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  )
    throw new Error(`UNSAFE_ARCHIVE:${label}`);
}

function assertString(
  value: unknown,
  label: string,
  options: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    controls?: RegExp | undefined;
  } = {},
): void {
  const { min = 0, max, pattern, controls = CONTROL_PATTERN } = options;
  if (
    typeof value !== "string" ||
    Array.from(value).length < min ||
    (max !== undefined && Array.from(value).length > max) ||
    (controls && controls.test(value)) ||
    (pattern && !pattern.test(value))
  )
    throw new Error(`UNSAFE_ARCHIVE:${label}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function validateExportImage(
  record: ThemeRecord,
  image: Buffer,
): Promise<"png" | "jpg" | "webp"> {
  if (
    !record.backgroundFile ||
    !record.backgroundMime ||
    !record.backgroundSha256
  )
    throw new Error("INCOMPLETE_THEME:export-image");
  const info = await validateImage(image, record.backgroundFile);
  if (
    info.mime !== record.backgroundMime ||
    info.sha256 !== record.backgroundSha256 ||
    info.bytes !== record.backgroundBytes
  )
    throw new Error("UNSAFE_IMAGE:export-image");
  return info.extension;
}

async function lstatIfExists(path: string) {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function removeIfRegularFile(path: string): Promise<void> {
  const stat = await lstatIfExists(path);
  if (stat?.isFile() && !stat.isSymbolicLink()) await fs.unlink(path);
}

export function importSummary(
  parsed: ParsedThemePackage,
  duplicate = false,
  nameCollision = false,
): ImportResult {
  return {
    status: duplicate ? "duplicate" : "imported",
    libraryId: duplicate ? undefined : parsed.record.libraryId,
    name: parsed.record.name,
    packageFormat: parsed.record.packageFormat,
    signatureIgnored: parsed.signaturePresent,
    nameCollision: nameCollision || undefined,
  };
}
