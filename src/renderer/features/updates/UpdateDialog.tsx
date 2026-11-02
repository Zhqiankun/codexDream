import type { UpdateSnapshot } from "../../../contracts";
import { useConfirmDialog } from "../../components/useConfirmDialog";
import { preferredReleaseNotes, releaseHistory } from "./release-history";

export interface UpdateDialogProps {
  mode: "update" | "history";
  currentVersion?: string;
  update?: UpdateSnapshot;
  checking: boolean;
  downloading: boolean;
  error?: string;
  onModeChange: (mode: "update" | "history") => void;
  onClose: () => void;
  onCheck: () => void;
  onDownload: (confirmationId: string) => void;
  onCancelDownload: () => void;
  onInstall: (mode: "now" | "on-quit") => void;
  onOpenRelease: () => void;
}

// 仅展示主进程确认的更新状态；确认令牌从当前可见说明传回，不接收或生成更新地址。
export default function UpdateDialog(props: UpdateDialogProps) {
  const {
    mode,
    currentVersion,
    update,
    checking,
    downloading,
    error,
    onModeChange,
    onClose,
  } = props;
  const dialogRef = useConfirmDialog(onClose, true);
  const notes = preferredReleaseNotes(update?.releaseNotes);
  const hasDownloaded =
    update?.status === "downloaded" ||
    update?.status === "scheduled" ||
    (update?.status === "error" && update.errorPhase === "install");
  const canDownload =
    update?.status === "available" ||
    (update?.status === "error" && update.errorPhase === "download");
  const currentRelease = releaseHistory.find(
    (entry) => entry.version === currentVersion,
  );
  const showCurrent =
    update?.status === "current" || update?.status === "unsupported";
  const visibleNotes = showCurrent ? (currentRelease?.notes ?? "") : notes;
  const title = checking
    ? "正在检查更新"
    : update?.status === "current"
      ? "当前已是最新版"
      : update?.latestVersion
        ? `CodexStyle v${update.latestVersion}`
        : "CodexStyle 更新";

  return (
    <div className="confirm-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="confirm-dialog update-dialog panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        tabIndex={-1}
      >
        <header className="update-dialog-heading">
          <div>
            <span className="update-dialog-kicker">CODEXSTYLE</span>
            <h2 id="update-dialog-title">更新与版本记录</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭更新窗口"
          >
            ×
          </button>
        </header>
        <div
          className="update-dialog-tabs"
          role="tablist"
          aria-label="更新信息"
        >
          {(["update", "history"] as const).map((tab) => (
            <button
              key={tab}
              id={`update-tab-${tab}`}
              role="tab"
              aria-selected={mode === tab}
              aria-controls={`update-panel-${tab}`}
              tabIndex={mode === tab ? 0 : -1}
              onClick={() => onModeChange(tab)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "update"
                    : event.key === "End"
                      ? "history"
                      : tab === "update"
                        ? "history"
                        : "update";
                onModeChange(next);
                dialogRef.current
                  ?.querySelector<HTMLButtonElement>(`#update-tab-${next}`)
                  ?.focus();
              }}
            >
              {tab === "update" ? "本次更新" : "历史更新"}
            </button>
          ))}
        </div>
        <div
          className="update-dialog-scroll"
          role="tabpanel"
          id={`update-panel-${mode}`}
          aria-labelledby={`update-tab-${mode}`}
        >
          {mode === "history" ? (
            <>
              <p className="update-history-hint">
                这里记录各版本发布的内容，可离线查看；当前运行版本为{" "}
                {currentVersion ? `v${currentVersion}` : "读取中"}。
              </p>
              <div className="release-history">
                {releaseHistory.map((entry, index) => (
                  <details
                    key={entry.version}
                    className="release-history-entry"
                    open={index === 0}
                  >
                    <summary>
                      <span className="release-history-version">
                        v{entry.version}
                        {entry.version === currentVersion && (
                          <span className="release-current-badge">
                            当前版本
                          </span>
                        )}
                      </span>
                      <time dateTime={entry.date}>{entry.date}</time>
                    </summary>
                    <ReleaseNotes notes={entry.notes} />
                  </details>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="update-release-heading">
                <h3>{title}</h3>
                <span>
                  当前版本 {currentVersion ? `v${currentVersion}` : "读取中"}
                </span>
                {update?.releaseDate && !showCurrent && (
                  <time dateTime={update.releaseDate}>
                    发布于 {update.releaseDate.slice(0, 10)}
                  </time>
                )}
              </div>
              {checking ? (
                <p className="update-dialog-status" role="status">
                  正在获取最新版本与更新说明…
                </p>
              ) : (
                <>
                  {update?.status === "unsupported" && (
                    <p className="update-dialog-status">
                      此版本不支持应用内更新。请从正式发布页面手动下载安装；下方仍可查看当前版本记录。
                    </p>
                  )}
                  {update?.status === "current" && (
                    <p className="update-dialog-status">
                      当前已是最新版 v{update.currentVersion}。
                    </p>
                  )}
                  <h4 className="update-notes-title">
                    {showCurrent ? "当前版本内容" : "更新了什么"}
                  </h4>
                  <ReleaseNotes notes={visibleNotes} />
                  {update?.status === "downloading" && (
                    <p className="update-dialog-status" role="status">
                      正在下载 {update.progress?.percent ?? 0}
                      %。关闭窗口不会中止下载。
                    </p>
                  )}
                  {hasDownloaded && (
                    <>
                      <p className="update-dialog-status">
                        更新已下载并通过完整性校验。请选择安装时机。
                      </p>
                      <p className="update-dialog-status">
                        安装包尚未代码签名，Windows 仍可能显示未知发布者。
                      </p>
                    </>
                  )}
                  {update?.status === "scheduled" && (
                    <p className="update-dialog-status">已安排退出时安装。</p>
                  )}
                  {update?.status === "installing" && (
                    <p className="update-dialog-status" role="status">
                      正在启动安装程序…
                    </p>
                  )}
                </>
              )}
              {error && (
                <p className="update-dialog-error" role="alert">
                  {error}
                </p>
              )}
              {canDownload && !update.confirmationId && (
                <p className="update-dialog-error" role="alert">
                  更新确认信息已失效，请重新检查更新后再下载。
                </p>
              )}
            </>
          )}
        </div>
        <footer className="update-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            关闭
          </button>
          {mode === "update" && (
            <>
              <button
                className="text-button"
                type="button"
                onClick={props.onOpenRelease}
              >
                查看发布页面
              </button>
              {update?.status === "downloading" ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={props.onCancelDownload}
                >
                  取消下载
                </button>
              ) : hasDownloaded ? (
                <>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => props.onInstall("on-quit")}
                    disabled={update?.status === "scheduled"}
                  >
                    退出时安装
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => props.onInstall("now")}
                  >
                    重启并安装
                  </button>
                </>
              ) : canDownload && update.confirmationId ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={checking || downloading}
                  onClick={() => props.onDownload(update.confirmationId!)}
                >
                  {downloading ? "正在准备下载…" : "下载更新"}
                </button>
              ) : update?.status !== "unsupported" &&
                update?.status !== "installing" ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={checking || downloading}
                  onClick={props.onCheck}
                >
                  {checking ? "检查中…" : "重新检查更新"}
                </button>
              ) : null}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function ReleaseNotes({ notes }: { notes: string }) {
  // 说明是不可信文本：仅将已知 Markdown 行前缀用于排版，不解释 HTML、链接或图片。
  return notes ? (
    <div className="release-notes">
      {notes
        .split(/\r?\n/u)
        .filter((line) => line.trim())
        .map((line, index) => (
          <p
            key={index}
            className={
              line.startsWith("> ")
                ? "release-notes-advice"
                : line.startsWith("- ")
                  ? "release-notes-item"
                  : undefined
            }
          >
            {line.replace(/^(?:> |- )/u, "")}
          </p>
        ))}
    </div>
  ) : (
    <p className="release-notes-empty">
      此版本暂未提供更新说明。你仍可查看发布页面或继续更新。
    </p>
  );
}
