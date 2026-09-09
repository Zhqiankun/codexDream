// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridge } from "../../src/renderer/api/bridge";
import { StartupSetting } from "../../src/renderer/features/settings/StartupSetting";

vi.mock("../../src/renderer/api/bridge", () => ({
  bridge: { getStartupSettings: vi.fn(), setStartupSettings: vi.fn() },
}));

describe("startup setting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bridge.getStartupSettings).mockResolvedValue({
      ok: true,
      data: { supported: true, enabled: false },
    });
  });
  afterEach(cleanup);

  it("starts off and changes both directions only after Windows confirms", async () => {
    render(<StartupSetting />);
    const toggle = screen.getByRole("switch", { name: "开机自启动" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(bridge.setStartupSettings).not.toHaveBeenCalled();
    vi.mocked(bridge.setStartupSettings)
      .mockResolvedValueOnce({
        ok: true,
        data: { supported: true, enabled: true },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { supported: true, enabled: false },
      });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(bridge.setStartupSettings).toHaveBeenLastCalledWith({
      enabled: true,
    });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(bridge.setStartupSettings).toHaveBeenLastCalledWith({
      enabled: false,
    });
  });

  it("rereads external changes when the app regains focus", async () => {
    render(<StartupSetting />);
    const toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    vi.mocked(bridge.getStartupSettings).mockResolvedValue({
      ok: true,
      data: { supported: true, enabled: true },
    });
    fireEvent.focus(window);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(bridge.setStartupSettings).not.toHaveBeenCalled();
  });

  it("retains actual state and presents failure feedback after a rejected save", async () => {
    vi.mocked(bridge.setStartupSettings).mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", messageKey: "startup.writeFailed" },
    });
    render(<StartupSetting />);
    const toggle = screen.getByRole("switch");
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await screen.findByText("自启动设置未保存，请重试。");
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
  });

  it("keeps the control disabled when unavailable or unreadable", async () => {
    vi.mocked(bridge.getStartupSettings).mockRejectedValue(
      new Error("Windows unavailable"),
    );
    render(<StartupSetting />);
    await screen.findByText("无法读取自启动设置，请重试。");
    expect(screen.getByRole("switch")).toBeDisabled();
    vi.mocked(bridge.getStartupSettings).mockResolvedValue({
      ok: true,
      data: { supported: false, enabled: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "重试读取" }));
    await screen.findByText("请在 Windows 正式版本中设置。");
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
