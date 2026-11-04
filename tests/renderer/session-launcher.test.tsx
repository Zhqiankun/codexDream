// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SessionCompatibility,
  SessionSnapshot,
  ThemeSnapshot,
} from "../../src/contracts";
import { SessionLauncher } from "../../src/renderer/features/session/SessionLauncher";

afterEach(cleanup);

function snapshot(session: Partial<SessionSnapshot> = {}): ThemeSnapshot {
  return {
    themes: [],
    selectedLibraryId: "11111111-1111-4111-8111-111111111111",
    paused: session.state === "PAUSED_FUTURE",
    session: {
      state: "THEMED_SESSION",
      messageKey: "session.themed",
      canEnd: true,
      launchedByTool: true,
      ...session,
    },
    update: {
      configured: false,
      status: "unsupported",
      currentVersion: "1.0.0",
    },
  };
}

const partial: SessionCompatibility = {
  status: "partial",
  unavailable: ["sidebar", "titlebar", "header", "reasoning-background"],
};

const run = vi.fn(async () => undefined);

describe("managed session compatibility feedback", () => {
  it("keeps the managed session usable and separates partial styling from identity checks", () => {
    render(
      <SessionLauncher
        snapshot={snapshot({ compatibility: partial })}
        busy={false}
        run={run}
      />,
    );

    const report = screen.getByRole("status", { name: "主题适配状态" });
    expect(report).toHaveTextContent("部分适配");
    expect(report).toHaveTextContent("侧栏样式暂不可用");
    expect(report).toHaveTextContent("标题栏样式暂不可用");
    expect(report).toHaveTextContent("页头样式暂不可用");
    expect(report).toHaveTextContent("档位切换暂不可用，已使用普通背景");
    expect(report).toHaveTextContent("其他可用效果继续生效");
    expect(screen.getByLabelText("Store Codex 可启动：通过")).toBeVisible();
    expect(screen.getByLabelText("会话可安全管理：通过")).toBeVisible();
    expect(screen.getByLabelText("主题与当前版本兼容：部分适配")).toBeVisible();
    expect(screen.getByRole("button", { name: "暂停后续注入" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "结束受管会话" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "启动 Codex" })).toBeNull();
  });

  it("clears a recovered warning only when the next snapshot confirms full support", () => {
    const { rerender } = render(
      <SessionLauncher
        snapshot={snapshot({ compatibility: partial })}
        busy={false}
        run={run}
      />,
    );

    rerender(
      <SessionLauncher
        snapshot={snapshot({
          compatibility: { status: "full", unavailable: [] },
        })}
        busy={false}
        run={run}
      />,
    );

    expect(screen.queryByRole("status", { name: "主题适配状态" })).toBeNull();
    expect(screen.getByLabelText("主题与当前版本兼容：通过")).toBeVisible();
    expect(screen.getByRole("button", { name: "暂停后续注入" })).toBeEnabled();
  });

  it.each([undefined, { status: "checking", unavailable: [] }] as const)(
    "does not claim full compatibility when the report is %s",
    (compatibility) => {
      render(
        <SessionLauncher
          snapshot={snapshot({
            compatibility: compatibility
              ? { ...compatibility, unavailable: [] }
              : undefined,
          })}
          busy={false}
          run={run}
        />,
      );

      expect(
        screen.getByRole("status", { name: "主题适配状态" }),
      ).toHaveTextContent("等待适配检查");
      expect(screen.getByLabelText("主题与当前版本兼容：等待")).toBeVisible();
      expect(screen.getByLabelText("会话可安全管理：通过")).toBeVisible();
    },
  );

  it.each(["PAUSED_FUTURE", "ORPHANED", "INJECTING"] as const)(
    "hides a stale compatibility report in %s",
    (state) => {
      render(
        <SessionLauncher
          snapshot={snapshot({
            state,
            canEnd: state !== "ORPHANED",
            compatibility: partial,
          })}
          busy={false}
          run={run}
        />,
      );

      expect(screen.queryByRole("status", { name: "主题适配状态" })).toBeNull();
      expect(screen.getByLabelText("主题与当前版本兼容：等待")).toBeVisible();
      expect(screen.queryByText(/已使用普通背景/u)).toBeNull();
    },
  );

  it("keeps an unrecognized main window blocked instead of presenting a styling fallback", () => {
    render(
      <SessionLauncher
        snapshot={snapshot({
          state: "INCOMPATIBLE",
          messageKey: "session.targetIncompatible",
          canEnd: false,
          launchedByTool: false,
          compatibility: partial,
        })}
        busy={false}
        run={run}
      />,
    );

    expect(
      screen.getByText(/无法唯一确认 Codex 主窗口，未注入主题/u),
    ).toBeVisible();
    expect(screen.getByLabelText("主题与当前版本兼容：未通过")).toBeVisible();
    expect(screen.queryByRole("status", { name: "主题适配状态" })).toBeNull();
    expect(screen.queryByRole("button", { name: "结束受管会话" })).toBeNull();
  });
});
