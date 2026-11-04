import { z } from "zod";
import {
  isThemeColor,
  isThemeHomeCardImageDataUrl,
  type ThemeAppearance,
  type ThemeArt,
  type ThemeColors,
  type ThemeHomeCards,
  type ThemeStyleConfig,
} from "./theme-config";
import { isThemeIconDataUrl } from "./send-icon";

export * from "./theme-config";
export * from "./send-icon";

export * from "./reasoning-background";
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
  type BackgroundMode,
} from "./reasoning-background";
export const PROTOCOL_VERSION = 9 as const;
export const BOOTSTRAP_PROTOCOL_VERSION = 1 as const;
export type BackgroundScope = "content" | "window";
export const DEFAULT_BACKGROUND_SCOPE: BackgroundScope = "window";
export const DEFAULT_SIDEBAR_OVERLAY_OPACITY = 75;

export type ErrorCode =
  | "IPC_INVALID"
  | "IPC_VERSION_MISMATCH"
  | "UNAUTHORIZED_RENDERER"
  | "OPERATION_BUSY"
  | "PAUSED"
  | "STALE_REVISION"
  | "READY_THEME_IMMUTABLE"
  | "NOT_FOUND"
  | "INCOMPLETE_THEME"
  | "UNSAFE_ARCHIVE"
  | "UNSAFE_CSS"
  | "UNSAFE_IMAGE"
  | "DUPLICATE_CONTENT"
  | "THEME_ID_CONFLICT"
  | "THEME_IN_USE"
  | "STORE_PACKAGE_NOT_FOUND"
  | "STORE_ACTIVATION_FAILED"
  | "EXTERNAL_SESSION_RUNNING"
  | "CDP_UNAVAILABLE"
  | "TARGET_INCOMPATIBLE"
  | "TARGET_IDENTITY_MISMATCH"
  | "INJECTION_FAILED"
  | "CLEANUP_FAILED"
  | "STORE_TAMPERED"
  | "UPDATE_UNSUPPORTED"
  | "UPDATE_CHECK_FAILED"
  | "UPDATE_DOWNLOAD_FAILED"
  | "UPDATE_INSTALL_FAILED"
  | "UPDATE_OPEN_FAILED"
  | "CANCELLED"
  | "UNKNOWN";

export interface SafeDetail {
  key: string;
  value?: string;
}

export interface StudioRuntimeInfo {
  appVersion: string;
  protocolVersion: typeof PROTOCOL_VERSION;
}

/** Actual Windows login-item state; it is application-wide, not a theme field. */
export interface StartupSettings {
  supported: boolean;
  enabled: boolean;
}

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ErrorCode; messageKey: string; details?: SafeDetail[] };
    };

export type ThemeStatus = "draft" | "ready";
export type PackageFormat = "simplified" | "formal";
export type ExportFormat = PackageFormat;

export interface ThemeSummary {
  libraryId: string;
  name: string;
  status: ThemeStatus;
  revision: number;
  updatedAt: string;
  accent: string;
  backgroundColor: string;
  hasBackground: boolean;
  backgroundThumbnailUrl?: string;
  selectedForNextLaunch: boolean;
  signed: boolean;
  packageFormat: PackageFormat;
}

export interface ThemeDetail extends ThemeSummary {
  backgroundMode?: BackgroundMode;
  reasoningBackgroundUrls?: Partial<Record<ReasoningEffort, string>>;
  canDiscardChanges: boolean;
  themeId: string;
  description: string;
  css: string;
  backgroundScope: BackgroundScope;
  sidebarOverlayOpacity: number;
  appearance: ThemeAppearance;
  art: ThemeArt;
  colors: ThemeColors;
  homeCards: ThemeHomeCards;
  styleConfig: ThemeStyleConfig;
  backgroundUrl?: string;
  json: Record<string, unknown>;
  validation: ValidationSummary;
}

export type ThemeLiveApplyResult =
  | { status: "applied" }
  | {
      status: "skipped";
      reason: "no-session" | "different-theme" | "paused";
    }
  | { status: "failed"; reason: "verification" | "injection" };

// 保存已提交与当前窗口应用是两个结果；应用失败不得丢失新的主题 revision。
export interface ThemeCommitResult {
  theme: ThemeDetail;
  liveApply: ThemeLiveApplyResult;
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
  assistant?: CodexAssistantSnapshot;
}

export const CODEX_ASSISTANT_PROTOCOL_VERSION = 1 as const;

export interface CodexAssistantSnapshot {
  state: "unavailable" | "listening" | "connected";
  protocolVersion: typeof CODEX_ASSISTANT_PROTOCOL_VERSION;
  lastSeenAt?: string;
}

export interface CodexAssistantPluginInstallResult {
  status: "installed" | "already-installed" | "needs-enable";
  pluginId: "codexstyle-assistant@codexstyle";
  version: string;
  requiresCodexRestart: true;
}

export interface PaletteContrastCheck {
  foreground: keyof ThemeColors;
  background: keyof ThemeColors;
  ratio: number;
  minimum: number;
  passed: boolean;
}

export interface PaletteValidationResult {
  valid: boolean;
  checks: PaletteContrastCheck[];
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

export const SESSION_COMPATIBILITY_FEATURES = [
  "sidebar",
  "titlebar",
  "header",
  "reasoning-background",
] as const;
export type SessionCompatibilityFeature =
  (typeof SESSION_COMPATIBILITY_FEATURES)[number];

/** 只报告已应用主题的局部适配，不代替会话身份或主窗口核验。 */
export interface SessionCompatibility {
  status: "checking" | "full" | "partial";
  unavailable: SessionCompatibilityFeature[];
}

export interface SessionSnapshot {
  state: SessionState;
  messageKey: string;
  canEnd: boolean;
  launchedByTool: boolean;
  compatibility?: SessionCompatibility;
}

export interface UpdateSnapshot {
  configured: boolean;
  status:
    | "unsupported"
    | "idle"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "downloaded"
    | "scheduled"
    | "installing"
    | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseNotes?: string;
  releaseDate?: string;
  /** 主进程签发的候选确认标识；只证明已查看候选，不允许客户端指定版本。 */
  confirmationId?: string;
  checkedAt?: string;
  progress?: UpdateProgress;
  installOnQuit?: boolean;
  errorPhase?: "check" | "download" | "install";
}

export interface UpdateProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
}

export interface ThemePatch {
  backgroundMode?: BackgroundMode;
  name?: string;
  description?: string;
  css?: string;
  themeId?: string;
  backgroundScope?: BackgroundScope;
  sidebarOverlayOpacity?: number;
  appearance?: ThemeAppearance;
  art?: ThemeArt;
  colors?: ThemeColors;
  homeCards?: ThemeHomeCards;
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
  format: ExportFormat;
}

const VersionField = { v: z.literal(PROTOCOL_VERSION) };
const MAX_CSS_BYTES = 256 * 1024;
const MAX_THEME_JSON_BYTES = 384 * 1024;
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

export const ThemeColorsSchema = z
  .object({
    background: z.string().refine(isThemeColor),
    panel: z.string().refine(isThemeColor),
    sidebarText: z.string().refine(isThemeColor),
    threadTabBackground: z.string().refine(isThemeColor),
    threadTabText: z.string().refine(isThemeColor),
    homeTitleText: z.string().refine(isThemeColor),
    homeCardBackground: z.string().refine(isThemeColor),
    homeCardText: z.string().refine(isThemeColor),
    panelAlt: z.string().refine(isThemeColor),
    composerText: z.string().refine(isThemeColor),
    assistantPanel: z.string().refine(isThemeColor),
    assistantMessageText: z.string().refine(isThemeColor),
    userMessageText: z.string().refine(isThemeColor),
    changeCardBackground: z.string().refine(isThemeColor),
    changeCardText: z.string().refine(isThemeColor),
    activityBackground: z.string().refine(isThemeColor),
    activityText: z.string().refine(isThemeColor),
    activityMuted: z.string().refine(isThemeColor),
    topBarBackground: z.string().refine(isThemeColor),
    topBarText: z.string().refine(isThemeColor),
    accent: z.string().refine(isThemeColor),
    accentText: z.string().refine(isThemeColor),
    accentAlt: z.string().refine(isThemeColor),
    secondary: z.string().refine(isThemeColor),
    highlight: z.string().refine(isThemeColor),
    selectionText: z.string().refine(isThemeColor),
    text: z.string().refine(isThemeColor),
    muted: z.string().refine(isThemeColor),
    line: z.string().refine(isThemeColor),
  })
  .strict();

export const CodexAssistantEndpointSchema = z
  .object({
    v: z.literal(CODEX_ASSISTANT_PROTOCOL_VERSION),
    port: z.number().int().min(1).max(65535),
    token: z.string().regex(/^[a-f0-9]{64}$/u),
    pid: z.number().int().positive(),
    createdAt: z.string().datetime(),
  })
  .strict();

const AssistantRequestBase = {
  v: z.literal(CODEX_ASSISTANT_PROTOCOL_VERSION),
  id: z.string().uuid(),
};
const AssistantEmptyParams = z.object({}).strict();

// 助手只编辑工作台公开的六档；旧主题其他档位保留为只读元数据。
export const CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const satisfies readonly ReasoningEffort[];
export type CodexAssistantEditableReasoningEffort =
  (typeof CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS)[number];
const AssistantDraftParams = {
  libraryId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
};
export const CodexAssistantSetBackgroundModeParamsSchema = z
  .object({
    ...AssistantDraftParams,
    mode: z.enum(["normal", "reasoning"]),
  })
  .strict();
export const CodexAssistantChooseReasoningBackgroundParamsSchema = z
  .object({
    ...AssistantDraftParams,
    reasoningEffort: z.enum(CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS),
  })
  .strict();
export const CodexAssistantClearReasoningBackgroundParamsSchema =
  CodexAssistantChooseReasoningBackgroundParamsSchema;

export const CodexAssistantRequestSchema = z.discriminatedUnion("method", [
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("set_background_mode"),
      params: CodexAssistantSetBackgroundModeParamsSchema,
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("choose_reasoning_background"),
      params: CodexAssistantChooseReasoningBackgroundParamsSchema,
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("clear_reasoning_background"),
      params: CodexAssistantClearReasoningBackgroundParamsSchema,
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("status"),
      params: AssistantEmptyParams,
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("list_themes"),
      params: AssistantEmptyParams,
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("get_theme"),
      params: z.object({ libraryId: z.string().uuid() }).strict(),
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("validate_palette"),
      params: z.object({ colors: ThemeColorsSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("create_theme_draft"),
      params: z
        .object({
          name: z.string().trim().min(1).max(80),
          sourceLibraryId: z.string().uuid().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("update_theme_draft"),
      params: z
        .object({
          libraryId: z.string().uuid(),
          expectedRevision: z.number().int().nonnegative(),
          colors: ThemeColorsSchema,
          appearance: z.enum(["auto", "light", "dark"]).optional(),
          description: z.string().max(2000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...AssistantRequestBase,
      method: z.literal("select_theme"),
      params: z
        .object({
          libraryId: z.string().uuid(),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
]);

export type CodexAssistantRequest = z.infer<typeof CodexAssistantRequestSchema>;

export type CodexAssistantErrorCode =
  | "APP_NOT_READY"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "STALE_REVISION"
  | "OPERATION_BUSY"
  | "READY_THEME_IMMUTABLE"
  | "PALETTE_CONTRAST_FAILED"
  | "INCOMPLETE_THEME"
  | "CANCELLED"
  | "UNSAFE_IMAGE"
  | "UNKNOWN";

export type CodexAssistantResponse =
  | {
      v: typeof CODEX_ASSISTANT_PROTOCOL_VERSION;
      id: string;
      ok: true;
      data: unknown;
    }
  | {
      v: typeof CODEX_ASSISTANT_PROTOCOL_VERSION;
      id: string;
      ok: false;
      error: { code: CodexAssistantErrorCode; message: string };
    };

const ThemeHomeCardSchema = z
  .object({
    mode: z.enum(["color", "image"]),
    color: z.string().refine(isThemeColor),
    imageDataUrl: z.string().refine(isThemeHomeCardImageDataUrl).optional(),
  })
  .strict()
  .refine((card) => card.mode !== "image" || Boolean(card.imageDataUrl), {
    message: "home-card-image-required",
  });

const ThemeHomeCardsSchema = z.tuple([
  ThemeHomeCardSchema,
  ThemeHomeCardSchema,
  ThemeHomeCardSchema,
  ThemeHomeCardSchema,
]);

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
export const StartupSettingsSchema = z
  .object({ ...VersionField, enabled: z.boolean() })
  .strict();
export const RendererReadySchema = z
  .object({ v: z.literal(BOOTSTRAP_PROTOCOL_VERSION) })
  .strict();
export const InstallUpdateSchema = z
  .object({ ...VersionField, mode: z.enum(["now", "on-quit"]) })
  .strict();
export const UpdateRequestSchema = z
  .object({ ...VersionField, confirmationId: z.string().uuid() })
  .strict();
export type UpdateDownloadRequest = Omit<
  z.infer<typeof UpdateRequestSchema>,
  "v"
>;
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
export const HomeCardImageSchema = z
  .object({
    ...VersionField,
    libraryId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    cardIndex: z.number().int().min(0).max(3),
  })
  .strict();
export const BackgroundImageSchema = RevisionSchema.extend({
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
}).strict();
export const ReasoningBackgroundSchema = RevisionSchema.extend({
  reasoningEffort: z.enum(REASONING_EFFORTS),
}).strict();
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
        backgroundMode: z.enum(["normal", "reasoning"]).optional(),
        sidebarOverlayOpacity: z.number().int().min(0).max(100).optional(),
        appearance: z.enum(["auto", "light", "dark"]).optional(),
        art: ThemeArtSchema.optional(),
        colors: ThemeColorsSchema.optional(),
        homeCards: ThemeHomeCardsSchema.optional(),
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
  getStartupSettings(): Promise<Result<StartupSettings>>;
  setStartupSettings(
    request: Omit<z.infer<typeof StartupSettingsSchema>, "v">,
  ): Promise<Result<StartupSettings>>;
  rendererReady(): Promise<Result<StudioRuntimeInfo>>;
  openLogDirectory(): Promise<Result<boolean>>;
  installAssistantPlugin(): Promise<Result<CodexAssistantPluginInstallResult>>;
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
  discardChanges(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  chooseBackground(
    request: Omit<z.infer<typeof BackgroundImageSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  clearReasoningBackground(
    request: Omit<z.infer<typeof ReasoningBackgroundSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  chooseSendIcon(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  chooseHomeCardImage(
    request: Omit<z.infer<typeof HomeCardImageSchema>, "v">,
  ): Promise<Result<ThemeDetail>>;
  commit(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeCommitResult>>;
  deleteTheme(
    request: Omit<z.infer<typeof RevisionSchema>, "v">,
  ): Promise<Result<ThemeSnapshot>>;
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
  recheckSession(): Promise<Result<ThemeSnapshot>>;
  launchSession(): Promise<Result<ThemeSnapshot>>;
  pauseSession(): Promise<Result<ThemeSnapshot>>;
  resumeSession(): Promise<Result<ThemeSnapshot>>;
  endOwnedSession(): Promise<Result<ThemeSnapshot>>;
  getUpdateStatus(): Promise<Result<UpdateSnapshot>>;
  checkUpdate(): Promise<Result<UpdateSnapshot>>;
  requestUpdate(
    request: UpdateDownloadRequest,
  ): Promise<Result<UpdateSnapshot>>;
  cancelUpdate(): Promise<Result<UpdateSnapshot>>;
  installUpdate(
    request: Omit<z.infer<typeof InstallUpdateSchema>, "v">,
  ): Promise<Result<UpdateSnapshot>>;
  openUpdatePage(): Promise<Result<UpdateSnapshot>>;
  onStateChanged(listener: (snapshot: ThemeSnapshot) => void): () => void;
}

declare global {
  interface Window {
    codexStyle: CodexStyleApi;
  }
}
