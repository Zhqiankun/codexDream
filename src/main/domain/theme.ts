import { createHash } from "node:crypto";
import type {
  BackgroundScope,
  PackageFormat,
  ThemeDetail,
  ThemeSummary,
  ValidationSummary,
} from "../../contracts";
import { readThemeConfiguration } from "../../contracts";

export interface ThemeRecord {
  libraryId: string;
  themeId: string;
  name: string;
  description: string;
  css: string;
  backgroundScope: BackgroundScope;
  sidebarOverlayOpacity: number;
  backgroundFile?: string;
  backgroundMime?: string;
  backgroundSha256?: string;
  backgroundBytes?: number;
  json: Record<string, unknown>;
  status: "draft" | "ready";
  revision: number;
  updatedAt: string;
  fingerprint: string;
  packageFormat: PackageFormat;
  signed: boolean;
  importedFormal?: {
    manifest: Record<string, unknown>;
    signaturePresent: boolean;
    edited: boolean;
    originalThemeJson?: Record<string, unknown>;
    originalThemeJsonBase64: string;
    originalCssBase64: string;
    originalManifestBase64: string;
    originalImageName: string;
    licenseBase64?: string;
    signatureBase64?: string;
  };
  validation: ValidationSummary;
}

export interface ThemeIndex {
  version: 2;
  selectedLibraryId?: string;
  lastKnownGoodLibraryId?: string;
  paused: boolean;
  installedPresetPacks: string[];
  themes: ThemeRecord[];
  checkpoints: ThemeCheckpoint[];
}

/**
 * The durable state captured immediately before a theme's first edit.
 *
 * Background bytes live in a separate managed file so replacing a background
 * with another image using the same extension cannot overwrite the rollback
 * copy. The file name is deliberately independent from the theme library ID.
 */
export interface ThemeCheckpoint {
  libraryId: string;
  record: ThemeRecord;
  backgroundFile?: string;
  wasLastKnownGood: boolean;
  createdAt: string;
}

const DEFAULT_ACCENT = "#8b5cf6";
const ACCENT_PATTERN =
  /^#[0-9a-f]{3}(?:[0-9a-f]|[0-9a-f]{3}(?:[0-9a-f]{2})?)?$/iu;
const COLOR_ONLY_BACKGROUND_HASHES = new Set([
  // Generated 960×540 surfaces for the two built-in color-only themes.
  "b5a40eda9deda93bf3b970b7c4b6f7a28a143eb8103209a1fd69dce5b114e939",
  "7379acece805850591cc15158740696933126c71538a145b1e0cdb06627b0c5f",
]);

export function toSummary(
  theme: ThemeRecord,
  selectedLibraryId?: string,
  assetUrl?: string,
): ThemeSummary {
  const configuration = readThemeConfiguration(theme.json);
  const accent = safeThemeAccent(
    theme.json.colors === undefined
      ? theme.json.accent
      : configuration.colors.accent,
  );
  return {
    libraryId: theme.libraryId,
    name: theme.name,
    status: theme.status,
    revision: theme.revision,
    updatedAt: theme.updatedAt,
    accent,
    backgroundColor: configuration.colors.background,
    hasBackground: Boolean(theme.backgroundFile),
    backgroundThumbnailUrl:
      assetUrl && hasUserSelectedBackground(theme) ? assetUrl : undefined,
    selectedForNextLaunch: theme.libraryId === selectedLibraryId,
    signed: theme.signed,
    packageFormat: theme.packageFormat,
  };
}

function safeThemeAccent(value: unknown): string {
  return typeof value === "string" && ACCENT_PATTERN.test(value)
    ? value
    : DEFAULT_ACCENT;
}

export function toDetail(
  theme: ThemeRecord,
  selectedLibraryId?: string,
  assetUrl?: string,
  canDiscardChanges = false,
): ThemeDetail {
  const configuration = readThemeConfiguration(theme.json);
  return {
    ...toSummary(theme, selectedLibraryId, assetUrl),
    canDiscardChanges,
    themeId: theme.themeId,
    description: theme.description,
    css: theme.css,
    backgroundScope: theme.backgroundScope,
    sidebarOverlayOpacity: theme.sidebarOverlayOpacity,
    appearance: configuration.appearance,
    art: { ...configuration.art },
    colors: { ...configuration.colors },
    homeCards: configuration.homeCards.map((card) => ({
      ...card,
    })) as typeof configuration.homeCards,
    styleConfig: {
      ...configuration.styleConfig,
      recipes: { ...configuration.styleConfig.recipes },
    },
    backgroundUrl: assetUrl,
    json: { ...theme.json },
    validation: {
      ...theme.validation,
      warnings: [...theme.validation.warnings],
    },
  };
}

function hasUserSelectedBackground(theme: ThemeRecord): boolean {
  return Boolean(
    theme.backgroundFile &&
      theme.backgroundFile !== `${theme.libraryId}.png` &&
      !COLOR_ONLY_BACKGROUND_HASHES.has(theme.backgroundSha256 ?? ""),
  );
}

export function createDefaultIndex(): ThemeIndex {
  return {
    version: 2,
    paused: false,
    installedPresetPacks: [],
    themes: [],
    checkpoints: [],
  };
}

/**
 * A theme's import identity intentionally ignores external IDs and generated
 * image filenames. Both are transport/storage details rather than theme
 * content, so they must not defeat duplicate detection or injection checks.
 */
export function themeFingerprint(
  theme: Pick<
    ThemeRecord,
    | "name"
    | "description"
    | "json"
    | "css"
    | "backgroundSha256"
    | "importedFormal"
  >,
): string {
  const json = { ...theme.json };
  delete json.id;
  delete json.image;
  return createHash("sha256")
    .update(
      JSON.stringify({
        name: theme.name,
        description: theme.description,
        json: canonicalJson(json),
        backgroundSha256: theme.backgroundSha256 ?? "",
        license: theme.importedFormal?.licenseBase64 ?? "",
      }),
    )
    .update(theme.css)
    .digest("hex");
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalJson(entry)]),
  );
}
