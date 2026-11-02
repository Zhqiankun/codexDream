import type { ThemeLiveApplyResult } from "../../../contracts";

// 保存按钮只据主进程确认的应用结果反馈，不能由下次启动选择或本地预览推断。
export function themeCommitMessage(result: ThemeLiveApplyResult): string {
  if (result.status === "applied") return "主题已保存，当前 Codex 窗口已更新。";
  if (result.status === "failed")
    return "主题已保存，但未能确认当前 Codex 窗口已更新。请查看会话状态。";
  if (result.reason === "paused")
    return "主题已保存。当前已暂停注入，窗口保持原样。";
  if (result.reason === "different-theme")
    return "主题已保存。当前 Codex 正在使用其他主题，窗口保持原样。";
  return "主题已保存。当前没有可更新的受管 Codex 会话。";
}
