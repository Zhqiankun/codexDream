import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  isCompleteThemeArt,
  isCompleteThemeColors,
  isCompleteThemeStyleConfig,
  isThemeAppearance,
  THEME_COLOR_KEYS,
  type BackgroundScope,
  type ThemeAppearance,
  type ThemeArt,
  type ThemeColors,
  type ThemeStyleConfig,
} from "../../contracts";
import { readImageFileBounded, validateImage, type ImageInfo } from "./image";

export const DEFAULT_BUNDLED_PRESET_PACK_ID = "user-wallpapers-2026-08-30-v7";
export const ADDITIONAL_BUNDLED_PRESET_PACK_ID =
  "user-wallpapers-2026-08-31-v8";
export const PREVIOUS_BUNDLED_PRESET_PACK_ID = "user-wallpapers-2026-08-30-v6";
export const FIFTH_BUNDLED_PRESET_PACK_ID = "user-wallpapers-2026-08-30-v5";
export const FOURTH_BUNDLED_PRESET_PACK_ID = "user-wallpapers-2026-08-30-v4";
export const THIRD_BUNDLED_PRESET_PACK_ID = "user-wallpapers-2026-08-29-v3";
export const SECOND_BUNDLED_PRESET_PACK_ID = "user-wallpapers-2026-08-29-v2";
export const FIRST_BUNDLED_PRESET_PACK_ID = "user-wallpapers-2026-08-29-v1";

export interface BundledPresetTheme {
  presetId: string;
  themeId: string;
  name: string;
  description: string;
  image: string;
  imageSha256: string;
  previousImageSha256: string[];
  previousFingerprints: string[];
  backgroundScope: BackgroundScope;
  sidebarOverlayOpacity: number;
  appearance: Exclude<ThemeAppearance, "auto">;
  art: ThemeArt;
  colors: ThemeColors;
  style: ThemeStyleConfig;
}

export interface PreparedBundledPresetTheme extends BundledPresetTheme {
  imageBytes: Buffer;
  imageInfo: ImageInfo;
}

export interface PreparedBundledPresetPack {
  packId: string;
  replacesPackIds: string[];
  introducedThemeIds: string[];
  themes: PreparedBundledPresetTheme[];
}

export interface BundledPresetSource {
  packId: string;
  load(): Promise<PreparedBundledPresetPack>;
}

interface CatalogManifest {
  schemaVersion: 4;
  packId: string;
  replacesPackIds: string[];
  introducedThemeIds: string[];
  themes: BundledPresetTheme[];
}

const MAX_CATALOG_BYTES = 256 * 1024;
const MAX_PRESETS_PER_PACK = 64;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const IMAGE_PATTERN = /^[a-z0-9][a-z0-9.-]{0,79}\.(?:png|jpg|webp)$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "packId",
  "replacesPackIds",
  "introducedThemeIds",
  "themes",
]);
const THEME_KEYS = new Set([
  "presetId",
  "themeId",
  "name",
  "description",
  "image",
  "imageSha256",
  "previousImageSha256",
  "previousFingerprints",
  "backgroundScope",
  "sidebarOverlayOpacity",
  "appearance",
  "art",
  "colors",
  "style",
]);
const ART_KEYS = new Set(["focusX", "focusY", "safeArea", "taskMode"]);
const COLOR_KEYS = new Set<string>(THEME_COLOR_KEYS);
const STYLE_KEYS = new Set([
  "mode",
  "recipes",
  "sendIcon",
  "blur",
  "radius",
  "borderWidth",
  "shadow",
]);
const RECIPE_KEYS = new Set(["sidebar", "composer", "message", "dialog"]);

export function createBundledPresetSource(
  root: string,
  packId = DEFAULT_BUNDLED_PRESET_PACK_ID,
): BundledPresetSource {
  return {
    packId,
    async load() {
      try {
        const manifest = await readCatalog(join(root, "catalog.json"));
        if (manifest.packId !== packId)
          throw new Error("BUNDLED_PRESET_PACK_INVALID:pack-id");
        const themes: PreparedBundledPresetTheme[] = [];
        for (const theme of manifest.themes) {
          const imageBytes = await readImageFileBounded(
            join(root, theme.image),
          );
          const imageInfo = await validateImage(imageBytes, theme.image);
          if (imageInfo.sha256 !== theme.imageSha256)
            throw new Error("BUNDLED_PRESET_PACK_INVALID:image-hash");
          themes.push({
            ...theme,
            previousImageSha256: [...theme.previousImageSha256],
            previousFingerprints: [...theme.previousFingerprints],
            art: { ...theme.art },
            colors: { ...theme.colors },
            style: {
              ...theme.style,
              recipes: { ...theme.style.recipes },
            },
            imageBytes,
            imageInfo,
          });
        }
        return {
          packId,
          replacesPackIds: [...manifest.replacesPackIds],
          introducedThemeIds: [...manifest.introducedThemeIds],
          themes,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("BUNDLED_PRESET_PACK_INVALID")
        )
          throw error;
        throw new Error("BUNDLED_PRESET_PACK_INVALID:asset-read", {
          cause: error,
        });
      }
    },
  };
}

async function readCatalog(path: string): Promise<CatalogManifest> {
  const before = await stat(path);
  if (
    !before.isFile() ||
    !Number.isSafeInteger(before.size) ||
    before.size < 1 ||
    before.size > MAX_CATALOG_BYTES
  )
    throw new Error("BUNDLED_PRESET_PACK_INVALID:catalog-size");
  const bytes = await readFile(path);
  if (bytes.byteLength !== before.size)
    throw new Error("BUNDLED_PRESET_PACK_INVALID:catalog-changed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new Error("BUNDLED_PRESET_PACK_INVALID:catalog-json");
  }
  if (!isRecord(parsed) || hasUnknownKeys(parsed, MANIFEST_KEYS))
    throw new Error("BUNDLED_PRESET_PACK_INVALID:catalog-schema");
  if (
    parsed.schemaVersion !== 4 ||
    !ID_PATTERN.test(String(parsed.packId ?? "")) ||
    !Array.isArray(parsed.replacesPackIds) ||
    parsed.replacesPackIds.length > 8 ||
    parsed.replacesPackIds.some(
      (packId) => typeof packId !== "string" || !ID_PATTERN.test(packId),
    ) ||
    new Set(parsed.replacesPackIds).size !== parsed.replacesPackIds.length ||
    parsed.replacesPackIds.includes(parsed.packId) ||
    !Array.isArray(parsed.introducedThemeIds) ||
    parsed.introducedThemeIds.length > MAX_PRESETS_PER_PACK ||
    parsed.introducedThemeIds.some(
      (themeId) => typeof themeId !== "string" || !ID_PATTERN.test(themeId),
    ) ||
    new Set(parsed.introducedThemeIds).size !==
      parsed.introducedThemeIds.length ||
    !Array.isArray(parsed.themes) ||
    parsed.themes.length < 1 ||
    parsed.themes.length > MAX_PRESETS_PER_PACK
  )
    throw new Error("BUNDLED_PRESET_PACK_INVALID:catalog-schema");

  const themes = parsed.themes.map(parseTheme);
  ensureUnique(
    themes.map((theme) => theme.presetId),
    "preset-id",
  );
  ensureUnique(
    themes.map((theme) => theme.themeId),
    "theme-id",
  );
  ensureUnique(
    themes.map((theme) => theme.image),
    "image",
  );
  const themeIds = new Set(themes.map((theme) => theme.themeId));
  if (
    (parsed.introducedThemeIds as string[]).some(
      (themeId) => !themeIds.has(themeId),
    )
  )
    throw new Error("BUNDLED_PRESET_PACK_INVALID:introduced-theme");
  return {
    schemaVersion: 4,
    packId: parsed.packId as string,
    replacesPackIds: [...(parsed.replacesPackIds as string[])],
    introducedThemeIds: [...(parsed.introducedThemeIds as string[])],
    themes,
  };
}

function parseTheme(value: unknown): BundledPresetTheme {
  if (!isRecord(value) || hasUnknownKeys(value, THEME_KEYS))
    throw new Error("BUNDLED_PRESET_PACK_INVALID:theme-schema");
  if (
    typeof value.presetId !== "string" ||
    !ID_PATTERN.test(value.presetId) ||
    typeof value.themeId !== "string" ||
    !ID_PATTERN.test(value.themeId) ||
    !boundedString(value.name, 1, 80) ||
    !boundedString(value.description, 0, 2000) ||
    typeof value.image !== "string" ||
    !IMAGE_PATTERN.test(value.image) ||
    value.image.includes("..") ||
    typeof value.imageSha256 !== "string" ||
    !SHA256_PATTERN.test(value.imageSha256) ||
    !Array.isArray(value.previousImageSha256) ||
    value.previousImageSha256.length > 8 ||
    value.previousImageSha256.some(
      (fingerprint) =>
        typeof fingerprint !== "string" || !SHA256_PATTERN.test(fingerprint),
    ) ||
    new Set(value.previousImageSha256).size !==
      value.previousImageSha256.length ||
    value.previousImageSha256.includes(value.imageSha256) ||
    !Array.isArray(value.previousFingerprints) ||
    value.previousFingerprints.length > 8 ||
    value.previousFingerprints.some(
      (fingerprint) =>
        typeof fingerprint !== "string" || !SHA256_PATTERN.test(fingerprint),
    ) ||
    new Set(value.previousFingerprints).size !==
      value.previousFingerprints.length ||
    (value.backgroundScope !== "content" &&
      value.backgroundScope !== "window") ||
    typeof value.sidebarOverlayOpacity !== "number" ||
    !Number.isSafeInteger(value.sidebarOverlayOpacity) ||
    value.sidebarOverlayOpacity < 0 ||
    value.sidebarOverlayOpacity > 100 ||
    !isThemeAppearance(value.appearance) ||
    value.appearance === "auto" ||
    !isRecord(value.art) ||
    hasUnknownKeys(value.art, ART_KEYS) ||
    !isCompleteThemeArt(value.art) ||
    !isRecord(value.colors) ||
    hasUnknownKeys(value.colors, COLOR_KEYS) ||
    !isCompleteThemeColors(value.colors) ||
    !isRecord(value.style) ||
    hasUnknownKeys(value.style, STYLE_KEYS) ||
    !isRecord(value.style.recipes) ||
    hasUnknownKeys(value.style.recipes, RECIPE_KEYS) ||
    !isCompleteThemeStyleConfig(value.style) ||
    value.style.mode !== "configured"
  )
    throw new Error("BUNDLED_PRESET_PACK_INVALID:theme-schema");
  return {
    presetId: value.presetId,
    themeId: value.themeId,
    name: value.name,
    description: value.description,
    image: value.image,
    imageSha256: value.imageSha256,
    previousImageSha256: [...(value.previousImageSha256 as string[])],
    previousFingerprints: [...(value.previousFingerprints as string[])],
    backgroundScope: value.backgroundScope,
    sidebarOverlayOpacity: value.sidebarOverlayOpacity,
    appearance: value.appearance,
    art: { ...value.art },
    colors: { ...value.colors },
    style: { ...value.style, recipes: { ...value.style.recipes } },
  };
}

function ensureUnique(values: string[], field: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`BUNDLED_PRESET_PACK_INVALID:${field}-duplicate`);
}

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function hasUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
