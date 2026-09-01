import { useEffect, useRef, useState } from "react";
import {
  parseThemeColor,
  THEME_COLOR_KEYS,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeDetail,
  type ThemeSafeArea,
  type ThemeSendIcon,
  type ThemeShadow,
  type ThemeStyleMode,
  type ThemeTaskMode,
} from "../../../contracts";
import { SendIconGlyph } from "./SendIconGlyph";
import { isStudioThemeColor } from "./theme-color-input";
import {
  applyThemePreset,
  isThemePresetActive,
  THEME_PRESETS,
} from "./theme-presets";

export type StudioTab = "design" | "css" | "theme-json";
export type PreviewColorTarget = keyof ThemeColors;
export type DesignSection = "base" | "canvas" | "colors";

export interface StudioControlLocateRequest {
  requestId: number;
  tab: StudioTab;
  designSection: DesignSection;
  controlId: string;
}

interface StudioControlsProps {
  draft: ThemeDetail;
  busy: boolean;
  cssValid: boolean;
  cssContractValid: boolean;
  backgroundKey: string;
  tab: StudioTab;
  themeJsonSource: string;
  themeJsonDirty: boolean;
  themeJsonError?: string;
  locateRequest?: StudioControlLocateRequest;
  onTabChange: (tab: StudioTab) => void;
  onDraftChange: (draft: ThemeDetail) => void;
  onChooseBackground: () => void;
  onChooseSendIcon: () => void;
  onChooseHomeCardImage: (cardIndex: number) => void;
  onThemeJsonChange: (source: string) => void;
  onApplyThemeJson: () => void;
  onResetThemeJson: () => void;
  onPreviewColorTargetChange: (target?: PreviewColorTarget) => void;
}

interface ColorField {
  key: keyof ThemeColors;
  label: string;
  hint: string;
}

const colorGroups: ReadonlyArray<{
  title: string;
  hint: string;
  fields: ReadonlyArray<ColorField>;
}> = [
  {
    title: "页面与窗口",
    hint: "画布、导航与顶部区域",
    fields: [
      { key: "background", label: "页面背景", hint: "主内容区底色" },
      { key: "panel", label: "左侧面板与弹窗", hint: "导航区和确认浮层" },
      { key: "sidebarText", label: "左侧面板文字", hint: "导航与项目名称" },
      {
        key: "topBarBackground",
        label: "顶部栏背景",
        hint: "菜单栏与会话标题栏",
      },
      {
        key: "topBarText",
        label: "顶部栏文字",
        hint: "菜单、会话标题与操作",
      },
    ],
  },
  {
    title: "对话与输入",
    hint: "消息气泡和编辑区域",
    fields: [
      {
        key: "panelAlt",
        label: "输入框与我的消息",
        hint: "输入框和用户气泡背景",
      },
      {
        key: "composerText",
        label: "输入文字",
        hint: "首页与对话输入框中已经输入的正文",
      },
      {
        key: "userMessageText",
        label: "我的消息文字",
        hint: "发送后的气泡正文",
      },
      {
        key: "assistantPanel",
        label: "助手回复背景",
        hint: "助手消息卡片",
      },
      {
        key: "assistantMessageText",
        label: "助手回复文字",
        hint: "助手消息正文",
      },
      {
        key: "changeCardBackground",
        label: "文件变更背景",
        hint: "改动摘要与文件列表",
      },
      {
        key: "changeCardText",
        label: "文件变更文字",
        hint: "标题、操作与文件路径；增删数字保留状态色",
      },
    ],
  },
  {
    title: "标题与首页",
    hint: "会话标签、欢迎标题与快捷操作",
    fields: [
      {
        key: "threadTabBackground",
        label: "会话标题背景",
        hint: "顶部当前会话标签",
      },
      {
        key: "threadTabText",
        label: "会话标题文字",
        hint: "会话名称、图标与更多操作",
      },
      {
        key: "homeTitleText",
        label: "首页标题文字",
        hint: "“我们应该做些什么”标题",
      },
      {
        key: "homeCardBackground",
        label: "首页快捷卡片背景",
        hint: "探索、构建、审查与修复卡片",
      },
      {
        key: "homeCardText",
        label: "首页快捷卡片文字",
        hint: "快捷操作标题与说明",
      },
    ],
  },
  {
    title: "命令与思考",
    hint: "编辑文件、运行命令与思考状态",
    fields: [
      {
        key: "activityBackground",
        label: "命令与思考背景",
        hint: "活动摘要与折叠状态背景",
      },
      {
        key: "activityText",
        label: "命令与思考文字",
        hint: "编辑、读取、运行与思考动作",
      },
      {
        key: "activityMuted",
        label: "命令与思考次要文字",
        hint: "文件名、命令详情与辅助状态",
      },
    ],
  },
  {
    title: "操作与状态",
    hint: "按钮、焦点与选择反馈",
    fields: [
      {
        key: "accent",
        label: "主要按钮背景",
        hint: "发送、审核与权限状态等主要操作",
      },
      {
        key: "accentText",
        label: "主要按钮文字",
        hint: "发送图标、审核文字等按钮前景内容",
      },
      {
        key: "accentAlt",
        label: "焦点与按钮边框",
        hint: "输入框聚焦状态与主要按钮描边",
      },
      {
        key: "secondary",
        label: "输入框工具栏文字",
        hint: "加号、模型与音频等次要操作",
      },
      { key: "highlight", label: "选中文字背景", hint: "文本选区" },
      { key: "selectionText", label: "选区文字", hint: "文本被选中后的字色" },
    ],
  },
  {
    title: "文字与边界",
    hint: "主要内容和结构线",
    fields: [
      { key: "text", label: "正文文字", hint: "页面主要内容" },
      {
        key: "muted",
        label: "输入占位与说明文字",
        hint: "“随心输入”、时间与其他辅助信息",
      },
      { key: "line", label: "边框与分隔线", hint: "卡片边界和分隔" },
    ],
  },
];

const homeCardLabels = [
  "探索并理解代码",
  "构建新功能、应用或工具",
  "审查代码并提出修改建议",
  "修复问题和失败",
] as const;

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
  cssValid,
  cssContractValid,
  backgroundKey,
  tab,
  themeJsonSource,
  themeJsonDirty,
  themeJsonError,
  locateRequest,
  onTabChange,
  onDraftChange,
  onChooseBackground,
  onChooseSendIcon,
  onChooseHomeCardImage,
  onThemeJsonChange,
  onApplyThemeJson,
  onResetThemeJson,
  onPreviewColorTargetChange,
}: StudioControlsProps) {
  const [designSection, setDesignSection] = useState<DesignSection>("base");
  const controlsRef = useRef<HTMLDivElement>(null);
  const locateFeedbackTimerRef = useRef<number | undefined>(undefined);
  const handledLocateRequestRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      !locateRequest ||
      handledLocateRequestRef.current === locateRequest.requestId
    )
      return;
    if (tab !== locateRequest.tab) {
      onTabChange(locateRequest.tab);
      return;
    }
    if (designSection !== locateRequest.designSection) {
      setDesignSection(locateRequest.designSection);
      return;
    }
    const revealTimer = window.setTimeout(() => {
      const controls = controlsRef.current;
      const target = controls?.querySelector<HTMLElement>(
        `[data-studio-control-id="${locateRequest.controlId}"]`,
      );
      if (!target) return;
      handledLocateRequestRef.current = locateRequest.requestId;
      controls
        ?.querySelector(".studio-control-located")
        ?.classList.remove("studio-control-located");
      target.classList.add("studio-control-located");
      const focusTarget = target.querySelector<HTMLElement>(
        'input:not(.native-color-picker), button:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      focusTarget?.focus({ preventScroll: true });
      target.scrollIntoView?.({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
        block: "center",
        inline: "nearest",
      });
      window.clearTimeout(locateFeedbackTimerRef.current);
      locateFeedbackTimerRef.current = window.setTimeout(
        () => target.classList.remove("studio-control-located"),
        1_200,
      );
    }, 0);
    return () => window.clearTimeout(revealTimer);
  }, [designSection, locateRequest, onTabChange, tab]);
  useEffect(
    () => () => window.clearTimeout(locateFeedbackTimerRef.current),
    [],
  );
  return (
    <div ref={controlsRef} className="form-column panel-card studio-controls">
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
          section={designSection}
          onSectionChange={setDesignSection}
          onDraftChange={onDraftChange}
          onChooseBackground={onChooseBackground}
          onChooseHomeCardImage={onChooseHomeCardImage}
          onPreviewColorTargetChange={onPreviewColorTargetChange}
        />
      )}
      {tab === "css" && (
        <CssPanel
          draft={draft}
          busy={busy}
          cssValid={cssValid}
          cssContractValid={cssContractValid}
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
    </div>
  );
}

function DesignPanel({
  draft,
  busy,
  backgroundKey,
  section,
  onSectionChange,
  onDraftChange,
  onChooseBackground,
  onChooseHomeCardImage,
  onPreviewColorTargetChange,
}: Pick<
  StudioControlsProps,
  | "draft"
  | "busy"
  | "backgroundKey"
  | "onDraftChange"
  | "onChooseBackground"
  | "onChooseHomeCardImage"
  | "onPreviewColorTargetChange"
> & {
  section: DesignSection;
  onSectionChange: (section: DesignSection) => void;
}) {
  const [colorDisplay, setColorDisplay] = useState<"simple" | "advanced">(
    "simple",
  );
  const [hoveredColorTarget, setHoveredColorTarget] =
    useState<PreviewColorTarget>();
  const [focusedColorTarget, setFocusedColorTarget] =
    useState<PreviewColorTarget>();
  useEffect(() => {
    onPreviewColorTargetChange(hoveredColorTarget ?? focusedColorTarget);
  }, [focusedColorTarget, hoveredColorTarget, onPreviewColorTargetChange]);
  useEffect(
    () => () => onPreviewColorTargetChange(undefined),
    [onPreviewColorTargetChange],
  );
  const update = (patch: Partial<ThemeDetail>) =>
    onDraftChange({ ...draft, ...patch });
  const updateThemeColor = (key: keyof ThemeColors, value: string) => {
    const previous = draft.colors[key];
    update({
      colors: { ...draft.colors, [key]: value },
      ...(key === "homeCardBackground"
        ? {
            homeCards: draft.homeCards.map((card) =>
              card.color === previous ? { ...card, color: value } : card,
            ) as typeof draft.homeCards,
          }
        : {}),
    });
  };
  const updateHomeCard = (
    cardIndex: number,
    patch: Partial<ThemeDetail["homeCards"][number]>,
  ) =>
    update({
      homeCards: draft.homeCards.map((card, index) =>
        index === cardIndex ? { ...card, ...patch } : card,
      ) as typeof draft.homeCards,
    });
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
            onClick={() => onSectionChange(value)}
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
                        <i style={{ background: preset.colors.panelAlt }} />
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
                label="左侧栏暗化"
                value={draft.sidebarOverlayOpacity}
                max={100}
                suffix="%"
                ariaLabel="左侧栏暗化强度"
                disabled={draft.backgroundScope !== "window"}
                onChange={(sidebarOverlayOpacity) =>
                  update({ sidebarOverlayOpacity })
                }
              />
              <p className="field-hint">
                {draft.backgroundScope === "window"
                  ? "只调整面板颜色的深浅，不增加不透明度；面板透明度为 0% 时侧栏完全透明。"
                  : "仅内容区不使用侧栏暗化；切换到全窗口后可调整。"}
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
          <StudioSection
            title="主题颜色"
            meta={THEME_COLOR_KEYS.length + " 项 · 均支持透明度"}
          >
            <div className="color-panel-toolbar">
              <div className="color-panel-guidance">
                <p>
                  将鼠标移到设置上，或用键盘聚焦控件，右侧会标出受影响的位置。
                </p>
                <p id="theme-color-format">
                  格式支持 #RGB、#RGBA、#RRGGBB、#RRGGBBAA、rgb(r, g, b) 或
                  rgba(r, g, b, a)。
                </p>
              </div>
              <div
                className="color-display-switch"
                role="group"
                aria-label="颜色字段显示方式"
              >
                <button
                  type="button"
                  className={colorDisplay === "simple" ? "active" : ""}
                  aria-pressed={colorDisplay === "simple"}
                  onClick={() => setColorDisplay("simple")}
                >
                  常用
                </button>
                <button
                  type="button"
                  className={colorDisplay === "advanced" ? "active" : ""}
                  aria-pressed={colorDisplay === "advanced"}
                  onClick={() => setColorDisplay("advanced")}
                >
                  高级
                </button>
              </div>
            </div>
            <div className="color-groups">
              {colorGroups.map((group) => {
                const headingId = `color-group-${group.fields[0].key}`;
                return (
                  <section
                    className="color-group"
                    key={group.title}
                    aria-labelledby={headingId}
                  >
                    <div className="color-group-heading">
                      <h3 id={headingId}>{group.title}</h3>
                      <span>{group.hint}</span>
                    </div>
                    <div className="color-config-grid">
                      {group.fields.map(({ key, label, hint }) => {
                        const opacity = toColorOpacity(draft.colors[key]);
                        const colorValid = isStudioThemeColor(
                          draft.colors[key],
                        );
                        const errorId = `theme-color-${key}-error`;
                        return (
                          <div
                            className={`color-config ${colorValid ? "" : "invalid"}`}
                            key={key}
                            data-color-key={key}
                            data-studio-control-id={`color-${key}`}
                            onMouseEnter={() => setHoveredColorTarget(key)}
                            onMouseLeave={() =>
                              setHoveredColorTarget(undefined)
                            }
                            onFocusCapture={() => setFocusedColorTarget(key)}
                            onBlurCapture={(event) => {
                              const next = event.relatedTarget;
                              if (
                                !(next instanceof Node) ||
                                !event.currentTarget.contains(next)
                              )
                                setFocusedColorTarget(undefined);
                            }}
                          >
                            <span className="color-copy">
                              <strong>{label}</strong>
                              <small>{hint}</small>
                              {colorDisplay === "advanced" && (
                                <code translate="no">{key}</code>
                              )}
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
                                    updateThemeColor(
                                      key,
                                      withColorOpacity(
                                        event.target.value,
                                        opacity,
                                      ),
                                    )
                                  }
                                />
                                <span
                                  className="picker-caret"
                                  aria-hidden="true"
                                >
                                  ◢
                                </span>
                              </span>
                              <input
                                value={draft.colors[key]}
                                aria-label={`${label}颜色`}
                                aria-invalid={!colorValid}
                                aria-describedby={
                                  colorValid
                                    ? "theme-color-format"
                                    : `theme-color-format ${errorId}`
                                }
                                onChange={(event) =>
                                  updateThemeColor(key, event.target.value)
                                }
                              />
                            </span>
                            {!colorValid && (
                              <span
                                className="color-format-error"
                                id={errorId}
                                role="alert"
                              >
                                格式无效，请使用上方列出的十六进制、rgb() 或
                                rgba() 格式。
                              </span>
                            )}
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
                                  updateThemeColor(
                                    key,
                                    withColorOpacity(
                                      draft.colors[key],
                                      Number(event.target.value),
                                    ),
                                  )
                                }
                              />
                              <span className="color-opacity-value">
                                {opacity}%
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <section
              className="home-card-customization"
              aria-labelledby="home-card-customization-heading"
            >
              <div className="color-group-heading">
                <h3 id="home-card-customization-heading">四张快捷卡片</h3>
                <span>每张独立选择纯色或背景图片</span>
              </div>
              <div className="home-card-config-grid">
                {draft.homeCards.map((card, cardIndex) => {
                  const label = homeCardLabels[cardIndex];
                  const opacity = toColorOpacity(card.color);
                  const colorValid = isStudioThemeColor(card.color);
                  const errorId = `home-card-${cardIndex}-color-error`;
                  return (
                    <article
                      className={`home-card-config ${colorValid ? "" : "invalid"}`}
                      key={label}
                      data-studio-control-id={`home-card-${cardIndex}`}
                      onMouseEnter={() =>
                        setHoveredColorTarget("homeCardBackground")
                      }
                      onMouseLeave={() => setHoveredColorTarget(undefined)}
                      onFocusCapture={() =>
                        setFocusedColorTarget("homeCardBackground")
                      }
                      onBlurCapture={(event) => {
                        const next = event.relatedTarget;
                        if (
                          !(next instanceof Node) ||
                          !event.currentTarget.contains(next)
                        )
                          setFocusedColorTarget(undefined);
                      }}
                    >
                      <div
                        className="home-card-config-preview"
                        aria-label={`${label}卡片预览`}
                        style={{
                          backgroundColor: card.color,
                          backgroundImage:
                            card.mode === "image" && card.imageDataUrl
                              ? `url("${card.imageDataUrl}")`
                              : "none",
                          color: draft.colors.homeCardText,
                        }}
                      >
                        <span>{cardIndex + 1}</span>
                        <strong>{label}</strong>
                      </div>
                      <div className="home-card-config-body">
                        <div
                          className="home-card-mode-switch"
                          role="group"
                          aria-label={`${label}背景方式`}
                        >
                          <button
                            type="button"
                            className={card.mode === "color" ? "active" : ""}
                            aria-pressed={card.mode === "color"}
                            onClick={() =>
                              updateHomeCard(cardIndex, { mode: "color" })
                            }
                          >
                            颜色
                          </button>
                          <button
                            type="button"
                            className={card.mode === "image" ? "active" : ""}
                            aria-pressed={card.mode === "image"}
                            onClick={() =>
                              card.imageDataUrl
                                ? updateHomeCard(cardIndex, { mode: "image" })
                                : onChooseHomeCardImage(cardIndex)
                            }
                          >
                            图片
                          </button>
                        </div>
                        {card.mode === "color" ? (
                          <>
                            <span className="home-card-color-row">
                              <span className="color-picker-shell">
                                <span
                                  className="color-swatch"
                                  style={{ background: card.color }}
                                  aria-hidden="true"
                                />
                                <input
                                  className="native-color-picker"
                                  type="color"
                                  value={toPickerHex(card.color)}
                                  aria-label={`选择${label}背景颜色`}
                                  onChange={(event) =>
                                    updateHomeCard(cardIndex, {
                                      color: withColorOpacity(
                                        event.target.value,
                                        opacity,
                                      ),
                                    })
                                  }
                                />
                                <span
                                  className="picker-caret"
                                  aria-hidden="true"
                                >
                                  ◢
                                </span>
                              </span>
                              <input
                                value={card.color}
                                aria-label={`${label}背景颜色`}
                                aria-invalid={!colorValid}
                                aria-describedby={
                                  colorValid
                                    ? "theme-color-format"
                                    : `theme-color-format ${errorId}`
                                }
                                onChange={(event) =>
                                  updateHomeCard(cardIndex, {
                                    color: event.target.value,
                                  })
                                }
                              />
                            </span>
                            {!colorValid && (
                              <span
                                className="color-format-error"
                                id={errorId}
                                role="alert"
                              >
                                卡片颜色格式无效。
                              </span>
                            )}
                            <label className="color-opacity-control">
                              <span>透明度</span>
                              <input
                                className="opacity-range color-opacity-range"
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={opacity}
                                aria-label={`${label}背景透明度`}
                                onChange={(event) =>
                                  updateHomeCard(cardIndex, {
                                    color: withColorOpacity(
                                      card.color,
                                      Number(event.target.value),
                                    ),
                                  })
                                }
                              />
                              <span className="color-opacity-value">
                                {opacity}%
                              </span>
                            </label>
                          </>
                        ) : (
                          <div className="home-card-image-actions">
                            <span>
                              {card.imageDataUrl
                                ? "已保存优化后的卡片图片"
                                : "尚未选择图片"}
                            </span>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => onChooseHomeCardImage(cardIndex)}
                            >
                              {card.imageDataUrl ? "更换图片" : "选择图片"}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="field-hint home-card-image-hint">
                图片会在本机压缩为适合小卡片的 WebP 缩略图，并随主题 ZIP
                一起保存。
              </p>
            </section>
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
  cssContractValid,
  onDraftChange,
  onChooseSendIcon,
}: Pick<
  StudioControlsProps,
  | "draft"
  | "busy"
  | "cssValid"
  | "cssContractValid"
  | "onDraftChange"
  | "onChooseSendIcon"
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
            maxLength={262_144}
            onChange={(event) =>
              onDraftChange({ ...draft, css: event.target.value })
            }
            aria-label="Safe CSS 编辑器"
            aria-invalid={!cssContractValid}
          />
          {!cssValid && (
            <p className="field-error">
              {!cssContractValid
                ? "CSS 不能超过 262,144 个字符或 256 KiB。"
                : draft.validation.warnings.join("、") || "CSS 不符合安全规则"}
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
        meta={`${source.length.toLocaleString()} / 393,216`}
      >
        <p className="field-hint json-guidance">
          高级入口。修改不会直接进入预览；通过主进程完整校验后才会同步到设计配置。
        </p>
        <textarea
          className={`css-editor json-editor ${error ? "invalid" : ""}`}
          spellCheck={false}
          value={source}
          maxLength={393_216}
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
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`field-label range-field ${disabled ? "disabled" : ""}`}>
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
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
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
