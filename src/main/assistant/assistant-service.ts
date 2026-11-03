import {
  CODEX_ASSISTANT_PROTOCOL_VERSION,
  CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS,
  REASONING_EFFORTS,
  type BackgroundMode,
  type CodexAssistantEditableReasoningEffort,
  type CodexAssistantErrorCode,
  type CodexAssistantRequest,
  type CodexAssistantResponse,
  type Result,
  type ThemeDetail,
  type ThemePatch,
  type ThemeSnapshot,
} from "../../contracts";
import { validatePaletteContrast } from "./palette-validator";

export interface CodexAssistantOperations {
  appVersion: string;
  snapshot(): ThemeSnapshot;
  getTheme(libraryId: string): Result<ThemeDetail>;
  createDraft(name?: string): Promise<Result<ThemeDetail>>;
  createDraftFrom(
    sourceLibraryId: string,
    name?: string,
  ): Promise<Result<ThemeDetail>>;
  patchDraft(
    libraryId: string,
    expectedRevision: number,
    patch: ThemePatch,
  ): Promise<Result<ThemeDetail>>;
  selectTheme(
    libraryId: string,
    expectedRevision: number,
  ): Promise<Result<ThemeSnapshot>>;
  setBackgroundMode(
    libraryId: string,
    expectedRevision: number,
    mode: BackgroundMode,
  ): Promise<Result<ThemeDetail>>;
  chooseReasoningBackground(
    libraryId: string,
    expectedRevision: number,
    reasoningEffort: CodexAssistantEditableReasoningEffort,
    signal?: AbortSignal,
  ): Promise<Result<ThemeDetail>>;
  clearReasoningBackground(
    libraryId: string,
    expectedRevision: number,
    reasoningEffort: CodexAssistantEditableReasoningEffort,
  ): Promise<Result<ThemeDetail>>;
}

export class CodexAssistantService {
  constructor(private readonly operations: CodexAssistantOperations) {}

  async handle(
    request: CodexAssistantRequest,
    signal?: AbortSignal,
  ): Promise<CodexAssistantResponse> {
    switch (request.method) {
      case "status":
        return this.success(request.id, {
          appVersion: this.operations.appVersion,
          protocolVersion: CODEX_ASSISTANT_PROTOCOL_VERSION,
          selectedLibraryId: this.operations.snapshot().selectedLibraryId,
        });
      case "list_themes": {
        const snapshot = this.operations.snapshot();
        return this.success(request.id, {
          selectedLibraryId: snapshot.selectedLibraryId,
          themes: snapshot.themes,
        });
      }
      case "get_theme": {
        const result = this.operations.getTheme(request.params.libraryId);
        return result.ok
          ? this.success(request.id, assistantTheme(result.data))
          : this.failureFromResult(request.id, result);
      }
      case "validate_palette":
        return this.success(
          request.id,
          validatePaletteContrast(request.params.colors),
        );
      case "create_theme_draft": {
        const result = request.params.sourceLibraryId
          ? await this.operations.createDraftFrom(
              request.params.sourceLibraryId,
              request.params.name,
            )
          : await this.operations.createDraft(request.params.name);
        return result.ok
          ? this.success(request.id, assistantTheme(result.data))
          : this.failureFromResult(request.id, result);
      }
      case "update_theme_draft": {
        const current = this.operations.getTheme(request.params.libraryId);
        if (!current.ok) return this.failureFromResult(request.id, current);
        if (current.data.status !== "draft")
          return this.failure(
            request.id,
            "READY_THEME_IMMUTABLE",
            "已保存主题不能由 Codex 直接覆盖，请先新建派生草稿。",
          );
        const validation = validatePaletteContrast(request.params.colors);
        if (!validation.valid) {
          const failures = validation.checks
            .filter((check) => !check.passed)
            .slice(0, 5)
            .map(
              (check) =>
                `${check.foreground}/${check.background} ${check.ratio}:1 < ${check.minimum}:1`,
            )
            .join("；");
          return this.failure(
            request.id,
            "PALETTE_CONTRAST_FAILED",
            `配色对比度未通过：${failures}`,
          );
        }
        const result = await this.operations.patchDraft(
          request.params.libraryId,
          request.params.expectedRevision,
          {
            colors: request.params.colors,
            ...(request.params.appearance
              ? { appearance: request.params.appearance }
              : {}),
            ...(request.params.description !== undefined
              ? { description: request.params.description }
              : {}),
          },
        );
        return result.ok
          ? this.success(request.id, {
              theme: assistantTheme(result.data),
              validation,
            })
          : this.failureFromResult(request.id, result);
      }
      case "select_theme": {
        const current = this.operations.getTheme(request.params.libraryId);
        if (!current.ok) return this.failureFromResult(request.id, current);
        if (current.data.status !== "ready")
          return this.failure(
            request.id,
            "INCOMPLETE_THEME",
            "只能选择已经在 CodexStyle 中保存的主题。",
          );
        const result = await this.operations.selectTheme(
          request.params.libraryId,
          request.params.expectedRevision,
        );
        return result.ok
          ? this.success(request.id, {
              selectedLibraryId: result.data.selectedLibraryId,
            })
          : this.failureFromResult(request.id, result);
      }
      case "set_background_mode":
      case "choose_reasoning_background":
      case "clear_reasoning_background": {
        const { libraryId, expectedRevision } = request.params;
        const current = this.operations.getTheme(libraryId);
        if (!current.ok) return this.failureFromResult(request.id, current);
        if (current.data.status !== "draft")
          return this.failure(
            request.id,
            "READY_THEME_IMMUTABLE",
            assistantErrorMessage("READY_THEME_IMMUTABLE"),
          );
        if (current.data.revision !== expectedRevision)
          return this.failure(
            request.id,
            "STALE_REVISION",
            assistantErrorMessage("STALE_REVISION"),
          );
        if (signal?.aborted)
          return this.failure(
            request.id,
            "CANCELLED",
            assistantErrorMessage("CANCELLED"),
          );
        const result =
          request.method === "set_background_mode"
            ? await this.operations.setBackgroundMode(
                libraryId,
                expectedRevision,
                request.params.mode,
              )
            : request.method === "choose_reasoning_background"
              ? await this.operations.chooseReasoningBackground(
                  libraryId,
                  expectedRevision,
                  request.params.reasoningEffort,
                  signal,
                )
              : await this.operations.clearReasoningBackground(
                  libraryId,
                  expectedRevision,
                  request.params.reasoningEffort,
                );
        return result.ok
          ? this.success(request.id, assistantTheme(result.data))
          : this.failureFromResult(request.id, result);
      }
    }
  }

  private success(id: string, data: unknown): CodexAssistantResponse {
    return { v: CODEX_ASSISTANT_PROTOCOL_VERSION, id, ok: true, data };
  }

  private failureFromResult(
    id: string,
    result: Extract<Result<unknown>, { ok: false }>,
  ): CodexAssistantResponse {
    const code = assistantErrorCode(result.error.code);
    return this.failure(id, code, assistantErrorMessage(code));
  }

  private failure(
    id: string,
    code: CodexAssistantErrorCode,
    message: string,
  ): CodexAssistantResponse {
    return {
      v: CODEX_ASSISTANT_PROTOCOL_VERSION,
      id,
      ok: false,
      error: { code, message },
    };
  }
}

function assistantTheme(detail: ThemeDetail): Record<string, unknown> {
  return {
    libraryId: detail.libraryId,
    name: detail.name,
    description: detail.description,
    status: detail.status,
    revision: detail.revision,
    updatedAt: detail.updatedAt,
    themeId: detail.themeId,
    selectedForNextLaunch: detail.selectedForNextLaunch,
    hasBackground: detail.hasBackground,
    backgroundColor: detail.backgroundColor,
    backgroundScope: detail.backgroundScope,
    backgroundMode: detail.backgroundMode ?? "normal",
    // 只返回配置状态；应用内部资源 URL 和原始图片不跨助手边界。
    reasoningBackgrounds: Object.fromEntries(
      REASONING_EFFORTS.map((effort) => [
        effort,
        {
          hasImage: Boolean(detail.reasoningBackgroundUrls?.[effort]),
          editable: CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS.some(
            (editable) => editable === effort,
          ),
        },
      ]),
    ),
    sidebarOverlayOpacity: detail.sidebarOverlayOpacity,
    appearance: detail.appearance,
    art: detail.art,
    colors: detail.colors,
    homeCards: detail.homeCards.map((card) => ({
      mode: card.mode,
      color: card.color,
      hasImage: Boolean(card.imageDataUrl),
    })),
    styleConfig: {
      ...detail.styleConfig,
      sendIconDataUrl: undefined,
    },
    validation: detail.validation,
  };
}

function assistantErrorCode(code: string): CodexAssistantErrorCode {
  if (code === "NOT_FOUND") return "NOT_FOUND";
  if (code === "STALE_REVISION") return "STALE_REVISION";
  if (code === "OPERATION_BUSY") return "OPERATION_BUSY";
  if (code === "INCOMPLETE_THEME") return "INCOMPLETE_THEME";
  if (code === "READY_THEME_IMMUTABLE") return "READY_THEME_IMMUTABLE";
  if (code === "CANCELLED") return "CANCELLED";
  if (code === "UNSAFE_IMAGE") return "UNSAFE_IMAGE";
  return "UNKNOWN";
}

function assistantErrorMessage(code: CodexAssistantErrorCode): string {
  if (code === "NOT_FOUND") return "没有找到指定主题。";
  if (code === "STALE_REVISION")
    return "主题已在其他位置更新，请重新读取后再修改。";
  if (code === "OPERATION_BUSY")
    return "CodexStyle 正在执行其他操作，请稍后重试。";
  if (code === "INCOMPLETE_THEME") return "主题尚未满足该操作的完整性要求。";
  if (code === "READY_THEME_IMMUTABLE")
    return "已保存主题不能由 Codex 直接覆盖，请先新建派生草稿。";
  if (code === "CANCELLED") return "图片选择已取消，未修改主题。";
  if (code === "UNSAFE_IMAGE")
    return "图片不满足格式、解码或大小限制，未修改主题。";
  return "CodexStyle 无法完成该操作。";
}
