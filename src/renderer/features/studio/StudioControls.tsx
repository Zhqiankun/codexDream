import { useState } from "react";
import type {
  ThemeAppearance,
  ThemeColors,
  ThemeDetail,
  ThemeSafeArea,
  ThemeSendIcon,
  ThemeShadow,
  ThemeStyleMode,
  ThemeTaskMode,
} from "../../../contracts";
import { SendIconGlyph } from "./SendIconGlyph";
import {
  applyThemePreset,
  isThemePresetActive,
  THEME_PRESETS,
} from "./theme-presets";

export type StudioTab = "design" | "css" | "theme-json";

interface StudioControlsProps {
  draft: ThemeDetail;
  busy: boolean;
  changed: boolean;
  cssValid: boolean;
  backgroundKey: string;
  tab: StudioTab;
  themeJsonSource: string;
  themeJsonDirty: boolean;
  themeJsonError?: string;
  onTabChange: (tab: StudioTab) => void;
  onDraftChange: (draft: ThemeDetail) => void;
  onChooseBackground: () => void;
  onChooseSendIcon: () => void;
  onApplyDraft: () => void;
  onThemeJsonChange: (source: string) => void;
  onApplyThemeJson: () => void;
  onResetThemeJson: () => void;
}

const colorFields: ReadonlyArray<{
  key: keyof ThemeColors;
  label: string;
  hint: string;
}> = [
  { key: "background", label: "背景", hint: "主内容底色" },
  { key: "panel", label: "面板", hint: "侧栏与浮层" },
  { key: "sidebarText", label: "侧栏文字", hint: "左侧导航与项目文字" },
  { key: "panelAlt", label: "次级面板", hint: "用户气泡与输入框" },
  {
    key: "assistantPanel",
    label: "助手面板",
    hint: "助手回复卡片背景",
  },
  { key: "accent", label: "强调", hint: "主要操作" },
  { key: "accentAlt", label: "次强调", hint: "悬停与焦点" },
  { key: "secondary", label: "辅助", hint: "弱操作" },
  { key: "highlight", label: "高亮", hint: "选中内容" },
  { key: "text", label: "正文", hint: "主要文字" },
  { key: "muted", label: "弱文字", hint: "说明文字" },
  { key: "line", label: "描边", hint: "边界与分隔" },
];

const recipeFields = [
  { key: "sidebar", label: "侧栏表面", hint: "对话列表与导航区" },
  { key: "composer", label: "输入框", hint: "聚焦边框与磨砂表面" },
  {
    key: "message",
    label: "对话消息",
    hint: "用户气泡与助手卡片；助手内边距自动对齐",
  },
  { key: "dialog", label: "对话框", hint: "提示与确认浮层" },
] as const;

const sendIconOptions = [
  ["native", "原生箭头"],
  ["paper-plane", "纸飞机"],
  ["spark", "星芒"],
  ["rocket", "火箭"],
] as const satisfies ReadonlyArray<readonly [ThemeSendIcon, string]>;

export function StudioControls({
  draft,
  busy,
  changed,
  cssValid,
  backgroundKey,
  tab,
  themeJsonSource,
  themeJsonDirty,
  themeJsonError,
  onTabChange,
  onDraftChange,
  onChooseBackground,
  onChooseSendIcon,
  onApplyDraft,
  onThemeJsonChange,
  onApplyThemeJson,
  onResetThemeJson,
}: StudioControlsProps) {
  return (
    <div className="form-column panel-card studio-controls">
      <div className="studio-tabs" role="tablist" aria-label="主题编辑模式">
        {(
          [
            ["design", "设计"],
            ["css", "组件样式"],
            ["theme-json", "高级配置"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            onClick={() => onTabChange(value)}
          >
            {label}
            {value === "theme-json" && themeJsonDirty && (
              <span className="tab-dirty" aria-label="有未应用的 JSON 修改" />
            )}
          </button>
        ))}
      </div>

      {tab === "design" && (
        <DesignPanel
          draft={draft}
          busy={busy}
          backgroundKey={backgroundKey}
          onDraftChange={onDraftChange}
          onChooseBackground={onChooseBackground}
        />
      )}
      {tab === "css" && (
        <CssPanel
          draft={draft}
          busy={busy}
          cssValid={cssValid}
          onDraftChange={onDraftChange}
          onChooseSendIcon={onChooseSendIcon}
        />
      )}
      {tab === "theme-json" && (
        <ThemeJsonPanel
          source={themeJsonSource}
          dirty={themeJsonDirty}
          error={themeJsonError}
          busy={busy}
          onChange={onThemeJsonChange}
          onApply={onApplyThemeJson}
          onReset={onResetThemeJson}
        />
      )}

      {tab !== "theme-json" && (
        <button
          className="text-button studio-apply-draft"
          disabled={busy || !changed || themeJsonDirty}
          onClick={onApplyDraft}
        >
          应用草稿
        </button>
      )}
    </div>
  );
}

function DesignPanel({
  draft,
  busy,
  backgroundKey,
  onDraftChange,
  onChooseBackground,
}: Pick<
  StudioControlsProps,
  "draft" | "busy" | "backgroundKey" | "onDraftChange" | "onChooseBackground"
>) {
  const [section, setSection] = useState<"base" | "canvas" | "colors">("base");
  const update = (patch: Partial<ThemeDetail>) =>
    onDraftChange({ ...draft, ...patch });
  return (
    <div className="design-mode" role="tabpanel">
      <div className="design-subtabs" role="tablist" aria-label="设计配置分类">
        {(
          [
            ["base", "基础"],
            ["canvas", "画面"],
            ["colors", "颜色"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={section === value}
            className={section === value ? "active" : ""}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="studio-panel-body design-panel-body">
        {section === "base" && (
          <>
            <StudioSection title="主题信息" meta={`版本 ${draft.revision}`}>
              <div className="theme-identity-grid">
                <label className="field-label">
                  名称
                  <input
                    value={draft.name}
                    maxLength={80}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </label>
                <label className="field-label">
                  主题 ID
                  <input
                    value={draft.themeId}
                    maxLength={80}
                    onChange={(event) =>
                      update({ themeId: event.target.value })
                    }
                  />
                </label>
                <label className="field-label theme-identity-description">
                  描述
                  <textarea
                    value={draft.description}
                    rows={2}
                    maxLength={2000}
                    onChange={(event) =>
                      update({ description: event.target.value })
                    }
                  />
                </label>
              </div>
            </StudioSection>

            <StudioSection title="主题预设" meta="一键套用">
              <div className="theme-preset-grid" aria-label="内置主题预设">
                {THEME_PRESETS.map((preset) => {
                  const active = isThemePresetActive(draft, preset);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`theme-preset-card ${active ? "active" : ""}`}
                      aria-label={`应用${preset.name}预设`}
                      aria-pressed={active}
                      disabled={busy}
                      onClick={() =>
                        onDraftChange(applyThemePreset(draft, preset))
                      }
                    >
                      <span className="theme-preset-palette" aria-hidden="true">
                        <i style={{ background: preset.colors.background }} />
                        <i style={{ background: preset.colors.panel }} />
                        <i style={{ background: preset.colors.accent }} />
                        <i style={{ background: preset.colors.text }} />
                      </span>
                      <span className="theme-preset-copy">
                        <strong>{preset.name}</strong>
                        <small>{preset.description}</small>
                      </span>
                      <span className="theme-preset-check" aria-hidden="true">
                        {active ? "✓" : "↗"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="field-hint preset-guidance">
                预设只替换外观、颜色与表面效果；名称、背景图片、范围和焦点保持不变。
              </p>
            </StudioSection>
          </>
        )}

        {section === "canvas" && (
          <>
            <StudioSection title="背景画面" meta="本地图片">
              <div className="background-picker compact">
                {draft.backgroundUrl ? (
                  <img
                    key={backgroundKey}
                    src={draft.backgroundUrl}
                    alt="主题背景预览"
                    style={{
                      objectPosition: `${draft.art.focusX * 100}% ${draft.art.focusY * 100}%`,
                    }}
                  />
                ) : (
                  <span className="image-placeholder">未选择背景</span>
                )}
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={onChooseBackground}
                >
                  选择图片
                </button>
              </div>
              <div
                className="image-requirements"
                role="note"
                aria-label="背景图片要求"
              >
                <span className="image-requirements-icon" aria-hidden="true">
                  i
                </span>
                <span>
                  <strong>推荐 1920 × 1080（16:9）</strong>
                  <small>
                    PNG / JPG / WebP · ≤ 10 MiB · 单边 ≤ 16,384 px · 总像素 ≤
                    5,000 万 · 仅静态单帧
                  </small>
                </span>
              </div>
              <SegmentedControl
                label="背景范围"
                value={draft.backgroundScope}
                options={[
                  ["content", "仅内容区"],
                  ["window", "全窗口"],
                ]}
                onChange={(backgroundScope) => update({ backgroundScope })}
              />
              <RangeField
                label="左侧栏遮罩"
                value={draft.sidebarOverlayOpacity}
                max={100}
                suffix="%"
                ariaLabel="左侧栏遮罩不透明度"
                onChange={(sidebarOverlayOpacity) =>
                  update({ sidebarOverlayOpacity })
                }
              />
              <p className="field-hint">
                全窗口时遮罩覆盖左侧对话区；数值越低，背景越清晰。
              </p>
            </StudioSection>

            <StudioSection title="外观与焦点" meta="实时预览">
              <SegmentedControl<ThemeAppearance>
                label="默认外观"
                value={draft.appearance}
                options={[
                  ["auto", "自动"],
                  ["light", "浅色"],
                  ["dark", "深色"],
                ]}
                onChange={(appearance) => update({ appearance })}
              />
              <RangeField
                label="水平焦点"
                value={Math.round(draft.art.focusX * 100)}
                max={100}
                suffix="%"
                ariaLabel="背景水平焦点"
                onChange={(value) =>
                  update({ art: { ...draft.art, focusX: value / 100 } })
                }
              />
              <RangeField
                label="垂直焦点"
                value={Math.round(draft.art.focusY * 100)}
                max={100}
                suffix="%"
                ariaLabel="背景垂直焦点"
                onChange={(value) =>
                  update({ art: { ...draft.art, focusY: value / 100 } })
                }
              />
              <SegmentedControl<ThemeSafeArea>
                label="画面安全区"
                value={draft.art.safeArea}
                options={[
                  ["none", "无"],
                  ["left", "留左"],
                  ["right", "留右"],
                ]}
                onChange={(safeArea) =>
                  update({ art: { ...draft.art, safeArea } })
                }
              />
              <SegmentedControl<ThemeTaskMode>
                label="任务画面"
                value={draft.art.taskMode}
                options={[
                  ["ambient", "柔和"],
                  ["full", "完整"],
                  ["off", "关闭"],
                ]}
                onChange={(taskMode) =>
                  update({ art: { ...draft.art, taskMode } })
                }
              />
            </StudioSection>
          </>
        )}

        {section === "colors" && (
          <StudioSection title="主题颜色" meta="12 个变量 · 均支持透明度">
            <div className="color-config-grid">
              {colorFields.map(({ key, label, hint }) => {
                const opacity = toColorOpacity(draft.colors[key]);
                return (
                  <div className="color-config" key={key}>
                    <span className="color-copy">
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </span>
                    <span className="color-value">
                      <span className="color-picker-shell">
                        <span
                          className="color-swatch"
                          style={{ background: draft.colors[key] }}
                          aria-hidden="true"
                        />
                        <input
                          className="native-color-picker"
                          type="color"
                          value={toPickerHex(draft.colors[key])}
                          aria-label={`选择${label}颜色`}
                          title={`打开${label}颜色选择器`}
                          onChange={(event) =>
                            update({
                              colors: {
                                ...draft.colors,
                                [key]: withColorOpacity(
                                  event.target.value,
                                  opacity,
                                ),
                              },
                            })
                          }
                        />
                        <span className="picker-caret" aria-hidden="true">
                          ◢
                        </span>
                      </span>
                      <input
                        value={draft.colors[key]}
                        aria-label={`${label}颜色`}
                        onChange={(event) =>
                          update({
                            colors: {
                              ...draft.colors,
                              [key]: event.target.value,
                            },
                          })
                        }
                      />
                    </span>
                    <label className="color-opacity-control">
                      <span>透明度</span>
                      <input
                        className="opacity-range color-opacity-range"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={opacity}
                        aria-label={`${label}透明度`}
                        onChange={(event) =>
                          update({
                            colors: {
                              ...draft.colors,
                              [key]: withColorOpacity(
                                draft.colors[key],
                                Number(event.target.value),
                              ),
                            },
                          })
                        }
                      />
                      <span className="color-opacity-value">{opacity}%</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </StudioSection>
        )}
      </div>
    </div>
  );
}

function CssPanel({
  draft,
  busy,
  cssValid,
  onDraftChange,
  onChooseSendIcon,
}: Pick<
  StudioControlsProps,
  "draft" | "busy" | "cssValid" | "onDraftChange" | "onChooseSendIcon"
>) {
  const updateMode = (mode: ThemeStyleMode) =>
    onDraftChange({
      ...draft,
      styleConfig: { ...draft.styleConfig, mode },
    });
  const updateStyle = (
    patch: Partial<Omit<ThemeDetail["styleConfig"], "recipes">>,
  ) =>
    onDraftChange({
      ...draft,
      styleConfig: { ...draft.styleConfig, ...patch },
    });
  return (
    <div className="studio-panel-body" role="tabpanel">
      <StudioSection title="样式方式" meta="安全样式">
        <SegmentedControl<ThemeStyleMode>
          label="编辑方式"
          value={draft.styleConfig.mode}
          options={[
            ["configured", "配置生成"],
            ["advanced", "高级源码"],
          ]}
          onChange={updateMode}
        />
        <p className="field-hint">
          配置生成由主进程输出并校验安全样式；日常使用无需修改代码。
        </p>
      </StudioSection>

      {draft.styleConfig.mode === "configured" ? (
        <>
          <StudioSection title="组件配方" meta="按需启用">
            <div className="recipe-grid">
              {recipeFields.map(({ key, label, hint }) => (
                <label className="recipe-toggle" key={key}>
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.styleConfig.recipes[key]}
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        styleConfig: {
                          ...draft.styleConfig,
                          recipes: {
                            ...draft.styleConfig.recipes,
                            [key]: event.target.checked,
                          },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </StudioSection>
          <StudioSection title="发送按钮" meta="内置 + 自定义">
            <div className="send-icon-grid" aria-label="发送按钮图标">
              {sendIconOptions.map(([icon, label]) => {
                const active = draft.styleConfig.sendIcon === icon;
                return (
                  <button
                    key={icon}
                    type="button"
                    className={"send-icon-option " + (active ? "active" : "")}
                    aria-label={"使用" + label + "发送图标"}
                    aria-pressed={active}
                    onClick={() => updateStyle({ sendIcon: icon })}
                  >
                    <span className="send-icon-preview">
                      <SendIconGlyph icon={icon} />
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className={
                  "send-icon-option " +
                  (draft.styleConfig.sendIcon === "custom" ? "active" : "")
                }
                aria-label="使用自定义发送图标"
                aria-pressed={draft.styleConfig.sendIcon === "custom"}
                disabled={!draft.styleConfig.sendIconDataUrl}
                onClick={() => updateStyle({ sendIcon: "custom" })}
              >
                <span className="send-icon-preview">
                  <SendIconGlyph
                    icon="custom"
                    dataUrl={draft.styleConfig.sendIconDataUrl}
                  />
                </span>
                <span>自定义</span>
              </button>
            </div>
            <div className="send-icon-upload">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={onChooseSendIcon}
              >
                上传透明 PNG
              </button>
              <p className="field-hint">
                推荐 64 × 64 或 128 × 128；上传后统一处理为 64 × 64
                透明图标。仅替换发送状态，生成中的停止按钮保持原样。
              </p>
            </div>
          </StudioSection>
          <StudioSection title="表面参数" meta="受限范围">
            <RangeField
              label="磨砂模糊"
              value={draft.styleConfig.blur}
              max={30}
              suffix="px"
              ariaLabel="磨砂模糊"
              onChange={(blur) => updateStyle({ blur })}
            />
            <RangeField
              label="圆角"
              value={draft.styleConfig.radius}
              max={28}
              suffix="px"
              ariaLabel="表面圆角"
              onChange={(radius) => updateStyle({ radius })}
            />
            <RangeField
              label="边框"
              value={draft.styleConfig.borderWidth}
              max={4}
              suffix="px"
              ariaLabel="表面边框"
              onChange={(borderWidth) => updateStyle({ borderWidth })}
            />
            <SegmentedControl<ThemeShadow>
              label="阴影"
              value={draft.styleConfig.shadow}
              options={[
                ["none", "无"],
                ["soft", "柔和"],
                ["strong", "强调"],
              ]}
              onChange={(shadow) => updateStyle({ shadow })}
            />
          </StudioSection>
          <div className="generated-css-note">
            <span className={`status-light ${cssValid ? "good" : "bad"}`} />
            {cssValid
              ? "保存时自动生成并验证 theme.css"
              : "有颜色值不符合安全格式，请先修正"}
          </div>
        </>
      ) : (
        <StudioSection
          title="高级安全样式"
          meta={`${draft.css.length.toLocaleString()} / 262,144`}
        >
          <textarea
            className={`css-editor ${cssValid ? "" : "invalid"}`}
            spellCheck={false}
            value={draft.css}
            onChange={(event) =>
              onDraftChange({ ...draft, css: event.target.value })
            }
            aria-label="Safe CSS 编辑器"
          />
          {!cssValid && (
            <p className="field-error">
              {draft.validation.warnings.join("、") || "CSS 不符合安全规则"}
            </p>
          )}
        </StudioSection>
      )}
    </div>
  );
}

function ThemeJsonPanel({
  source,
  dirty,
  error,
  busy,
  onChange,
  onApply,
  onReset,
}: {
  source: string;
  dirty: boolean;
  error?: string;
  busy: boolean;
  onChange: (source: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="studio-panel-body" role="tabpanel">
      <StudioSection
        title="主题配置 JSON"
        meta={`${source.length.toLocaleString()} / 65,536`}
      >
        <p className="field-hint json-guidance">
          高级入口。修改不会直接进入预览；通过主进程完整校验后才会同步到设计配置。
        </p>
        <textarea
          className={`css-editor json-editor ${error ? "invalid" : ""}`}
          spellCheck={false}
          value={source}
          maxLength={65_536}
          onChange={(event) => onChange(event.target.value)}
          aria-label="theme.json 编辑器"
        />
        {error && <p className="field-error">{error}</p>}
        <div className="json-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !dirty}
            onClick={onReset}
          >
            恢复当前配置
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !dirty}
            onClick={onApply}
          >
            校验并应用
          </button>
        </div>
      </StudioSection>
    </div>
  );
}

function StudioSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="studio-section">
      <div className="section-title">
        <span>{title}</span>
        {meta && <span className="revision">{meta}</span>}
      </div>
      <div className="studio-section-content">{children}</div>
    </section>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field-label segmented-field">
      <span>{label}</span>
      <div className="scope-control" role="group" aria-label={label}>
        {options.map(([option, copy]) => (
          <button
            key={option}
            type="button"
            className={value === option ? "active" : ""}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {copy}
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  max,
  suffix,
  ariaLabel,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-label range-field">
      <span className="range-heading">
        <span>{label}</span>
        <span className="opacity-value">
          {value}
          {suffix}
        </span>
      </span>
      <input
        className="opacity-range"
        type="range"
        min="0"
        max={max}
        step="1"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface ParsedThemeColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function toPickerHex(value: string): string {
  const color = parseThemeColor(value);
  if (!color) return "#000000";
  return `#${[color.red, color.green, color.blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function toColorOpacity(value: string): number {
  return Math.round((parseThemeColor(value)?.alpha ?? 1) * 100);
}

function withColorOpacity(value: string, opacity: number): string {
  const color = parseThemeColor(value) ?? {
    red: 0,
    green: 0,
    blue: 0,
    alpha: 1,
  };
  const boundedOpacity = Math.min(100, Math.max(0, Math.round(opacity)));
  const hex = toPickerHex(`rgb(${color.red}, ${color.green}, ${color.blue})`);
  if (boundedOpacity === 100) return hex;
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${boundedOpacity / 100})`;
}

function parseThemeColor(value: string): ParsedThemeColor | undefined {
  const hex = value.match(/^#([0-9a-f]{3,8})$/iu)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const expanded =
      hex.length <= 4
        ? hex
            .split("")
            .map((character) => character.repeat(2))
            .join("")
        : hex;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha:
        expanded.length === 8
          ? Number.parseInt(expanded.slice(6, 8), 16) / 255
          : 1,
    };
  }
  const rgb = value.match(
    /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*(0|1|1\.0|0?\.[0-9]{1,6}))?\s*\)$/iu,
  );
  if (!rgb) return undefined;
  return {
    red: Math.min(255, Number(rgb[1])),
    green: Math.min(255, Number(rgb[2])),
    blue: Math.min(255, Number(rgb[3])),
    alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
  };
}
