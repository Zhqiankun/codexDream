import { z } from "zod";
import {
  isThemeColor,
  type ThemeAppearance,
  type ThemeArt,
  type ThemeColors,
  type ThemeStyleConfig,
} from "./theme-config";
import { isThemeIconDataUrl } from "./send-icon";

export * from "./theme-config";
export * from "./send-icon";

export const PROTOCOL_VERSION = 1 as const;
export type BackgroundScope = "content" | "window";
export const DEFAULT_BACKGROUND_SCOPE: BackgroundScope = "window";
export const DEFAULT_SIDEBAR_OVERLAY_OPACITY = 75;
export const SIDEBAR_OVERLAY_RGB = "15 23 42";

export type ErrorCode =
  | "IPC_INVALID"
  | "UNAUTHORIZED_RENDERER"
  | "OPERATION_BUSY"
  | "PAUSED"
  | "STALE_REVISION"
  | "NOT_FOUND"
  | "INCOMPLETE_THEME"
  | "UNSAFE_ARCHIVE"
  | "UNSAFE_CSS"
  | "UNSAFE_IMAGE"
  | "DUPLICATE_CONTENT"
  | "THEME_ID_CONFLICT"
  | "STORE_PACKAGE_NOT_FOUND"
  | "STORE_ACTIVATION_FAILED"
  | "EXTERNAL_SESSION_RUNNING"
  | "CDP_UNAVAILABLE"
  | "TARGET_INCOMPATIBLE"
  | "TARGET_IDENTITY_MISMATCH"
  | "INJECTION_FAILED"
  | "CLEANUP_FAILED"
  | "STORE_TAMPERED"
  | "UPDATE_CHECK_FAILED"
  | "UPDATE_OPEN_FAILED"
  | "CANCELLED"
  | "UNKNOWN";

export interface SafeDetail {
  key: string;
  value?: string;
}

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ErrorCode; messageKey: string; details?: SafeDetail[] };
    };

export type ThemeStatus = "draft" | "ready";
export type PackageFormat = "simplified" | "formal";

export interface ThemeSummary {
  libraryId: string;
  name: string;
  status: ThemeStatus;
  revision: number;
  updatedAt: string;
  accent: string;
  hasBackground: boolean;
  selectedForNextLaunch: boolean;
  signed: boolean;
  packageFormat: PackageFormat;
}

export interface ThemeDetail extends ThemeSummary {
  themeId: string;
  description: string;
  css: string;
  backgroundScope: BackgroundScope;
  sidebarOverlayOpacity: number;
  appearance: ThemeAppearance;
  art: ThemeArt;
  colors: ThemeColors;
  styleConfig: ThemeStyleConfig;
  backgroundUrl?: string;
  json: Record<string, unknown>;
  validation: ValidationSummary;
}

export interface ValidationSummary {
  css: "valid" | "invalid" | "empty";
  image: "valid" | "missing" | "invalid";
  package: "ready" | "draft" | "invalid";
  warnings: string[];
}

export interface ThemeSnapshot {
  themes: ThemeSummary[];
  selectedLibraryId?: string;
  paused: boolean;
  session: SessionSnapshot;
  update: UpdateSnapshot;
}

export type SessionState =
  | "NO_SESSION"
  | "EXTERNAL_BLOCKED"
  | "LAUNCHING"
  | "VERIFYING_CDP"
  | "INJECTING"
  | "THEMED_SESSION"
  | "PAUSED_FUTURE"
  | "INCOMPATIBLE"
  | "ORPHANED";

export interface SessionSnapshot {
  state: SessionState;
  messageKey: string;
  canEnd: boolean;
  launchedByTool: boolean;
}

export interface UpdateSnapshot {
  configured: true;
  status: "idle" | "current" | "available" | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  checkedAt?: string;
}

export interface ThemePatch {
  name?: string;
  description?: string;
  css?: string;
  themeId?: string;
  backgroundScope?: BackgroundScope;
  sidebarOverlayOpacity?: number;
  appearance?: ThemeAppearance;
  art?: ThemeArt;
  colors?: ThemeColors;
  styleConfig?: ThemeStyleConfig;
  themeJson?: string;
}

export interface ImportResult {
  status: "imported" | "duplicate" | "conflict";
  libraryId?: string;
  transactionId?: string;
  name?: string;
  conflictLibraryId?: string;
  conflictRevision?: number;
  packageFormat?: PackageFormat;
  signatureIgnored?: boolean;
  nameCollision?: boolean;
}

export interface ExportResult {
  cancelled: boolean;
  format: PackageFormat;
}

const VersionField = { v: z.literal(PROTOCOL_VERSION) };
const MAX_CSS_BYTES = 256 * 1024;
const MAX_THEME_JSON_BYTES = 64 * 1024;
const utf8 = new TextEncoder();

function hasAtMostCssBytes(value: string): boolean {
  return utf8.encode(value).byteLength <= MAX_CSS_BYTES;
}

function hasAtMostThemeJsonBytes(value: string): boolean {
  return utf8.encode(value).byteLength <= MAX_THEME_JSON_BYTES;
}

const ThemeArtSchema = z
  .object({
    focusX: z.number().min(0).max(1),
    focusY: z.number().min(0).max(1),
    safeArea: z.enum(["none", "left", "right"]),
    taskMode: z.enum(["ambient", "full", "off"]),
  })
  .strict();

const ThemeColorsSchema = z
  .object({
    background: z.string().refine(isThemeColor),
    panel: z.string().refine(isThemeColor),
    sidebarText: z.string().refine(isThemeColor),
    panelAlt: z.string().refine(isThemeColor),
    assistantPanel: z.string().refine(isThemeColor),
    accent: z.string().refine(isThemeColor),
    accentAlt: z.string().refine(isThemeColor),
    secondary: z.string().refine(isThemeColor),
    highlight: z.string().refine(isThemeColor),
    text: z.string().refine(isThemeColor),
    muted: z.string().refine(isThemeColor),
    line: z.string().refine(isThemeColor),
  })
  .strict();

const ThemeStyleConfigSchema = z
  .object({
    mode: z.enum(["configured", "advanced"]),
    recipes: z
      .object({
        sidebar: z.boolean(),
        composer: z.boolean(),
        message: z.boolean(),
        dialog: z.boolean(),
      })
      .strict(),
    sendIcon: z.enum(["native", "paper-plane", "spark", "rocket", "custom"]),
    sendIconDataUrl: z.string().refine(isThemeIconDataUrl).optional(),
    blur: z.number().int().min(0).max(30),
    radius: z.number().int().min(0).max(28),
    borderWidth: z.number().int().min(0).max(4),
    shadow: z.enum(["none", "soft", "strong"]),
  })
  .strict()
  .refine(
    (style) => style.sendIcon !== "custom" || Boolean(style.sendIconDataUrl),
    { message: "custom-send-icon-required" },
  );

export const EmptyRequestSchema = z.object(VersionField).strict();
export const LibraryIdSchema = z
  .object({ ...VersionField, libraryId: z.string().uuid() })
  .strict();
export const RevisionSchema = z
  .object({
    ...VersionField,
    libraryId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const CreateDraftSchema = z
  .object({ ...VersionField, name: z.string().trim().max(80).optional() })
  .strict();
export const PatchDraftSchema = z
  .object({
    ...VersionField,
    libraryId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    patch: z
      .object({
        name: z.string().trim().max(80).optional(),
        description: z.string().max(2000).optional(),
        css: z
          .string()
          .max(262144)
          .refine(hasAtMostCssBytes, { message: "css-too-large" })
          .optional(),
        themeId: z.string().trim().max(80).optional(),
        backgroundScope: z.enum(["content", "window"]).optional(),
        sidebarOverlayOpacity: z.number().int().min(0).max(100).optional(),
        appearance: z.enum(["auto", "light", "dark"]).optional(),
        art: ThemeArtSchema.optional(),
        colors: ThemeColorsSchema.optional(),
        styleConfig: ThemeStyleConfigSchema.optional(),
        themeJson: z
          .string()
          .max(MAX_THEME_JSON_BYTES)
          .refine(hasAtMostThemeJsonBytes, { message: "theme-json-too-large" })
          .optional(),
      })
      .strict()
      .refine(
        (patch) =>
          patch.themeJson === undefined || Object.keys(patch).length === 1,
        { message: "theme-json-must-be-exclusive" },
      ),
  })
  .strict();
export const ResolveImportSchema = z
  .object({
    ...VersionField,
    transactionId: z.string().uuid(),
    action: z.enum(["keep-both", "replace", "cancel"]),
    replaceLibraryId: z.string().uuid().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export const ExportSchema = z
  .object({
    ...VersionField,
    libraryId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    format: z.enum(["simplified", "formal"]),
  })
  .strict();

export interface CodexStyleApi {
  getSnapshot(): Promise<Result<ThemeSnapshot>>;
  getTheme(
    request: Omit<z.infer<typeof LibraryIdSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  createDraft(
    request: Omit<z.infer<typeof CreateDraftSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  patchDraft(
    request: Omit<z.infer<typeof PatchDraftSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  chooseBackground(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  chooseSendIcon(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  commit(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  importZip(): Promise<Result<ImportResult>>;
  resolveImport(
    request: Omit<z.infer<typeof ResolveImportSchema>, "v">,
  ): Promise<Result<ImportResult>>;
  exportZip(
    request: Omit<z.infer<typeof ExportSchema>, "v">,
  ): Promise<Result<ExportResult>>;
  selectForNextLaunch(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeSnapshot>>;
  clearSelection(): Promise<Result<ThemeSnapshot>>;
  launchSession(): Promise<Result<ThemeSnapshot>>;
  pauseSession(): Promise<Result<ThemeSnapshot>>;
  resumeSession(): Promise<Result<ThemeSnapshot>>;
  endOwnedSession(): Promise<Result<ThemeSnapshot>>;
  getUpdateStatus(): Promise<Result<UpdateSnapshot>>;
  requestUpdate(): Promise<Result<UpdateSnapshot>>;
  openUpdatePage(): Promise<Result<UpdateSnapshot>>;
  onStateChanged(listener: (snapshot: ThemeSnapshot) => void): () => void;
}

declare global {
  interface Window {
    codexStyle: CodexStyleApi;
  }
}
