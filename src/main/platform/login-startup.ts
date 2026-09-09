import { app } from "electron";
import type { StartupSettings } from "../../contracts";

const LOGIN_ITEM_NAME = "CodexStyle";

/**
 * Owns only this user's CodexStyle login entry. Windows is the source of truth:
 * reading never registers an entry, so new installations default to off and
 * Task Manager changes survive restarts. The renderer cannot supply a path.
 */
export class LoginStartupSettings {
  snapshot(): StartupSettings {
    if (process.platform !== "win32" || !app.isPackaged)
      return { supported: false, enabled: false };
    const path = app.getPath("exe");
    const settings = app.getLoginItemSettings({ path, args: [] });
    return {
      supported: true,
      enabled:
        settings.openAtLogin &&
        settings.launchItems.some(
          (item) =>
            item.name === LOGIN_ITEM_NAME &&
            item.scope === "user" &&
            item.enabled,
        ),
    };
  }

  setEnabled(enabled: boolean): StartupSettings {
    if (process.platform !== "win32" || !app.isPackaged)
      throw new Error("STARTUP_UNSUPPORTED");
    // Both directions address the same fixed entry. Never register the dev
    // Electron binary, auto-enable at startup, or launch the managed Codex here.
    app.setLoginItemSettings({
      name: LOGIN_ITEM_NAME,
      path: app.getPath("exe"),
      args: [],
      openAtLogin: enabled,
      enabled,
    });
    const actual = this.snapshot();
    if (actual.enabled !== enabled) throw new Error("STARTUP_SETTINGS_FAILED");
    return actual;
  }
}
