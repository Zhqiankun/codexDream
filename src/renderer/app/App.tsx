import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  type ImportResult,
  type Result,
  type SessionState,
  type ThemeDetail,
  type ThemeSnapshot,
  type UpdateSnapshot,
} from "../../contracts";
import { bridge } from "../api/bridge";
import {
  StudioControls,
  type PreviewColorTarget,
  type StudioTab,
} from "../features/studio/StudioControls";
import { SendIconGlyph } from "../features/studio/SendIconGlyph";

const PREVIEW_COLOR_PATTERN =
  /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|#[0-9a-fA-F]{3,4}|rgb\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*\)|rgba\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*(?:0|1|1\.0|0?\.[0-9]{1,6})\s*\))$/u;

type View = "library" | "session";
type PreviewPage = "home" | "conversation";

const CONVERSATION_COLOR_TARGETS = new Set<PreviewColorTarget>([
  "assistantPanel",
  "highlight",
  "userMessageText",
]);

const sessionLabels: Record<SessionState, string> = {
  NO_SESSION: "未启动",
  EXTERNAL_BLOCKED: "外部会话阻断",
  LAUNCHING: "启动中",
  VERIFYING_CDP: "验证中",
  INJECTING: "注入中",
  THEMED_SESSION: "主题会话",
  PAUSED_FUTURE: "已暂停后续注入",
  INCOMPATIBLE: "不兼容",
  ORPHANED: "上次会话待确认",
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
  "update.checkFailed": "无法连接 GitHub 检查更新，请稍后重试。",
  "update.downloadFailed": "更新下载或完整性校验失败，请稍后重试。",
  "update.installFailed": "无法启动已下载的更新，请重试或手动安装。",
  "update.unsupported":
    "应用内更新仅支持正式安装的 Windows 版本；开发版或 ZIP 便携版请手动更新。",
  "update.openFailed": "无法打开下载页面，请前往项目的 GitHub Releases。",
  "ipc.busy": "另一项操作正在进行，请稍后再试。",
  "ipc.invalid": "请求内容无效，请重试。",
  "ipc.unauthorized": "当前页面无权执行此操作。",
  "session.externalRunning": "外部 Codex 正在运行，请自行关闭后再试。",
  "session.storePackageNotFound": "未找到受支持的 Microsoft Store Codex。",
  "session.launchFailed": "Windows 未能启动 Store Codex，请重试。",
  "session.cdpUnavailable": "当前 Codex 未开放可验证的本地调试端点。",
  "session.identityMismatch": "Codex 会话身份验证失败，未执行注入。",
  "session.targetIncompatible": "当前 Codex 页面与安全选择器不兼容。",
  "session.injectionFailed": "主题注入失败，Codex 保持原样。",
  "session.cleanupFailed": "无法安全结束受管会话。",
  "session.paused": "后续注入已暂停，请先恢复。",
  "session.themeNotReady": "请先保存并选择一个完整主题。",
  "session.themeUnsafe": "所选主题未通过安全校验。",
  "store.tampered": "本地受管存储校验失败，操作已安全停止。",
  "theme.notFound": "主题不存在或已被移除。",
  "theme.staleRevision": "主题已发生变化，请刷新后重试。",
  "theme.inUse": "该主题正在用于下次启动或当前受管会话，请先切换并结束会话。",
  "theme.imageMissing": "请先为主题选择有效背景图。",
  "theme.formalExportUnavailable": "此主题已编辑，无法原样导出正式包。",
  "theme.legacyExportUnsupported":
    "当前高级 CSS 使用了旧版不支持的能力，请改用“导出主题 ZIP”。",
  "import.transactionNotFound": "导入事务已失效，请重新选择 ZIP。",
  "import.replaceArguments": "替换参数无效，请重新导入。",
  "window.unavailable": "主题工作台窗口当前不可用。",
  "error.unsafe_archive": "ZIP 未通过安全或格式校验。",
  "error.unsafe_css": "CSS 未通过安全样式校验。",
  "error.unsafe_image":
    "图片不符合要求：请使用静态 PNG/JPG/WebP，文件不超过 10 MiB、单边不超过 16,384 px、总像素不超过 5,000 万，并确保文件可正常打开。",
  "error.incomplete_theme": "主题内容不完整，请补齐后再试。",
  "error.stale_revision": "主题已发生变化，请刷新后重试。",
  "error.theme_id_conflict": "主题 ID 与现有主题冲突。",
  "error.theme_in_use": "该主题正在使用中，暂时不能删除。",
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

function updateButtonText(update?: UpdateSnapshot): string {
  if (!update) return "检查更新";
  if (update.status === "checking") return "正在检查更新";
  if (update.status === "downloading")
    return `正在下载更新 ${update.progress?.percent ?? 0}%`;
  if (update.status === "downloaded") return `v${update.latestVersion} 已就绪`;
  if (update.status === "scheduled") return "更新将在退出时安装";
  if (update.status === "installing") return "正在启动更新安装";
  if (update.status === "unsupported") return "此版本不支持应用内更新";
  return "检查更新";
}

function updateCardTitle(update: UpdateSnapshot): string {
  if (update.status === "checking") return "正在检查最新版本";
  if (update.status === "available")
    return `发现新版本 v${update.latestVersion}`;
  if (update.status === "downloading")
    return `正在下载 v${update.latestVersion}`;
  if (update.status === "downloaded")
    return `v${update.latestVersion} 已准备好安装`;
  if (update.status === "scheduled") return "已安排退出时安装";
  if (update.status === "installing") return "正在启动安装程序";
  if (update.status === "error")
    return update.errorPhase === "install"
      ? "无法启动更新安装"
      : update.errorPhase === "download"
        ? "更新下载失败"
        : "更新检查失败";
  return "CodexStyle 更新";
}

function updateCardDescription(update: UpdateSnapshot): string {
  if (update.status === "checking")
    return "正在从固定的 GitHub Release 更新源读取 latest.yml。";
  if (update.status === "available") return "已确认版本，正在准备安全下载。";
  if (update.status === "downloading")
    return "下载完成后会核对同一次构建声明的 SHA-512。";
  if (update.status === "downloaded")
    return "完整性校验已通过。安装包尚未代码签名，Windows 仍可能显示未知发布者。";
  if (update.status === "scheduled")
    return `v${update.latestVersion} 将在你从托盘退出 CodexStyle 时安装。`;
  if (update.status === "installing")
    return "CodexStyle 将退出并由 NSIS 覆盖安装，然后重新启动。";
  if (update.status === "error")
    return update.errorPhase === "install"
      ? "已下载的安装包仍保留在更新缓存中；你可以重试安装或改为手动下载。"
      : update.errorPhase === "download"
        ? "网络中断或完整性校验未通过，没有执行安装文件。"
        : "暂时无法读取更新信息，当前版本不会发生变化。";
  return "";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function App() {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot | undefined>();
  const [selected, setSelected] = useState<ThemeDetail | undefined>();
  const [view, setView] = useState<View>("library");
  const [notice, setNotice] = useState<string>("");
  const [pendingImport, setPendingImport] = useState<ImportResult>();
  const [deleteCandidate, setDeleteCandidate] =
    useState<ThemeSnapshot["themes"][number]>();
  const [dismissedUpdateVersion, setDismissedUpdateVersion] =
    useState<string>();
  const [busy, setBusy] = useState(false);
  const selectedLibraryIdRef = useRef<string | undefined>(undefined);
  const selectedRevisionRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    selectedLibraryIdRef.current = selected?.libraryId;
    selectedRevisionRef.current = selected?.revision;
  }, [selected?.libraryId]);

  const adoptSelectedDetail = (detail: ThemeDetail) => {
    selectedLibraryIdRef.current = detail.libraryId;
    selectedRevisionRef.current = detail.revision;
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
      const summary = next.themes.find(
        (theme) => theme.libraryId === libraryId,
      );
      if (libraryId && summary?.revision !== selectedRevisionRef.current)
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
  const update = snapshot?.update;
  const updateInProgress =
    update?.status === "checking" ||
    update?.status === "downloading" ||
    update?.status === "installing";
  const updateHasBadge =
    update?.status === "downloaded" || update?.status === "scheduled";
  const showUpdateCard = Boolean(
    update &&
      [
        "checking",
        "available",
        "downloading",
        "downloaded",
        "scheduled",
        "installing",
        "error",
      ].includes(update.status) &&
      !(
        update.status === "downloaded" &&
        update.latestVersion === dismissedUpdateVersion
      ),
  );
  const updateButtonLabel = updateButtonText(update);

  const checkForUpdates = async () => {
    if (update?.status === "unsupported") {
      const opened = unwrap(await bridge.openUpdatePage(), report);
      if (opened) report("已打开 GitHub Release 手动下载页面。");
      return;
    }
    if (update?.status === "downloaded" || update?.status === "scheduled") {
      setDismissedUpdateVersion(undefined);
      return;
    }
    try {
      const next = unwrap(await bridge.requestUpdate(), report);
      if (!next) return;
      setSnapshot((current) =>
        current ? { ...current, update: next } : current,
      );
      if (next.status === "current")
        report(`当前已是最新版 v${next.currentVersion}。`);
      if (next.status === "downloaded") {
        setDismissedUpdateVersion(undefined);
        report(`v${next.latestVersion} 已下载并通过完整性校验。`);
      }
    } catch {
      report(messageForError("update.checkFailed"));
    }
  };

  const cancelUpdate = async () => {
    const next = unwrap(await bridge.cancelUpdate(), report);
    if (next) {
      setSnapshot((current) =>
        current ? { ...current, update: next } : current,
      );
      report(
        next.status === "downloaded"
          ? "已取消退出时安装。"
          : "更新下载已取消。",
      );
    }
  };

  const installUpdate = async (mode: "now" | "on-quit") => {
    const next = unwrap(await bridge.installUpdate({ mode }), report);
    if (next) {
      setSnapshot((current) =>
        current ? { ...current, update: next } : current,
      );
      if (next.status === "scheduled")
        report("已安排在你从托盘退出 CodexStyle 时安装。");
    }
  };

  const openUpdatePage = (update: UpdateSnapshot) =>
    run(
      () => bridge.openUpdatePage(),
      () => {
        setDismissedUpdateVersion(update.latestVersion);
        report("已打开 GitHub Release 下载页面。");
      },
    );

  const activateTheme = (theme: ThemeSnapshot["themes"][number]) => {
    if (theme.status !== "ready") {
      report("请先保存主题，再双击启用。");
      return;
    }
    void run(
      () =>
        bridge.selectForNextLaunch({
          libraryId: theme.libraryId,
          expectedRevision: theme.revision,
        }),
      () => report(`已启用“${theme.name}”，下次启动 Codex 时生效。`),
    );
  };

  const confirmDeleteTheme = () => {
    const candidate = deleteCandidate;
    if (!candidate) return;
    void run(
      () =>
        bridge.deleteTheme({
          libraryId: candidate.libraryId,
          expectedRevision: candidate.revision,
        }),
      () => {
        selectedLibraryIdRef.current = undefined;
        setSelected(undefined);
        setDeleteCandidate(undefined);
        report(`已删除“${candidate.name}”。`);
      },
    );
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          C
        </div>
        <div className="brand-copy">
          <strong>CodexStyle</strong>
          <span>本地主题工作台</span>
        </div>
        <div className="topbar-spacer" />
        <div
          className={`session-pill state-${snapshot?.session.state ?? "NO_SESSION"}`}
        >
          <span className="status-dot" />
          {sessionLabels[snapshot?.session.state ?? "NO_SESSION"]}
        </div>
        <button
          className={`icon-button update-button ${updateHasBadge ? "has-update" : ""} ${updateInProgress ? "is-busy" : ""}`}
          title={updateButtonLabel}
          aria-label={updateButtonLabel}
          disabled={busy || updateInProgress}
          onClick={() => void checkForUpdates()}
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
                title={
                  theme.status === "ready"
                    ? "单击编辑，双击启用"
                    : "单击编辑；保存后可双击启用"
                }
                onClick={() => void refresh(theme.libraryId)}
                onDoubleClick={() => activateTheme(theme)}
              >
                <span
                  className="theme-swatch"
                  style={{ background: theme.accent }}
                />
                <span className="theme-row-copy">
                  <strong>{theme.name}</strong>
                  <small>
                    {theme.status === "ready" ? "已保存" : "草稿"} ·{" "}
                    {theme.packageFormat === "formal" ? "正式包" : "主题包"}
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
              主题设计
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
          {showUpdateCard && update && (
            <section
              className={`update-card state-${update.status}`}
              aria-label="CodexStyle 更新"
              aria-live="polite"
            >
              <div className="update-card-mark" aria-hidden="true">
                {update.status === "downloaded" || update.status === "scheduled"
                  ? "✓"
                  : update.status === "error"
                    ? "!"
                    : "↻"}
              </div>
              <div className="update-card-copy">
                <span>CODEXSTYLE UPDATE</span>
                <strong>{updateCardTitle(update)}</strong>
                <p>{updateCardDescription(update)}</p>
                {update.status === "downloading" && update.progress && (
                  <div className="update-progress-wrap">
                    <div
                      className="update-progress"
                      role="progressbar"
                      aria-label="更新下载进度"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={update.progress.percent}
                    >
                      <span
                        style={
                          {
                            "--update-progress": `${update.progress.percent / 100}`,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span className="update-progress-copy">
                      {update.progress.percent}% ·{" "}
                      {formatBytes(update.progress.transferredBytes)}
                      {update.progress.totalBytes > 0
                        ? ` / ${formatBytes(update.progress.totalBytes)}`
                        : ""}
                    </span>
                  </div>
                )}
              </div>
              <div className="update-card-actions">
                {update.status === "available" && (
                  <button
                    className="primary-button"
                    onClick={() => void checkForUpdates()}
                  >
                    继续下载
                  </button>
                )}
                {update.status === "downloading" && (
                  <button
                    className="secondary-button"
                    onClick={() => void cancelUpdate()}
                  >
                    取消下载
                  </button>
                )}
                {update.status === "downloaded" && (
                  <>
                    <button
                      className="text-button"
                      onClick={() =>
                        setDismissedUpdateVersion(update.latestVersion)
                      }
                    >
                      稍后
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => void installUpdate("on-quit")}
                    >
                      退出时安装
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => void installUpdate("now")}
                    >
                      重启并安装
                    </button>
                  </>
                )}
                {update.status === "scheduled" && (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => void cancelUpdate()}
                    >
                      取消安排
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => void installUpdate("now")}
                    >
                      立即安装
                    </button>
                  </>
                )}
                {update.status === "error" && (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => void openUpdatePage(update)}
                    >
                      手动下载
                    </button>
                    <button
                      className="primary-button"
                      onClick={() =>
                        void (update.errorPhase === "install"
                          ? installUpdate("now")
                          : checkForUpdates())
                      }
                    >
                      {update.errorPhase === "install"
                        ? "重试安装"
                        : update.errorPhase === "download"
                          ? "重新下载"
                          : "重新检查"}
                    </button>
                  </>
                )}
              </div>
            </section>
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
              onRequestDelete={() => {
                if (selectedSummary) setDeleteCandidate(selectedSummary);
              }}
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
      {deleteCandidate && (
        <DeleteThemeDialog
          theme={deleteCandidate}
          busy={busy}
          onCancel={() => setDeleteCandidate(undefined)}
          onConfirm={confirmDeleteTheme}
        />
      )}
    </div>
  );
}

interface StudioProps {
  detail: ThemeDetail;
  summary?: ThemeSnapshot["themes"][number];
  busy: boolean;
  report: (message: string) => void;
  onDetailChanged: (detail: ThemeDetail) => void;
  onRequestDelete: () => void;
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
  onRequestDelete,
}: StudioProps) {
  const [draft, setDraft] = useState(detail);
  const [studioTab, setStudioTab] = useState<StudioTab>("design");
  const [previewPage, setPreviewPage] = useState<PreviewPage>("conversation");
  const [previewColorTarget, setPreviewColorTarget] =
    useState<PreviewColorTarget>();
  const handlePreviewColorTargetChange = useCallback(
    (target?: PreviewColorTarget) => {
      setPreviewColorTarget(target);
      if (target && CONVERSATION_COLOR_TARGETS.has(target))
        setPreviewPage("conversation");
    },
    [],
  );
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
  const chooseSendIcon = async () => {
    if (themeJsonDirty) {
      report("请先校验并应用高级配置，或恢复当前配置。");
      setStudioTab("theme-json");
      return;
    }
    const selectedIcon = await run(() =>
      bridge.chooseSendIcon({
        libraryId: detail.libraryId,
        expectedRevision: detail.revision,
      }),
    );
    if (!selectedIcon) return;
    if (!changed) {
      applyDetail(selectedIcon);
      return;
    }
    const updated = await run(() =>
      bridge.patchDraft({
        libraryId: selectedIcon.libraryId,
        expectedRevision: selectedIcon.revision,
        patch: {
          ...patchFields(),
          styleConfig: {
            ...draft.styleConfig,
            sendIcon: "custom",
            sendIconDataUrl: selectedIcon.styleConfig.sendIconDataUrl,
          },
        },
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
    "--preview-sidebar-text": draft.colors.sidebarText,
    "--preview-panel-alt": draft.colors.panelAlt,
    "--preview-assistant-panel": draft.colors.assistantPanel,
    "--preview-user-message-text": draft.colors.userMessageText,
    "--preview-top-bar-background": draft.colors.topBarBackground,
    "--preview-top-bar-text": draft.colors.topBarText,
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
    "--ds-theme-color-sidebar-text": draft.colors.sidebarText,
    "--ds-theme-color-panel-alt": draft.colors.panelAlt,
    "--ds-theme-color-assistant-panel": draft.colors.assistantPanel,
    "--ds-theme-color-user-message-text": draft.colors.userMessageText,
    "--ds-theme-color-top-bar-background": draft.colors.topBarBackground,
    "--ds-theme-color-top-bar-text": draft.colors.topBarText,
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
          <p className="eyebrow">主题编辑器</p>
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
                : "安全样式已通过"
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
                  // The current package preserves every structured color.
                  format: "simplified",
                }),
              )
            }
          >
            导出主题 ZIP
          </button>
          <button
            className="secondary-button"
            disabled={busy || themeJsonDirty}
            title="适用于 v1.0.x 与 v1.1.x；会移除三个新颜色字段，并拒绝旧版不支持的高级 CSS"
            onClick={() =>
              void persistAnd((current) =>
                bridge.exportZip({
                  libraryId: current.libraryId,
                  expectedRevision: current.revision,
                  format: "compatibility",
                }),
              )
            }
          >
            导出旧版兼容 ZIP
          </button>
          {detail.packageFormat === "formal" && (
            <button
              className="secondary-button"
              disabled={busy || changed || themeJsonDirty}
              title={
                changed
                  ? "主题已经编辑，不能再原样重建导入时的正式包"
                  : "导出导入时的原始正式包"
              }
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
              {changed ? "已编辑，不能原样导出" : "导出原始正式 ZIP"}
            </button>
          )}
          <button
            className="danger-button"
            disabled={busy || selectedForNextLaunch}
            title={
              selectedForNextLaunch
                ? "请先启用另一个主题，再删除当前主题"
                : "删除当前主题"
            }
            onClick={onRequestDelete}
          >
            删除主题
          </button>
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
          cssValid={cssValid}
          backgroundKey={backgroundKey}
          tab={studioTab}
          themeJsonSource={themeJsonSource}
          themeJsonDirty={themeJsonDirty}
          themeJsonError={themeJsonError}
          onTabChange={setStudioTab}
          onDraftChange={setDraft}
          onChooseBackground={() => void chooseBackground()}
          onChooseSendIcon={() => void chooseSendIcon()}
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
          onPreviewColorTargetChange={handlePreviewColorTargetChange}
        />
        <div className="preview-column">
          <div className="preview-head">
            <div>
              <span className="eyebrow">实时预览</span>
              <h2>Codex 桌面效果</h2>
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
              data-background-scope={draft.backgroundScope}
              data-safe-area={draft.art.safeArea}
              data-task-mode={draft.art.taskMode}
              data-recipe-sidebar={String(draft.styleConfig.recipes.sidebar)}
              data-recipe-composer={String(draft.styleConfig.recipes.composer)}
              data-recipe-message={String(draft.styleConfig.recipes.message)}
              data-recipe-dialog={String(draft.styleConfig.recipes.dialog)}
              data-preview-shadow={draft.styleConfig.shadow}
              data-preview-page={previewPage}
              data-preview-color-target={previewColorTarget}
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
                className="mock-titlebar"
                data-ds-part="titlebar"
                aria-hidden="true"
              >
                <div className="mock-titlebar-menu">
                  <span className="mock-app-glyph">◫</span>
                  <span>←</span>
                  <span>→</span>
                  <span>文件</span>
                  <span>编辑</span>
                  <span>视图</span>
                  <span>帮助</span>
                </div>
                <div className="mock-window-controls">
                  <span>—</span>
                  <span>□</span>
                  <span>×</span>
                </div>
              </div>
              <div className="mock-workspace-shell">
                <div
                  className="mock-sidebar"
                  data-ds-part="sidebar"
                  style={
                    draft.backgroundScope === "window"
                      ? {
                          backgroundColor: `color-mix(in srgb, ${draft.colors.panel} ${draft.sidebarOverlayOpacity}%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <div className="mock-sidebar-head">
                    <strong>Codex⌄</strong>
                    <span aria-hidden="true">⌕ ·</span>
                  </div>
                  <div className="mock-primary-nav">
                    <div className="mock-nav" data-ds-part="thread">
                      <span aria-hidden="true">✎</span> 新对话
                    </div>
                    <div className="mock-nav" data-ds-part="thread">
                      <span aria-hidden="true">⑂</span> 拉取请求
                    </div>
                    <div className="mock-nav" data-ds-part="thread">
                      <span aria-hidden="true">⌘</span> 站点
                    </div>
                    <div className="mock-nav" data-ds-part="thread">
                      <span aria-hidden="true">◷</span> 已安排
                    </div>
                    <div className="mock-nav" data-ds-part="thread">
                      <span aria-hidden="true">◎</span> 插件
                    </div>
                  </div>
                  <span className="mock-sidebar-label">项目</span>
                  <div
                    className={`mock-project ${previewPage === "home" ? "active" : ""}`}
                    data-ds-part="thread"
                  >
                    <strong>
                      <span aria-hidden="true">▱</span> CodexStyle
                    </strong>
                    <small>创建一个新任务</small>
                  </div>
                  <div
                    className={`mock-project ${previewPage === "conversation" ? "active" : ""}`}
                    data-ds-part="thread"
                  >
                    <strong>
                      <span aria-hidden="true">▱</span> 主题工作台
                    </strong>
                    <small>调整本地主题预览</small>
                  </div>
                  <div className="mock-project" data-ds-part="thread">
                    <strong>
                      <span aria-hidden="true">▱</span> Workspace
                    </strong>
                    <small>暂无聊天</small>
                  </div>
                  <div className="mock-sidebar-profile">
                    <span className="mock-profile-dot">C</span>
                    <strong>本地用户</strong>
                    <span aria-hidden="true">?</span>
                  </div>
                </div>
                <div className="mock-main" data-ds-part="main">
                  {draft.backgroundUrl &&
                    draft.backgroundScope === "content" && (
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
                    <span className="mock-toolbar-title">
                      {previewPage === "conversation" ? "▱ 主题会话  ···" : ""}
                    </span>
                    <span className="mock-toolbar-actions" aria-hidden="true">
                      ⇧　☷　▢
                    </span>
                  </div>
                  {previewPage === "home" ? (
                    <div className="mock-home" aria-label="Codex 首页预览">
                      <div className="mock-home-center">
                        <div className="mock-home-intro">
                          <span className="mock-home-mark" aria-hidden="true">
                            &gt;_
                          </span>
                          <h3>
                            你想让我们在 <u>CodexStyle</u> 中构建什么？
                          </h3>
                        </div>
                        <div
                          className="mock-home-suggestions"
                          aria-label="任务建议"
                        >
                          <span>
                            <i>⌕</i>探索并理解代码
                          </span>
                          <span>
                            <i>⌁</i>构建新功能、应用或工具
                          </span>
                          <span>
                            <i>↻</i>审查代码并提出修改建议
                          </span>
                          <span>
                            <i>♙</i>修复问题和失败
                          </span>
                        </div>
                      </div>
                      <div className="mock-home-composer-wrap">
                        <div className="mock-workspace-pill">
                          <span>▱ CodexStyle</span>
                          <span>▣ 本地</span>
                          <span>⑂ main</span>
                        </div>
                        <div
                          className="mock-composer mock-home-composer"
                          data-ds-part="composer"
                        >
                          <span className="mock-composer-placeholder">
                            随心输入
                          </span>
                          <div
                            className="mock-composer-toolbar"
                            data-ds-part="composer-toolbar"
                          >
                            <span>
                              ＋　<em>◉ 完全访问</em>
                            </span>
                            <span>
                              5.6 Sol 最高⌄　♩　
                              <button
                                type="button"
                                className="mock-send-button"
                                data-ds-part="composer-submit"
                                aria-label="发送"
                              >
                                <SendIconGlyph
                                  icon={draft.styleConfig.sendIcon}
                                  dataUrl={draft.styleConfig.sendIconDataUrl}
                                />
                              </button>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mock-conversation">
                      <div className="mock-messages">
                        <div
                          className="mock-user-message"
                          data-ds-part="message"
                          data-user-message-bubble="true"
                        >
                          先看看主题预览吧
                        </div>
                        <div className="mock-turn-meta">用时 5 秒　›</div>
                        <div
                          className="mock-message"
                          data-ds-part="message"
                          data-markdown-text-style="assistant-message"
                        >
                          <span>
                            <span className="mock-selection-sample">
                              主题已加载
                            </span>
                            。助手卡片使用与用户气泡一致的舒展内边距。
                          </span>
                        </div>
                        <div className="mock-code">
                          <span>
                            const theme = "{draft.name || "CodexStyle"}";
                          </span>
                          <span>await studio.preview(theme);</span>
                        </div>
                        <div className="mock-dialog" data-ds-part="dialog">
                          <span>
                            <b>◉</b> 主题预览
                          </span>
                          <small>结构化配置已同步到画面</small>
                        </div>
                      </div>
                      <div className="mock-conversation-composer-wrap">
                        <div className="mock-composer" data-ds-part="composer">
                          <span className="mock-composer-placeholder">
                            随心输入
                          </span>
                          <div
                            className="mock-composer-toolbar"
                            data-ds-part="composer-toolbar"
                          >
                            <span>
                              ＋　<em>◉ 完全访问</em>
                            </span>
                            <span>
                              5.6 Sol 最高⌄　♩　
                              <button
                                type="button"
                                className="mock-send-button"
                                data-ds-part="composer-submit"
                                aria-label="发送"
                              >
                                <SendIconGlyph
                                  icon={draft.styleConfig.sendIcon}
                                  dataUrl={draft.styleConfig.sendIconDataUrl}
                                />
                              </button>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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

function DeleteThemeDialog({
  theme,
  busy,
  onCancel,
  onConfirm,
}: {
  theme: ThemeSnapshot["themes"][number];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-backdrop" role="presentation">
      <div
        className="confirm-dialog panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-theme-title"
      >
        <span className="confirm-kicker">删除本地主题</span>
        <h2 id="delete-theme-title">确定删除“{theme.name}”吗？</h2>
        <p>
          主题配置和背景图片将从 CodexStyle 本地主题库移除。此操作无法撤销。
        </p>
        <div className="confirm-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={onCancel}
            autoFocus
          >
            取消
          </button>
          <button className="danger-button" disabled={busy} onClick={onConfirm}>
            {busy ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
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
  const checks = sessionCheckStates(state, messageKey, ownedVerified);
  return (
    <section className="session-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CODEX 会话</p>
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
          <p>{messageForState(state, messageKey)}</p>
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
                结束受管会话
              </button>
            )}
          </div>
        </div>
        <div className="panel-card checklist">
          <div className="section-title">
            <span>启动检查</span>
            <span className="revision">本地验证</span>
          </div>
          <CheckRow label="Store Codex 可启动" state={checks.package} />
          <CheckRow label="会话可安全管理" state={checks.ownership} />
          <CheckRow label="主题与当前版本兼容" state={checks.compatibility} />
          <button className="text-button" onClick={onOpenStudio}>
            返回主题设计 →
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

interface SessionCheckStates {
  package: CheckState;
  ownership: CheckState;
  compatibility: CheckState;
}

function sessionCheckStates(
  state: SessionState,
  messageKey: string | undefined,
  ownedVerified: boolean,
): SessionCheckStates {
  const checks: SessionCheckStates = {
    package: "pending",
    ownership: "pending",
    compatibility: "pending",
  };

  if (ownedVerified || state === "THEMED_SESSION" || state === "INJECTING") {
    return {
      package: "pass",
      ownership: "pass",
      compatibility: "pass",
    };
  }

  if (state === "EXTERNAL_BLOCKED") {
    return { ...checks, package: "pass", ownership: "fail" };
  }

  if (state === "LAUNCHING" || state === "VERIFYING_CDP") {
    return { ...checks, package: "pass", ownership: "pass" };
  }

  if (state !== "INCOMPATIBLE") return checks;

  if (messageKey === "session.storePackageNotFound") {
    return { ...checks, package: "fail" };
  }

  if (messageKey === "session.launchFailed") {
    return { ...checks, package: "fail" };
  }

  if (
    messageKey === "session.cdpUnavailable" ||
    messageKey === "session.identityMismatch"
  ) {
    return {
      ...checks,
      package: "pass",
      ownership: "fail",
    };
  }

  if (messageKey === "session.targetIncompatible") {
    return {
      package: "pass",
      ownership: "pass",
      compatibility: "fail",
    };
  }

  if (messageKey === "session.injectionFailed") {
    return {
      package: "pass",
      ownership: "pass",
      compatibility: "fail",
    };
  }

  return checks;
}

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
function messageForState(
  state: SessionState,
  messageKey: string | undefined,
): string {
  if (state === "LAUNCHING")
    return "正在通过 Microsoft Store 注册入口启动 Codex，尚未连接或注入主题。";
  if (state === "VERIFYING_CDP")
    return "Codex 已启动，正在等待它打开仅限本机的 127.0.0.1 调试端口并完成身份核验。";
  if (state === "INJECTING")
    return "会话身份与页面兼容性已通过，正在安全应用所选主题。";
  if (state === "EXTERNAL_BLOCKED")
    return "已有外部启动的 Codex。请在系统中自行关闭后再试，CodexStyle 不会触碰它。";
  if (state === "INCOMPATIBLE" && messageKey === "session.launchFailed")
    return "Windows 启动调用失败，未创建受管会话，也未注入任何主题。";
  if (state === "INCOMPATIBLE" && messageKey === "session.cdpUnavailable")
    return "Codex 已启动，但未在等待时间内打开可验证的 127.0.0.1 CDP 端口。请关闭刚打开的 Codex 后重试；若持续出现，可能是当前 Store 版本未透传调试参数。";
  if (state === "INCOMPATIBLE" && messageKey === "session.identityMismatch")
    return "检测到了端口或进程，但 PID、用户身份、启动参数或 Browser ID 不匹配。为安全起见未连接，请关闭刚打开的 Codex 后重试。";
  if (state === "INCOMPATIBLE" && messageKey === "session.targetIncompatible")
    return "本地 CDP 已验证，但当前 Codex 页面结构与主题选择器不兼容，需要更新 CodexStyle 的兼容配置。";
  if (state === "INCOMPATIBLE" && messageKey === "session.injectionFailed")
    return "会话身份与页面兼容性已通过，但主题注入没有完整成功，Codex 已保持原样。";
  if (state === "INCOMPATIBLE")
    return "当前 Store 版本未提供可验证的 CDP 或选择器，工具不会绕过安全边界。";
  if (state === "ORPHANED")
    return "检测到上次由 CodexStyle 启动的会话记录，但当前无法安全确认它仍受控。请先确认并关闭相关 Codex 窗口，再重新启动；CodexStyle 不会自动连接或关闭它。";
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
      <p>创建一个本地主题，通过安全样式预览 Codex 桌面效果。</p>
      <button className="primary-button" onClick={onCreate}>
        创建第一个主题
      </button>
    </div>
  );
}
