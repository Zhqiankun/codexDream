import { useEffect, useRef, type RefObject } from "react";

// 确认与更新弹窗共用焦点圈定；调用方决定 Escape 是否可关闭。
export function useConfirmDialog(
  onCancel: () => void,
  canDismiss: boolean,
): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const dismissRef = useRef(canDismiss);
  useEffect(() => {
    cancelRef.current = onCancel;
    dismissRef.current = canDismiss;
  }, [canDismiss, onCancel]);
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const dialog = dialogRef.current;
    const focusable = dialog ? dialogFocusableElements(dialog) : [];
    (focusable[0] ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissRef.current) {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const entries = dialogFocusableElements(dialogRef.current);
      if (entries.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = entries[0];
      const last = entries.at(-1)!;
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const previousDisabled =
        previousFocus instanceof HTMLButtonElement && previousFocus.disabled;
      if (
        previousFocus?.isConnected &&
        previousFocus.tabIndex >= 0 &&
        !previousDisabled
      ) {
        previousFocus.focus();
        return;
      }
      document
        .querySelector<HTMLElement>(
          '.studio-tabs [role="tab"][aria-selected="true"]:not(:disabled)',
        )
        ?.focus();
    };
  }, []);
  return dialogRef;
}

function dialogFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), summary, [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.tabIndex >= 0);
}
