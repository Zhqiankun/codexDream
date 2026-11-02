import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ThemeSummary } from "../../../contracts";

export interface ThemeMenuTarget {
  theme: ThemeSummary;
  x: number;
  y: number;
  trigger: HTMLButtonElement;
}

// 主题列表拥有菜单目标；菜单只负责浮层、焦点和关闭，不提交删除。
export function ThemeContextMenu({
  target,
  onClose,
  onDelete,
}: {
  target: ThemeMenuTarget;
  onClose: () => void;
  onDelete: (theme: ThemeSummary) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: target.x, y: target.y });

  const closeAndRestoreFocus = () => {
    if (target.trigger.isConnected) target.trigger.focus();
    onClose();
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(target.x, window.innerWidth - bounds.width - 8)),
      y: Math.max(
        8,
        Math.min(target.y, window.innerHeight - bounds.height - 8),
      ),
    });
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [target]);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      )
        onClose();
    };
    const closeOnViewportChange = () => onClose();
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="theme-context-menu"
      role="menu"
      aria-label={`“${target.theme.name}”的操作`}
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          closeAndRestoreFocus();
        }
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          // 确认弹窗的焦点恢复目标应为主题行，而非即将卸载的菜单项。
          closeAndRestoreFocus();
          onDelete(target.theme);
        }}
      >
        删除主题
      </button>
    </div>,
    document.body,
  );
}
