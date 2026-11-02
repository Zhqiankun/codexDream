import type { ReasoningEffort, ThemeDetail } from "../../../contracts";

// 仅收窄工作台入口；底层继续兼容旧主题中无/极低/持续档的图片。
const editableEfforts = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const satisfies readonly ReasoningEffort[];

const effortLabels: Record<ReasoningEffort, string> = {
  none: "无",
  minimal: "极低",
  low: "轻度",
  medium: "中",
  high: "高",
  xhigh: "极高",
  max: "Max",
  ultra: "Ultra",
  persistent: "持续",
};

interface BackgroundControlsProps {
  draft: ThemeDetail;
  disabled: boolean;
  backgroundKey: string;
  previewEffort: ReasoningEffort;
  onDraftChange: (draft: ThemeDetail) => void;
  onPreviewEffortChange: (effort: ReasoningEffort) => void;
  onChooseBackground: (effort?: ReasoningEffort) => void;
  onClearReasoningBackground: (effort: ReasoningEffort) => void;
}

/** 画面面板的受控编辑器：预览由父级持有，选图/清除经父级交给主进程。 */
export function BackgroundControls({
  draft,
  disabled,
  backgroundKey,
  previewEffort,
  onDraftChange,
  onPreviewEffortChange,
  onChooseBackground,
  onClearReasoningBackground,
}: BackgroundControlsProps) {
  const mode = draft.backgroundMode ?? "normal";
  const slotUrl = draft.reasoningBackgroundUrls?.[previewEffort];
  const label = effortLabels[previewEffort];
  const imageStyle = {
    objectPosition: `${draft.art.focusX * 100}% ${draft.art.focusY * 100}%`,
  };
  return (
    <div className="background-controls">
      <div className="field-label segmented-field">
        <span>背景方式</span>
        <div
          className="scope-control background-mode-control"
          role="group"
          aria-label="背景方式"
        >
          {(
            [
              ["normal", "正常背景"],
              ["reasoning", "根据档位更换背景"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              className={mode === value ? "active" : ""}
              aria-pressed={mode === value}
              disabled={disabled}
              onClick={() => onDraftChange({ ...draft, backgroundMode: value })}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {mode === "reasoning" && (
        <p className="field-hint">
          切换 Codex
          的思考强度时自动更换背景。未配置或无法识别档位时，使用正常背景。
          正常背景和所有档位背景合计不超过 32 MiB。
        </p>
      )}
      {mode === "reasoning" && (
        <span className="background-control-label">正常背景 · 备用画面</span>
      )}
      <div className="background-picker compact">
        {draft.backgroundUrl ? (
          <img
            key={backgroundKey}
            src={draft.backgroundUrl}
            alt="主题背景预览"
            style={imageStyle}
          />
        ) : (
          <span className="image-placeholder">未选择背景</span>
        )}
        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => onChooseBackground()}
        >
          {mode === "normal" ? "选择图片" : "选择正常背景"}
        </button>
      </div>
      {mode === "reasoning" && (
        <div className="reasoning-background-control">
          <span className="background-control-label">
            思考强度 · 点击图片上传或更换
          </span>
          <div
            className="reasoning-background-list"
            role="group"
            aria-label="思考强度背景"
          >
            {editableEfforts.map((effort) => {
              const effortUrl = draft.reasoningBackgroundUrls?.[effort];
              const previewUrl = effortUrl ?? draft.backgroundUrl;
              const effortLabel = effortLabels[effort];
              const selected = effort === previewEffort;
              return (
                <div
                  key={effort}
                  className={`reasoning-background-card${selected ? " active" : ""}`}
                >
                  <button
                    type="button"
                    className="reasoning-background-picker"
                    aria-label={`为 ${effortLabel} 选择图片`}
                    disabled={disabled}
                    onClick={() => {
                      onPreviewEffortChange(effort);
                      onChooseBackground(effort);
                    }}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={`${effortLabel}档位背景预览`}
                        style={imageStyle}
                      />
                    ) : (
                      <span
                        className="reasoning-background-placeholder"
                        aria-hidden="true"
                      >
                        +
                      </span>
                    )}
                    <span className="reasoning-background-info">
                      <strong>{effortLabel}</strong>
                      <span>
                        {effortUrl
                          ? "已配置 · 点击更换"
                          : "正常背景 · 点击上传"}
                      </span>
                    </span>
                  </button>
                  <div className="reasoning-background-actions">
                    <button
                      type="button"
                      aria-label={`${effortLabel} 预览`}
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => onPreviewEffortChange(effort)}
                    >
                      {selected ? "预览中" : "预览"}
                    </button>
                    {effortUrl && (
                      <button
                        type="button"
                        aria-label={`${effortLabel} 使用正常背景`}
                        disabled={disabled}
                        onClick={() => onClearReasoningBackground(effort)}
                      >
                        清除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="field-hint" role="status">
            {slotUrl
              ? `正在预览 ${label} 的独立背景。`
              : `${label} 未配置独立图片，正在预览正常背景。`}
            切换预览档位不会修改 Codex 的实际档位。
          </p>
        </div>
      )}
    </div>
  );
}
