import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  type ImportResult,
  type Result,
  type SessionState,
  type ThemeDetail,
  type ThemeSnapshot,
} from "../../contracts";
import { bridge } from "../api/bridge";
import {
  StudioControls,
  type StudioTab,
} from "../features/studio/StudioControls";

const SIDEBAR_OVERLAY_RGB = "15 23 42";
const PREVIEW_COLOR_PATTERN =
  /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|#[0-9a-fA-F]{3,4}|rgb\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*\)|rgba\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*(?:0|1|1\.0|0?\.[0-9]{1,6})\s*\))$/u;

type View = "library" | "session";
type PreviewPage = "home" | "conversation";

const sessionLabels: Record<SessionState, string> = {
  NO_SESSION: "未启动",
  EXTERNAL_BLOCKED: "外部会话阻断",
  LAUNCHING: "启动中",
  VERIFYING_CDP: "验证中",
  INJECTING: "注入中",
  THEMED_SESSION: "主题会话",
  PAUSED_FUTURE: "已暂停后续注入",
  INCOMPATIBLE: "不兼容",
  ORPHANED: "孤儿会话",
};

function unwrap<T>(
  result: Result<T>,
  onError: (message: string) => void,
): T | undefined {
  if (result.ok) return result.data;
  if (result.error.code !== "CANCELLED")
    onError(messageForError(result.error.messageKey));
  return undefined;
}

const errorMessages: Record<string, string> = {
  "update.unconfigured": "更新尚未配置，当前不可用。",
  "ipc.busy": "另一项操作正在进行，请稍后再试。",
  "ipc.invalid": "请求内容无效，请重试。",
  "ipc.unauthorized": "当前页面无权执行此操作。",
  "session.externalRunning": "外部 Codex 正在运行，请自行关闭后再试。",
  "session.storePackageNotFound": "未找到受支持的 Microsoft Store Codex。",
  "session.cdpUnavailable": "当前 Codex 未开放可验证的本地调试端点。",
  "session.identityMismatch": "Codex 会话身份验证失败，未执行注入。",
  "session.targetIncompatible": "当前 Codex 页面与安全选择器不兼容。",
  "session.injectionFailed": "主题注入失败，Codex 保持原样。",
  "session.cleanupFailed": "无法安全结束已拥有会话。",
  "session.paused": "后续注入已暂停，请先恢复。",
  "session.themeNotReady": "请先保存并选择一个完整主题。",
  "session.themeUnsafe": "所选主题未通过安全校验。",
  "store.tampered": "本地受管存储校验失败，操作已安全停止。",
  "theme.notFound": "主题不存在或已被移除。",
  "theme.staleRevision": "主题已发生变化，请刷新后重试。",
  "theme.imageMissing": "请先为主题选择有效背景图。",
  "theme.formalExportUnavailable": "此主题已编辑，无法原样导出正式包。",
  "import.transactionNotFound": "导入事务已失效，请重新选择 ZIP。",
  "import.replaceArguments": "替换参数无效，请重新导入。",
  "window.unavailable": "Studio 窗口当前不可用。",
  "error.unsafe_archive": "ZIP 未通过安全或格式校验。",
  "error.unsafe_css": "CSS 未通过 Safe CSS 校验。",
  "error.unsafe_image": "图片未通过大小、格式或解码校验。",
  "error.incomplete_theme": "主题内容不完整，请补齐后再试。",
  "error.stale_revision": "主题已发生变化，请刷新后重试。",
  "error.theme_id_conflict": "主题 ID 与现有主题冲突。",
  "error.store_tampered": "本地受管存储校验失败，操作已安全停止。",
  "error.unknown": "操作未完成，请重试。",
};

function messageForError(messageKey: string): string {
  return errorMessages[messageKey] ?? "操作未完成，请重试。";
}

function messageForImport(result: ImportResult): string {
  if (result.status === "duplicate") return "相同内容已存在，未重复导入。";
  const warnings = [
    result.nameCollision ? "名称与现有主题重复，已作为独立主题保存。" : "",
    result.signatureIgnored ? "包内签名尚未验证。" : "",
  ].filter(Boolean);
  return warnings.length ? `导入完成。${warnings.join(" ")}` : "主题导入完成。";
}

export function App() {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot | undefined>();
  const [selected, setSelected] = useState<ThemeDetail | undefined>();
  const [view, setView] = useState<View>("library");
  const [notice, setNotice] = useState<string>("");
  const [pendingImport, setPendingImport] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);
  const selectedLibraryIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    selectedLibraryIdRef.current = selected?.libraryId;
  }, [selected?.libraryId]);

  const adoptSelectedDetail = (detail: ThemeDetail) => {
    selectedLibraryIdRef.current = detail.libraryId;
    setSelected((current) => {
      if (
        current?.libraryId === detail.libraryId &&
        current.revision > detail.revision
      )
        return current;
      return detail;
    });
  };

  const report = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  };

  const refresh = async (libraryId?: string) => {
    const next = unwrap(await bridge.getSnapshot(), report);
    if (!next) return;
    setSnapshot(next);
    const id =
      libraryId ?? selectedLibraryIdRef.current ?? next.themes[0]?.libraryId;
    if (id) {
      const detail = unwrap(await bridge.getTheme({ libraryId: id }), report);
      if (detail) adoptSelectedDetail(detail);
    } else {
      selectedLibraryIdRef.current = undefined;
      setSelected(undefined);
    }
  };

  useEffect(() => {
    void refresh();
    return bridge.onStateChanged((next) => {
      setSnapshot(next);
      const libraryId = selectedLibraryIdRef.current;
      if (libraryId)
        void bridge.getTheme({ libraryId }).then((result) => {
          if (result.ok) {
            adoptSelectedDetail(result.data);
          }
        });
    });
  }, []);

  const run = async <T,>(
    operation: () => Promise<Result<T>>,
    onSuccess?: (data: T) => void,
  ): Promise<T | undefined> => {
    setBusy(true);
    try {
      const result = await operation();
      const data = unwrap(result, report);
      if (data !== undefined) {
        onSuccess?.(data);
        await refresh(selectedLibraryIdRef.current);
      }
      return data;
    } catch {
      report("error.unknown");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const selectedSummary = snapshot?.themes.find(
    (theme) => theme.libraryId === selected?.libraryId,
  );
  const readyCount =
    snapshot?.themes.filter((theme) => theme.status === "ready").length ?? 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          C
        </div>
        <div className="brand-copy">
          <strong>CodexStyle</strong>
          <span>离线 Studio</span>
        </div>
        <div className="topbar-spacer" />
        <div
          className={`session-pill state-${snapshot?.session.state ?? "NO_SESSION"}`}
        >
          <span className="status-dot" />
          {sessionLabels[snapshot?.session.state ?? "NO_SESSION"]}
        </div>
        <button
          className="icon-button"
          title="检查更新"
          aria-label="检查更新"
          onClick={() => void run(() => bridge.requestUpdate())}
        >
          ↻
        </button>
        <button className="avatar-button" title="CodexStyle">
          CS
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span>主题库</span>
            <span className="count-badge">{snapshot?.themes.length ?? 0}</span>
          </div>
          <div className="sidebar-actions">
            <button
              className="primary-button full"
              disabled={busy}
              onClick={() =>
                void run(
                  () => bridge.createDraft({ name: "新主题" }),
                  (detail) => {
                    selectedLibraryIdRef.current = detail.libraryId;
                    setSelected(detail);
                    setView("library");
                  },
                )
              }
            >
              ＋ 新建主题
            </button>
            <button
              className="secondary-button full"
              disabled={busy}
              onClick={() =>
                void run(
                  () => bridge.importZip(),
                  (result) => {
                    setPendingImport(
                      result.status === "conflict" ? result : undefined,
                    );
                    if (result.status !== "conflict")
                      report(messageForImport(result));
                  },
                )
              }
            >
              导入 ZIP
            </button>
          </div>
          <div className="theme-list">
            {snapshot?.themes.map((theme) => (
              <button
                key={theme.libraryId}
                className={`theme-row ${selected?.libraryId === theme.libraryId ? "active" : ""}`}
                onClick={() => void refresh(theme.libraryId)}
              >
                <span
                  className="theme-swatch"
                  style={{ background: theme.accent }}
                />
                <span className="theme-row-copy">
                  <strong>{theme.name}</strong>
                  <small>
                    {theme.status === "ready" ? "已保存" : "草稿"} ·{" "}
                    {theme.packageFormat === "formal" ? "正式包" : "兼容包"}
                  </small>
                </span>
                {theme.selectedForNextLaunch && (
                  <span className="check-mark">✓</span>
                )}
              </button>
            ))}
          </div>
          <div className="sidebar-footer">
            <div className="library-stat">
              <span>可用主题</span>
              <strong>{readyCount}</strong>
            </div>
            <div className="library-stat">
              <span>本地模式</span>
              <strong className="online-dot">●</strong>
            </div>
          </div>
        </aside>

        <main className="main-panel">
          <nav className="view-tabs" aria-label="工作区" role="tablist">
            <button
              className={view === "library" ? "tab active" : "tab"}
              aria-selected={view === "library"}
              role="tab"
              onClick={() => setView("library")}
            >
              Studio
            </button>
            <button
              className={view === "session" ? "tab active" : "tab"}
              aria-selected={view === "session"}
              role="tab"
              onClick={() => setView("session")}
            >
              Codex 会话
            </button>
          </nav>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {pendingImport?.status === "conflict" && (
            <ImportConflict
              conflict={pendingImport}
              busy={busy}
              run={run}
              report={report}
              onResolved={() => setPendingImport(undefined)}
            />
          )}
          {view === "library" && selected && (
            <StudioView
              detail={selected}
              summary={selectedSummary}
              busy={busy}
              report={report}
              run={run}
              onDetailChanged={adoptSelectedDetail}
            />
          )}
          {view === "library" && !selected && (
            <EmptyState
              onCreate={() =>
                void run(() => bridge.createDraft({ name: "新主题" }))
              }
            />
          )}
          {view === "session" && (
            <SessionView
              snapshot={snapshot}
              busy={busy}
              run={run}
              onOpenStudio={() => setView("library")}
            />
          )}
        </main>
      </div>
    </div>
  );
}

interface StudioProps {
  detail: ThemeDetail;
  summary?: ThemeSnapshot["themes"][number];
  busy: boolean;
  report: (message: string) => void;
  onDetailChanged: (detail: ThemeDetail) => void;
  run: <T>(
    operation: () => Promise<Result<T>>,
    onSuccess?: (data: T) => void,
  ) => Promise<T | undefined>;
}

const themeCopyKeys = [
  "brandSubtitle",
  "tagline",
  "projectPrefix",
  "projectLabel",
  "statusText",
  "quote",
  "promoTitle",
  "promoSub",
  "promoUrl",
] as const;

function serializeThemeJson(detail: ThemeDetail): string {
  const source: Record<string, unknown> = {
    schemaVersion: 1,
    id: detail.themeId,
    name: detail.name,
    description: detail.description,
    image:
      typeof detail.json.image === "string"
        ? detail.json.image
        : "background.png",
    appearance: detail.appearance,
    art: { ...detail.art },
    colors: { ...detail.colors },
    style: {
      ...detail.styleConfig,
      recipes: { ...detail.styleConfig.recipes },
    },
    backgroundScope: detail.backgroundScope,
    sidebarOverlayOpacity: detail.sidebarOverlayOpacity,
    accent: detail.colors.accent,
  };
  for (const key of themeCopyKeys) {
    if (detail.json[key] !== undefined) source[key] = detail.json[key];
  }
  return JSON.stringify(source, null, 2);
}

function StudioView({
  detail,
  summary,
  busy,
  report,
  run,
  onDetailChanged,
}: StudioProps) {
  const [draft, setDraft] = useState(detail);
  const [studioTab, setStudioTab] = useState<StudioTab>("design");
  const [previewPage, setPreviewPage] = useState<PreviewPage>("conversation");
  const [themeJsonSource, setThemeJsonSource] = useState(() =>
    serializeThemeJson(detail),
  );
  const [themeJsonDirty, setThemeJsonDirty] = useState(false);
  const [themeJsonError, setThemeJsonError] = useState<string>();
  const previewStyleRef = useRef<HTMLStyleElement>(null);
  useEffect(() => {
    setDraft(detail);
    setThemeJsonSource(serializeThemeJson(detail));
    setThemeJsonDirty(false);
    setThemeJsonError(undefined);
  }, [detail.libraryId, detail.revision]);
  useEffect(() => {
    if (!themeJsonDirty) setThemeJsonSource(serializeThemeJson(draft));
  }, [draft, themeJsonDirty]);
  const cssChanged =
    draft.styleConfig.mode === "advanced" && draft.css !== detail.css;
  const colorsValid = Object.values(draft.colors).every((value) =>
    PREVIEW_COLOR_PATTERN.test(value),
  );
  // The main process is the source of truth for CSS validation; unsaved text
  // must never be injected into the preview.
  const cssValid =
    (draft.styleConfig.mode === "configured" && colorsValid) ||
    (!cssChanged && draft.validation.css === "valid");
  useEffect(() => {
    if (previewStyleRef.current)
      previewStyleRef.current.textContent =
        draft.styleConfig.mode === "advanced" && cssValid ? draft.css : "";
  }, [cssValid, draft.css, draft.styleConfig.mode]);
  const structuredChanged =
    draft.appearance !== detail.appearance ||
    JSON.stringify(draft.art) !== JSON.stringify(detail.art) ||
    JSON.stringify(draft.colors) !== JSON.stringify(detail.colors) ||
    JSON.stringify(draft.styleConfig) !== JSON.stringify(detail.styleConfig);
  const changed =
    draft.name !== detail.name ||
    draft.description !== detail.description ||
    cssChanged ||
    draft.themeId !== detail.themeId ||
    draft.backgroundScope !== detail.backgroundScope ||
    draft.sidebarOverlayOpacity !== detail.sidebarOverlayOpacity ||
    structuredChanged;
  const selectedForNextLaunch = Boolean(summary?.selectedForNextLaunch);
  const canSelectForNextLaunch =
    detail.status === "ready" &&
    !themeJsonDirty &&
    (!changed || selectedForNextLaunch);
  const backgroundKey = `${draft.libraryId}:${draft.revision}`;
  const applyDetail = (next: ThemeDetail) => {
    setDraft(next);
    setThemeJsonSource(serializeThemeJson(next));
    setThemeJsonDirty(false);
    setThemeJsonError(undefined);
    onDetailChanged(next);
  };
  const patchFields = () => ({
    name: draft.name,
    description: draft.description,
    ...(draft.styleConfig.mode === "advanced" ? { css: draft.css } : {}),
    themeId: draft.themeId,
    backgroundScope: draft.backgroundScope,
    sidebarOverlayOpacity: draft.sidebarOverlayOpacity,
    appearance: draft.appearance,
    art: draft.art,
    colors: draft.colors,
    styleConfig: draft.styleConfig,
  });
  const patch = () =>
    run(
      () =>
        bridge.patchDraft({
          libraryId: detail.libraryId,
          expectedRevision: detail.revision,
          patch: patchFields(),
        }),
      applyDetail,
    );
  const persistAnd = async <T,>(
    action: (current: ThemeDetail) => Promise<Result<T>>,
    onSuccess?: (data: T) => void,
  ) => {
    if (themeJsonDirty) {
      report("请先校验并应用 theme.json，或恢复当前配置。");
      setStudioTab("theme-json");
      return;
    }
    const current = changed
      ? await run(() =>
          bridge.patchDraft({
            libraryId: detail.libraryId,
            expectedRevision: detail.revision,
            patch: patchFields(),
          }),
        )
      : detail;
    if (current) await run(() => action(current), onSuccess);
  };
  const chooseBackground = async () => {
    if (themeJsonDirty) {
      report("请先校验并应用 theme.json，或恢复当前配置。");
      setStudioTab("theme-json");
      return;
    }
    const selectedBackground = await run(() =>
      bridge.chooseBackground({
        libraryId: detail.libraryId,
        expectedRevision: detail.revision,
      }),
    );
    if (!selectedBackground) return;
    if (!changed) {
      applyDetail(selectedBackground);
      return;
    }
    const updated = await run(() =>
      bridge.patchDraft({
        libraryId: selectedBackground.libraryId,
        expectedRevision: selectedBackground.revision,
        patch: patchFields(),
      }),
    );
    if (updated) applyDetail(updated);
  };
  const applyThemeJson = async () => {
    try {
      const parsed: unknown = JSON.parse(themeJsonSource);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("shape");
    } catch {
      setThemeJsonError("JSON 语法无效，请检查括号、逗号和引号。");
      return;
    }
    const next = await run(() =>
      bridge.patchDraft({
        libraryId: detail.libraryId,
        expectedRevision: detail.revision,
        patch: { themeJson: themeJsonSource },
      }),
    );
    if (next) applyDetail(next);
    else setThemeJsonError("未通过主题结构或安全校验，配置没有被应用。");
  };
  const previewStyle = {
    colorScheme: draft.appearance === "auto" ? "dark" : draft.appearance,
    "--preview-background": draft.colors.background,
    "--preview-panel": draft.colors.panel,
    "--preview-panel-alt": draft.colors.panelAlt,
    "--preview-accent": draft.colors.accent,
    "--preview-accent-alt": draft.colors.accentAlt,
    "--preview-secondary": draft.colors.secondary,
    "--preview-highlight": draft.colors.highlight,
    "--preview-text": draft.colors.text,
    "--preview-muted": draft.colors.muted,
    "--preview-line": draft.colors.line,
    "--preview-blur": `${draft.styleConfig.blur}px`,
    "--preview-radius": `${draft.styleConfig.radius}px`,
    "--preview-border": `${draft.styleConfig.borderWidth}px`,
    "--ds-theme-color-background": draft.colors.background,
    "--ds-theme-color-panel": draft.colors.panel,
    "--ds-theme-color-panel-alt": draft.colors.panelAlt,
    "--ds-theme-color-accent": draft.colors.accent,
    "--ds-theme-color-accent-alt": draft.colors.accentAlt,
    "--ds-theme-color-secondary": draft.colors.secondary,
    "--ds-theme-color-highlight": draft.colors.highlight,
    "--ds-theme-color-text": draft.colors.text,
    "--ds-theme-color-muted": draft.colors.muted,
    "--ds-theme-color-line": draft.colors.line,
    "--ds-theme-surface-blur": `${draft.styleConfig.blur}px`,
    "--ds-theme-surface-radius": `${draft.styleConfig.radius}px`,
  } as CSSProperties;
  return (
    <section className="studio-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">THEME EDITOR</p>
          <h1>{draft.name || "未命名主题"}</h1>
          <p className="muted">
            修改仅在保存并选择后影响下一次 CodexStyle 启动。
          </p>
        </div>
        <div className="heading-actions">
          <span className={`validation-chip ${cssValid ? "good" : "bad"}`}>
            {cssValid
              ? draft.styleConfig.mode === "configured"
                ? "主题配置已通过"
                : "Safe CSS 已通过"
              : draft.styleConfig.mode === "configured"
                ? "需要修正颜色"
                : "需要修正 CSS"}
          </span>
          <button
            className="secondary-button"
            disabled={busy || themeJsonDirty}
            onClick={() =>
              void persistAnd((current) =>
                bridge.exportZip({
                  libraryId: current.libraryId,
                  expectedRevision: current.revision,
                  // The default export remains importable by the legacy
                  // three-file contract.
                  format: "simplified",
                }),
              )
            }
          >
            导出兼容 ZIP
          </button>
          {detail.packageFormat === "formal" && (
            <button
              className="secondary-button"
              disabled={busy || changed || themeJsonDirty}
              onClick={() =>
                void run(() =>
                  bridge.exportZip({
                    libraryId: detail.libraryId,
                    expectedRevision: detail.revision,
                    format: "formal",
                  }),
                )
              }
            >
              导出原始正式 ZIP
            </button>
          )}
          <button
            className="primary-button"
            disabled={busy || themeJsonDirty}
            onClick={() =>
              void persistAnd((current) =>
                bridge.commit({
                  libraryId: current.libraryId,
                  expectedRevision: current.revision,
                }),
              )
            }
          >
            保存主题
          </button>
        </div>
      </div>
      {detail.validation.warnings.includes("signature-unverified") && (
        <div className="warning-strip" role="status">
          此正式包包含签名文件，但当前版本不会验证签名；主题内容仍已通过本地格式、哈希和安全校验。
        </div>
      )}
      <div className="editor-grid">
        <StudioControls
          draft={draft}
          busy={busy}
          changed={changed}
          cssValid={cssValid}
          backgroundKey={backgroundKey}
          tab={studioTab}
          themeJsonSource={themeJsonSource}
          themeJsonDirty={themeJsonDirty}
          themeJsonError={themeJsonError}
          onTabChange={setStudioTab}
          onDraftChange={setDraft}
          onChooseBackground={() => void chooseBackground()}
          onApplyDraft={() => void patch()}
          onThemeJsonChange={(source) => {
            setThemeJsonSource(source);
            setThemeJsonDirty(true);
            setThemeJsonError(undefined);
          }}
          onApplyThemeJson={() => void applyThemeJson()}
          onResetThemeJson={() => {
            setThemeJsonSource(serializeThemeJson(draft));
            setThemeJsonDirty(false);
            setThemeJsonError(undefined);
          }}
        />
        <div className="preview-column">
          <div className="preview-head">
            <div>
              <span className="eyebrow">LIVE PREVIEW</span>
              <h2>Codex Desktop</h2>
            </div>
            <div className="preview-head-actions">
              <div
                className="preview-page-switch"
                role="group"
                aria-label="预览页面"
              >
                <button
                  type="button"
                  aria-pressed={previewPage === "home"}
                  className={previewPage === "home" ? "active" : ""}
                  onClick={() => setPreviewPage("home")}
                >
                  首页
                </button>
                <button
                  type="button"
                  aria-pressed={previewPage === "conversation"}
                  className={previewPage === "conversation" ? "active" : ""}
                  onClick={() => setPreviewPage("conversation")}
                >
                  对话
                </button>
              </div>
              <span className="preview-mode">离线渲染</span>
            </div>
          </div>
          <div className="preview-frame">
            <div
              key={backgroundKey}
              className="mock-codex"
              data-ds-part="root"
              data-style-mode={draft.styleConfig.mode}
              data-theme-appearance={draft.appearance}
              data-safe-area={draft.art.safeArea}
              data-task-mode={draft.art.taskMode}
              data-recipe-sidebar={String(draft.styleConfig.recipes.sidebar)}
              data-recipe-composer={String(draft.styleConfig.recipes.composer)}
              data-recipe-message={String(draft.styleConfig.recipes.message)}
              data-recipe-dialog={String(draft.styleConfig.recipes.dialog)}
              data-preview-shadow={draft.styleConfig.shadow}
              data-preview-page={previewPage}
              style={previewStyle}
            >
              {draft.backgroundUrl && draft.backgroundScope === "window" && (
                <img
                  className="mock-background"
                  src={draft.backgroundUrl}
                  alt=""
                  aria-hidden="true"
                  style={{
                    objectPosition: `${draft.art.focusX * 100}% ${draft.art.focusY * 100}%`,
                  }}
                />
              )}
              <div className="mock-art-treatment" aria-hidden="true" />
              {draft.art.safeArea !== "none" && (
                <div className="mock-safe-area" aria-hidden="true" />
              )}
              <style ref={previewStyleRef} />
              <div
                className="mock-sidebar"
                data-ds-part="sidebar"
                style={
                  draft.backgroundScope === "window"
                    ? {
                        backgroundColor: `rgb(${SIDEBAR_OVERLAY_RGB} / ${draft.sidebarOverlayOpacity / 100})`,
                      }
                    : undefined
                }
              >
                <div className="mock-logo">C</div>
                <div
                  className={`mock-nav ${previewPage === "home" ? "active" : ""}`}
                  data-ds-part="thread"
                >
                  首页
                </div>
                <div
                  className={`mock-nav ${previewPage === "conversation" ? "active" : ""}`}
                  data-ds-part="thread"
                >
                  主题会话
                </div>
                <div className="mock-nav" data-ds-part="thread">
                  设置
                </div>
              </div>
              <div className="mock-main" data-ds-part="main">
                {draft.backgroundUrl && draft.backgroundScope === "content" && (
                  <img
                    className="mock-background"
                    src={draft.backgroundUrl}
                    alt=""
                    aria-hidden="true"
                    style={{
                      objectPosition: `${draft.art.focusX * 100}% ${draft.art.focusY * 100}%`,
                    }}
                  />
                )}
                <div className="mock-toolbar" data-ds-part="header">
                  <span>Codex</span>
                  <span className="mock-toolbar-dot" />
                </div>
                {previewPage === "home" ? (
                  <div className="mock-home" aria-label="Codex 首页预览">
                    <div className="mock-home-intro">
                      <span className="mock-home-mark" aria-hidden="true">
                        C
                      </span>
                      <span className="mock-home-kicker">NEW TASK</span>
                      <h3>今天想做点什么？</h3>
                      <p>从一个想法开始，让 Codex 在本地工作区里协助你。</p>
                    </div>
                    <div
                      className="mock-composer mock-home-composer"
                      data-ds-part="composer"
                    >
                      <span className="mock-home-prompt">
                        <span>描述一个任务...</span>
                        <small>本地工作区 · main</small>
                      </span>
                      <button data-ds-part="composer-toolbar">开始</button>
                    </div>
                    <div
                      className="mock-home-suggestions"
                      aria-label="任务建议"
                    >
                      <span>解释代码</span>
                      <span>修复问题</span>
                      <span>构建功能</span>
                    </div>
                    <div className="mock-home-recent">
                      <span>最近</span>
                      <strong>继续主题会话</strong>
                      <small>刚刚</small>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mock-messages">
                      <div className="mock-message" data-ds-part="message">
                        <span className="mock-avatar">C</span>
                        <span>准备开始。你的本地主题预览会显示在这里。</span>
                      </div>
                      <div className="mock-code" data-ds-part="message">
                        <span>
                          const theme = "{draft.name || "CodexStyle"}";
                        </span>
                        <span>await studio.preview(theme);</span>
                      </div>
                      <div className="mock-dialog" data-ds-part="dialog">
                        <span>主题预览</span>
                        <small>结构化配置已同步到画面</small>
                      </div>
                    </div>
                    <div className="mock-composer" data-ds-part="composer">
                      <span>输入消息...</span>
                      <button data-ds-part="composer-toolbar">发送</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="apply-card">
            <div>
              <strong>
                {selectedForNextLaunch ? "当前已选择" : "选择用于下次启动"}
              </strong>
              <p>
                {selectedForNextLaunch
                  ? "CodexStyle 启动的新会话将尝试注入此主题。"
                  : themeJsonDirty
                    ? "theme.json 有未应用修改，请先校验或恢复。"
                    : changed
                      ? "请先保存草稿，再将最新版本用于下次启动。"
                      : "不会修改已经运行的 Codex 会话。"}
              </p>
            </div>
            <button
              className={
                selectedForNextLaunch ? "secondary-button" : "primary-button"
              }
              disabled={busy || !canSelectForNextLaunch}
              onClick={() =>
                void run(() =>
                  selectedForNextLaunch
                    ? bridge.clearSelection()
                    : bridge.selectForNextLaunch({
                        libraryId: detail.libraryId,
                        expectedRevision: detail.revision,
                      }),
                )
              }
            >
              {selectedForNextLaunch
                ? "取消选择"
                : themeJsonDirty
                  ? "先应用 JSON"
                  : changed
                    ? "请先保存"
                    : "选择主题"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ImportConflict({
  conflict,
  busy,
  run,
  report,
  onResolved,
}: {
  conflict: ImportResult;
  busy: boolean;
  run: StudioProps["run"];
  report: (message: string) => void;
  onResolved: () => void;
}) {
  if (!conflict.transactionId) return null;
  const resolve = (action: "keep-both" | "replace" | "cancel") =>
    void run(
      () =>
        bridge.resolveImport({
          transactionId: conflict.transactionId!,
          action,
          ...(action === "replace" && conflict.conflictLibraryId
            ? {
                replaceLibraryId: conflict.conflictLibraryId,
                expectedRevision: conflict.conflictRevision,
              }
            : {}),
        }),
      (result) => {
        onResolved();
        if (action !== "cancel")
          report(
            messageForImport({
              ...result,
              nameCollision: conflict.nameCollision,
              signatureIgnored:
                result.signatureIgnored ?? conflict.signatureIgnored,
            }),
          );
      },
    );
  return (
    <div className="conflict-card" role="alert">
      <div>
        <strong>发现同 ID 主题</strong>
        <p>
          “{conflict.name ?? "导入主题"}
          ”尚未写入主题库。请选择保留两份、替换现有版本或取消。
          {conflict.nameCollision ? " 其名称也与现有主题重复。" : ""}
          {conflict.signatureIgnored ? " 包内签名尚未验证。" : ""}
        </p>
      </div>
      <div className="conflict-actions">
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => resolve("cancel")}
        >
          取消
        </button>
        {conflict.conflictLibraryId && (
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => resolve("replace")}
          >
            替换现有版本
          </button>
        )}
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => resolve("keep-both")}
        >
          保留两份
        </button>
      </div>
    </div>
  );
}

function SessionView({
  snapshot,
  busy,
  run,
  onOpenStudio,
}: {
  snapshot?: ThemeSnapshot;
  busy: boolean;
  run: StudioProps["run"];
  onOpenStudio: () => void;
}) {
  const state = snapshot?.session.state ?? "NO_SESSION";
  const messageKey = snapshot?.session.messageKey;
  const ownedVerified = Boolean(snapshot?.session.canEnd);
  const launchAdvanced = [
    "LAUNCHING",
    "VERIFYING_CDP",
    "INJECTING",
    "THEMED_SESSION",
  ].includes(state);
  const packageCheck: CheckState =
    state === "INCOMPATIBLE" && messageKey === "session.storePackageNotFound"
      ? "fail"
      : launchAdvanced || ownedVerified || state === "INCOMPATIBLE"
        ? "pass"
        : "pending";
  const externalCheck: CheckState =
    state === "EXTERNAL_BLOCKED"
      ? "fail"
      : launchAdvanced || ownedVerified || state === "INCOMPATIBLE"
        ? "pass"
        : "pending";
  const identityCheck: CheckState = ownedVerified
    ? "pass"
    : state === "INCOMPATIBLE"
      ? "fail"
      : "pending";
  return (
    <section className="session-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CODEX SESSION</p>
          <h1>受管会话</h1>
          <p className="muted">
            只启动和管理由 CodexStyle 完整验证身份的 Store Codex。
          </p>
        </div>
        <div className={`large-state state-${state}`}>
          <span className="status-dot" />
          {sessionLabels[state]}
        </div>
      </div>
      <div className="session-grid">
        <div className="panel-card session-card">
          <div className="session-icon">C</div>
          <h2>
            {snapshot?.session.messageKey === "session.externalRunning"
              ? "检测到外部 Codex"
              : sessionLabels[state]}
          </h2>
          <p>{messageForState(state)}</p>
          <div className="session-actions">
            {snapshot?.paused ? (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void run(() => bridge.resumeSession())}
              >
                恢复后续注入
              </button>
            ) : state === "THEMED_SESSION" ? (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void run(() => bridge.pauseSession())}
              >
                暂停后续注入
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={busy || !snapshot?.selectedLibraryId}
                onClick={() => void run(() => bridge.launchSession())}
              >
                启动 Codex
              </button>
            )}
            {snapshot?.session.canEnd && (
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => void run(() => bridge.endOwnedSession())}
              >
                结束已拥有会话
              </button>
            )}
          </div>
        </div>
        <div className="panel-card checklist">
          <div className="section-title">
            <span>启动检查</span>
            <span className="revision">本地验证</span>
          </div>
          <CheckRow label="Microsoft Store OpenAI.Codex" state={packageCheck} />
          <CheckRow label="外部会话阻断" state={externalCheck} />
          <CheckRow label="127.0.0.1 CDP 身份" state={identityCheck} />
          <CheckRow label="版本化选择器" state={identityCheck} />
          <button className="text-button" onClick={onOpenStudio}>
            返回主题 Studio →
          </button>
        </div>
      </div>
      <div className="warning-strip">
        外部启动的 Codex 不会被注入、关闭、重启或附着。CDP
        或选择器不兼容时保持原样。
      </div>
    </section>
  );
}

type CheckState = "pass" | "fail" | "pending";

function CheckRow({ label, state }: { label: string; state: CheckState }) {
  const passed = state === "pass";
  return (
    <div className="check-row">
      <span
        className={`check-circle ${passed ? "ok" : state === "fail" ? "failed" : ""}`}
      >
        {passed ? "✓" : state === "fail" ? "!" : "·"}
      </span>
      <span>{label}</span>
      <small>{passed ? "通过" : state === "fail" ? "未通过" : "等待"}</small>
    </div>
  );
}
function messageForState(state: SessionState): string {
  if (state === "EXTERNAL_BLOCKED")
    return "已有外部启动的 Codex。请在系统中自行关闭后再试，CodexStyle 不会触碰它。";
  if (state === "INCOMPATIBLE")
    return "当前 Store 版本未提供可验证的 CDP 或选择器，工具不会绕过安全边界。";
  if (state === "ORPHANED")
    return "上次工具会话身份已失效。请重新启动，不会自动附着孤儿进程。";
  if (state === "THEMED_SESSION")
    return "主题已经注入到本工具启动的 Codex 会话。";
  if (state === "PAUSED_FUTURE")
    return "已停止后续注入，当前页面不会被追溯修改。";
  return "选择一个已保存主题后启动 CodexStyle 管理的会话。";
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">✦</div>
      <h1>开始你的主题</h1>
      <p>创建一个本地主题，使用安全 CSS 预览 Codex Desktop。</p>
      <button className="primary-button" onClick={onCreate}>
        创建第一个主题
      </button>
    </div>
  );
}
