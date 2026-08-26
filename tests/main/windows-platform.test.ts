import { afterEach, describe, expect, it, vi } from "vitest";

const execFileAsync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => {
  const execFile = vi.fn();
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), {
    value: execFileAsync,
  });
  return { execFile };
});

import { WindowsPlatform } from "../../src/main/platform/windows";

const packageInfo = {
  name: "OpenAI.Codex",
  fullName: "OpenAI.Codex_26.820.7780.0_x64__publisher",
  familyName: "OpenAI.Codex_publisher",
  installLocation: "C:\\Program Files\\WindowsApps\\OpenAI.Codex",
  applicationId: "App",
  aumid: "OpenAI.Codex_publisher!App",
  executablePath:
    "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\ChatGPT.exe",
};

describe("WindowsPlatform", () => {
  afterEach(() => {
    execFileAsync.mockReset();
    vi.restoreAllMocks();
  });

  it("accepts the forward-slash executable path used by current Store manifests", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    execFileAsync.mockResolvedValue({
      stdout: JSON.stringify({
        name: "OpenAI.Codex",
        fullName: "OpenAI.Codex_26.820.7780.0_x64__publisher",
        familyName: "OpenAI.Codex_publisher",
        installLocation: "C:\\Program Files\\WindowsApps\\OpenAI.Codex",
        applicationId: "App",
        executable: "app/ChatGPT.exe",
      }),
      stderr: "",
    });

    await expect(new WindowsPlatform().findStorePackage()).resolves.toEqual({
      name: "OpenAI.Codex",
      fullName: "OpenAI.Codex_26.820.7780.0_x64__publisher",
      familyName: "OpenAI.Codex_publisher",
      installLocation: "C:\\Program Files\\WindowsApps\\OpenAI.Codex",
      applicationId: "App",
      aumid: "OpenAI.Codex_publisher!App",
      executablePath:
        "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\ChatGPT.exe",
    });

    const powershellArguments = execFileAsync.mock.calls[0]?.[1] as
      | string[]
      | undefined;
    expect(powershellArguments?.at(-1)).toContain("'app/ChatGPT.exe'");
  });

  it("activates the Store AUMID with arguments and returns the activated PID", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    execFileAsync.mockResolvedValue({ stdout: "4242\r\n", stderr: "" });
    const nonce = "a".repeat(64);

    await expect(
      new WindowsPlatform().launchStore(packageInfo, nonce, 9222),
    ).resolves.toBe(4242);

    expect(execFileAsync).toHaveBeenCalledOnce();
    expect(execFileAsync.mock.calls[0]?.[0]).toBe("powershell.exe");
    const powershellArguments = execFileAsync.mock.calls[0]?.[1] as
      | string[]
      | undefined;
    const script = powershellArguments?.at(-1);
    expect(script).toContain("IApplicationActivationManager");
    expect(script).toContain(packageInfo.aumid);
    expect(script).toContain(`--codexstyle-launch=${nonce}`);
    expect(script).toContain("--remote-debugging-port=9222");
    expect(script).not.toContain("explorer.exe");
  });

  it("rejects activation results without a valid PID", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    execFileAsync.mockResolvedValue({ stdout: "", stderr: "" });

    await expect(
      new WindowsPlatform().launchStore(packageInfo, "b".repeat(64), 9222),
    ).rejects.toThrow("STORE_ACTIVATION_FAILED");
  });
});
