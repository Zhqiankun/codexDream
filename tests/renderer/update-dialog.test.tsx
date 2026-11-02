// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UpdateDialog, {
  type UpdateDialogProps,
} from "../../src/renderer/features/updates/UpdateDialog";
import {
  parseReleaseHistory,
  preferredReleaseNotes,
  releaseHistory,
} from "../../src/renderer/features/updates/release-history";

function dialogProps(): UpdateDialogProps {
  return {
    mode: "update",
    currentVersion: "1.3.8",
    update: {
      configured: true,
      status: "available",
      currentVersion: "1.3.8",
      latestVersion: "1.4.0",
      confirmationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
    checking: false,
    downloading: false,
    onModeChange: vi.fn(),
    onClose: vi.fn(),
    onCheck: vi.fn(),
    onDownload: vi.fn(),
    onCancelDownload: vi.fn(),
    onInstall: vi.fn(),
    onOpenRelease: vi.fn(),
  };
}

describe("update release details", () => {
  afterEach(cleanup);

  it("renders untrusted release content as text without links or resource elements", () => {
    const props = dialogProps();
    props.update!.releaseNotes =
      '<img src="https://example.invalid/track" onerror="alert(1)">\n[升级](https://example.invalid/update)\n<script>alert(2)</script>';
    const { container } = render(<UpdateDialog {...props} />);
    expect(screen.getByText("<script>alert(2)</script>")).toBeInTheDocument();
    expect(
      screen.getByText("[升级](https://example.invalid/update)"),
    ).toBeInTheDocument();
    expect(container.querySelector("img, a, script, iframe")).toBeNull();
  });

  it("allows a confirmed download when release notes are missing", () => {
    const props = dialogProps();
    render(<UpdateDialog {...props} />);
    expect(screen.getByText(/此版本暂未提供更新说明/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下载更新" }));
    expect(props.onDownload).toHaveBeenCalledWith(props.update!.confirmationId);
  });

  it("requires another check when no server confirmation token exists", () => {
    const props = dialogProps();
    props.update!.confirmationId = undefined;
    render(<UpdateDialog {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("更新确认信息已失效");
    expect(
      screen.queryByRole("button", { name: "下载更新" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新检查更新" }));
    expect(props.onCheck).toHaveBeenCalledOnce();
    expect(props.onDownload).not.toHaveBeenCalled();
  });

  it("keeps download work separate from closing the dialog and shows current progress", () => {
    const props = dialogProps();
    props.update = {
      ...props.update!,
      status: "downloading",
      releaseNotes: "- 这份说明在下载期间仍然可见。",
      progress: {
        percent: 42,
        transferredBytes: 42,
        totalBytes: 100,
        bytesPerSecond: 10,
      },
    };
    render(<UpdateDialog {...props} />);
    expect(
      screen.getByText("这份说明在下载期间仍然可见。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在下载 42%");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onCancelDownload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消下载" }));
    expect(props.onCancelDownload).toHaveBeenCalledOnce();
  });

  it("contains keyboard focus and navigates between the two tabs", () => {
    const props = dialogProps();
    render(<UpdateDialog {...props} />);
    const close = screen.getByRole("button", { name: "关闭更新窗口" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "下载更新" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "本次更新" }), {
      key: "ArrowRight",
    });
    expect(props.onModeChange).toHaveBeenCalledWith("history");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("parses stable versions newest first and prefers Chinese notes without treating older headings as content", () => {
    expect(
      parseReleaseHistory(`# Changelog
## v1.2.0 — 2026-10-01
### English
- English change.
### 简体中文
- 中文改动。
## v1.10.0 - 2026-11-01
- 较新的改动。
`),
    ).toEqual([
      { version: "1.10.0", date: "2026-11-01", notes: "- 较新的改动。" },
      { version: "1.2.0", date: "2026-10-01", notes: "- 中文改动。" },
    ]);
    expect(
      preferredReleaseNotes("### English\n- Fallback.\n### Other\nIgnored."),
    ).toBe("- Fallback.");
    expect(releaseHistory.some((entry) => entry.version === "1.3.8")).toBe(
      true,
    );
    expect(releaseHistory.every((entry) => entry.notes.length > 0)).toBe(true);
  });
});
