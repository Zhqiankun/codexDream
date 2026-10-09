import { useState } from "react";
import type { Result, SessionState, ThemeSnapshot } from "../../../contracts";
import { bridge } from "../../api/bridge";

export const SESSION_LABELS: Record<SessionState, string> = {
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

export function SessionLauncher({
  snapshot,
  busy,
  run,
}: {
  snapshot?: ThemeSnapshot;
  busy: boolean;
  run: <T>(
    operation: () => Promise<Result<T>>,
    onSuccess?: (data: T) => void,
  ) => Promise<T | undefined>;
}) {
  const [rechecking, setRechecking] = useState(false);
  const state = snapshot?.session.state ?? "NO_SESSION";
  const messageKey = snapshot?.session.messageKey;
  const ownedVerified = Boolean(snapshot?.session.canEnd);
  const checks = sessionCheckStates(state, messageKey, ownedVerified);
  const canRecheck =
    !snapshot?.paused &&
    !ownedVerified &&
    (state === "INCOMPATIBLE" ||
      state === "EXTERNAL_BLOCKED" ||
      state === "ORPHANED");
  const recheck = async () => {
    if (busy || rechecking) return;
    setRechecking(true);
    try {
      await run(() => bridge.recheckSession());
    } finally {
      setRechecking(false);
    }
  };
  return (
    <section
      className={`panel-card session-launcher state-${state}`}
      aria-label="Codex 会话启动"
    >
      <div className="session-launcher-main">
        <div className="session-launcher-icon" aria-hidden="true">
          C
        </div>
        <div className="session-launcher-copy">
          <span>CODEX 会话</span>
          <strong>
            {snapshot?.session.messageKey === "session.externalRunning"
              ? "检测到外部 Codex"
              : SESSION_LABELS[state]}
          </strong>
          <p>{messageForState(state, messageKey)}</p>
        </div>
      </div>
      <div className="session-launcher-side">
        <div className={`large-state state-${state}`}>
          <span className="status-dot" /> {SESSION_LABELS[state]}
        </div>
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
          {canRecheck && (
            <button
              className="secondary-button"
              disabled={busy || rechecking}
              aria-busy={rechecking}
              onClick={() => void recheck()}
            >
              {rechecking ? "检测中…" : "重新检测"}
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
      <div className="session-launcher-checks" aria-label="启动检查">
        <span className="session-checks-label">启动检查</span>
        <div>
          <CheckRow label="Store Codex 可启动" state={checks.package} />
          <CheckRow label="会话可安全管理" state={checks.ownership} />
          <CheckRow label="主题与当前版本兼容" state={checks.compatibility} />
        </div>
      </div>
      <p className="session-launcher-safety">
        外部启动的 Codex 不受控制；身份或选择器不兼容时保持原样。
      </p>
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

  if (state === "NO_SESSION" && messageKey === "session.preflightReady")
    return { ...checks, package: "pass" };

  if (state !== "INCOMPATIBLE") return checks;

  if (
    messageKey === "session.themeNotReady" ||
    messageKey === "session.themeUnsafe"
  )
    return { ...checks, compatibility: "fail" };

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
  if (state === "INCOMPATIBLE" && messageKey === "session.storePackageNotFound")
    return "未找到可用的 Microsoft Store Codex，请安装或更新后重新检测。";
  if (state === "INCOMPATIBLE" && messageKey === "session.themeNotReady")
    return "请先选择一个已保存的主题，再重新检测。";
  if (state === "INCOMPATIBLE" && messageKey === "session.themeUnsafe")
    return "所选主题的安全样式校验未通过，请修正主题后重新检测。";
  if (state === "INCOMPATIBLE" && messageKey === "session.recheckFailed")
    return "基础检查未能完成，请查看错误提示后重新检测。";
  if (state === "INCOMPATIBLE")
    return "当前 Store 版本未提供可验证的 CDP 或选择器，工具不会绕过安全边界。";
  if (state === "ORPHANED")
    return "检测到上次由 CodexStyle 启动的会话记录，但当前无法安全确认它仍受控。请先确认并关闭相关 Codex 窗口，再重新启动；CodexStyle 不会自动连接或关闭它。";
  if (state === "THEMED_SESSION")
    return "主题已经注入到本工具启动的 Codex 会话。";
  if (state === "PAUSED_FUTURE")
    return "已停止后续注入，当前页面不会被追溯修改。";
  if (state === "NO_SESSION" && messageKey === "session.preflightReady")
    return "基础检查已通过，可点击启动 Codex。会话身份与页面兼容性将在启动后验证。";
  return "选择一个已保存主题后启动 CodexStyle 管理的会话。";
}
