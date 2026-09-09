import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  isPackaged: true,
  getPath: vi.fn(() => "C:\\Program Files\\CodexStyle\\CodexStyle.exe"),
  getLoginItemSettings: vi.fn(),
  setLoginItemSettings: vi.fn(),
}));
vi.mock("electron", () => ({ app: host }));
import { LoginStartupSettings } from "../../src/main/platform/login-startup";

function nativeState(enabled: boolean, approved = enabled) {
  return {
    openAtLogin: enabled,
    launchItems: enabled
      ? [{ name: "CodexStyle", scope: "user", enabled: approved }]
      : [],
  };
}

describe("Windows login startup settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    host.isPackaged = true;
    host.getLoginItemSettings.mockReturnValue(nativeState(false));
  });

  it("defaults to off without registering anything, including repeated launches", () => {
    expect(new LoginStartupSettings().snapshot()).toEqual({
      supported: true,
      enabled: false,
    });
    expect(new LoginStartupSettings().snapshot().enabled).toBe(false);
    expect(host.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it("registers and removes the same fixed user entry, then reads back Windows state", () => {
    const settings = new LoginStartupSettings();
    host.getLoginItemSettings.mockReturnValue(nativeState(true));
    expect(settings.setEnabled(true).enabled).toBe(true);
    expect(host.setLoginItemSettings).toHaveBeenLastCalledWith({
      name: "CodexStyle",
      path: "C:\\Program Files\\CodexStyle\\CodexStyle.exe",
      args: [],
      openAtLogin: true,
      enabled: true,
    });
    expect(new LoginStartupSettings().snapshot().enabled).toBe(true);
    host.getLoginItemSettings.mockReturnValue(nativeState(false));
    expect(settings.setEnabled(false).enabled).toBe(false);
    expect(host.setLoginItemSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "CodexStyle",
        args: [],
        openAtLogin: false,
        enabled: false,
      }),
    );
  });

  it("reflects Task Manager disabling and ignores other launch entries", () => {
    host.getLoginItemSettings.mockReturnValue(nativeState(true, false));
    expect(new LoginStartupSettings().snapshot().enabled).toBe(false);
    host.getLoginItemSettings.mockReturnValue({
      openAtLogin: true,
      launchItems: [{ name: "Other", scope: "user", enabled: true }],
    });
    expect(new LoginStartupSettings().snapshot().enabled).toBe(false);
  });

  it("reports a Windows write that did not take effect", () => {
    expect(() => new LoginStartupSettings().setEnabled(true)).toThrow(
      "STARTUP_SETTINGS_FAILED",
    );
  });

  it("never registers development Electron", () => {
    host.isPackaged = false;
    expect(new LoginStartupSettings().snapshot()).toEqual({
      supported: false,
      enabled: false,
    });
    expect(() => new LoginStartupSettings().setEnabled(true)).toThrow(
      "STARTUP_UNSUPPORTED",
    );
    expect(host.getLoginItemSettings).not.toHaveBeenCalled();
    expect(host.setLoginItemSettings).not.toHaveBeenCalled();
  });
});
