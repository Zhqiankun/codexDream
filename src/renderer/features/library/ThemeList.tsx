import { useLayoutEffect, useRef } from "react";
import type { ThemeSummary } from "../../../contracts";

export function ThemeList({
  themes,
  selectedLibraryId,
  filterKey,
  filtering,
  onOpen,
  onActivate,
  onClearSearch,
}: {
  themes: ThemeSummary[];
  selectedLibraryId?: string;
  filterKey: string;
  filtering: boolean;
  onOpen: (libraryId: string) => void;
  onActivate: (theme: ThemeSummary) => void;
  onClearSearch: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const row = selectedRowRef.current;
    if (!list || !row || list.clientHeight === 0) return;
    // Scroll only the library viewport; keep the editor and window stationary.
    const top = list.getBoundingClientRect().top + list.clientTop;
    const bottom = top + list.clientHeight;
    const bounds = row.getBoundingClientRect();
    if (bounds.top < top) list.scrollTop += bounds.top - top;
    else if (bounds.bottom > bottom) list.scrollTop += bounds.bottom - bottom;
  }, [selectedLibraryId, filterKey]);

  return (
    <div
      ref={listRef}
      className={`theme-list ${filtering ? "is-filtering" : ""}`}
      aria-label="主题列表"
      aria-busy={filtering}
    >
      {themes.map((theme) => (
        <button
          key={theme.libraryId}
          ref={
            selectedLibraryId === theme.libraryId ? selectedRowRef : undefined
          }
          className={`theme-row ${selectedLibraryId === theme.libraryId ? "active" : ""}`}
          title={
            theme.status === "ready"
              ? "单击编辑，双击启用"
              : "单击编辑；保存后可双击启用"
          }
          onClick={() => onOpen(theme.libraryId)}
          onDoubleClick={() => onActivate(theme)}
        >
          <span
            className={`theme-swatch ${theme.backgroundThumbnailUrl ? "with-thumbnail" : "color-only"}`}
            style={{ background: theme.backgroundColor }}
            aria-hidden="true"
          >
            {theme.backgroundThumbnailUrl ? (
              <img
                src={theme.backgroundThumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : null}
          </span>
          <span className="theme-row-copy">
            <strong>{theme.name}</strong>
            <small>
              {theme.status === "ready" ? "已保存" : "草稿"} ·{" "}
              {theme.packageFormat === "formal" ? "正式包" : "主题包"}
            </small>
          </span>
          {theme.selectedForNextLaunch && <span className="check-mark">✓</span>}
        </button>
      ))}
      {themes.length === 0 ? (
        <div className="theme-list-empty" role="status">
          <span className="theme-list-empty-mark" aria-hidden="true">
            ◌
          </span>
          <strong>没有匹配的主题</strong>
          <small>换个名称，或清空搜索后查看全部主题。</small>
          <button type="button" onClick={onClearSearch}>
            清空搜索
          </button>
        </div>
      ) : null}
    </div>
  );
}
