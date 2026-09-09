import { useCallback, useEffect, useRef, useState } from "react";
import type { StartupSettings } from "../../../contracts";
import { bridge } from "../../api/bridge";

/** App-wide setting, separate from theme drafts; acknowledge only OS readback. */
export function StartupSetting() {
  const [settings, setSettings] = useState<StartupSettings>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    const current = ++generation.current;
    setBusy(true);
    try {
      const result = await bridge.getStartupSettings();
      if (current !== generation.current) return;
      if (!result.ok) throw new Error("read-failed");
      setSettings(result.data);
      setError("");
    } catch {
      if (current === generation.current) {
        setSettings(undefined);
        setError("无法读取自启动设置，请重试。");
      }
    } finally {
      if (current === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      generation.current++;
      pending.current = false;
    };
  }, [refresh]);

  const change = async (enabled: boolean) => {
    if (pending.current) return;
    pending.current = true;
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await bridge.setStartupSettings({ enabled });
      if (current !== generation.current) return;
      if (!result.ok) throw new Error("write-failed");
      setSettings(result.data);
    } catch {
      // A Windows write may partially succeed. Read back before displaying a
      // state, but retain the failure feedback so users can retry explicitly.
      const actual = await bridge.getStartupSettings().catch(() => undefined);
      if (current === generation.current) {
        setSettings(actual?.ok ? actual.data : undefined);
        setError("自启动设置未保存，请重试。");
      }
    } finally {
      if (current === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <div className="startup-setting" aria-busy={busy}>
      <label className="startup-setting-row">
        <span>开机自启动</span>
        <input
          type="checkbox"
          role="switch"
          checked={settings?.enabled ?? false}
          disabled={busy || !settings?.supported}
          aria-describedby="startup-setting-hint"
          onChange={(event) => void change(event.target.checked)}
        />
      </label>
      <small id="startup-setting-hint" aria-live="polite">
        {error ||
          (busy
            ? "正在同步设置…"
            : settings?.supported === false
              ? "请在 Windows 正式版本中设置。"
              : "登录 Windows 后启动 CodexStyle")}
      </small>
      {error && (
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          重试读取
        </button>
      )}
    </div>
  );
}
