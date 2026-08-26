import { execFile } from "node:child_process";
import { win32 } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const POWER_SHELL_TIMEOUT_MS = 10_000;
const STORE_ACTIVATION_SOURCE = String.raw`
using System;
using System.Runtime.InteropServices;

namespace CodexStyle
{
    [Flags]
    internal enum ActivateOptions
    {
        None = 0
    }

    [ComImport]
    [Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            ActivateOptions options,
            out uint processId);
    }

    [ComImport]
    [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    internal class ApplicationActivationManager
    {
    }

    public static class StoreApplicationActivator
    {
        public static uint Activate(string appUserModelId, string arguments)
        {
            var manager = (IApplicationActivationManager)new ApplicationActivationManager();
            try
            {
                uint processId;
                var result = manager.ActivateApplication(
                    appUserModelId,
                    arguments,
                    ActivateOptions.None,
                    out processId);
                Marshal.ThrowExceptionForHR(result);
                return processId;
            }
            finally
            {
                Marshal.FinalReleaseComObject(manager);
            }
        }
    }
}`;

export interface StorePackage {
  name: string;
  fullName: string;
  familyName: string;
  installLocation: string;
  applicationId: string;
  aumid: string;
  executablePath: string;
}

export interface ProcessIdentity {
  pid: number;
  executablePath: string;
  startedAt?: string;
  commandLine?: string;
}

export class WindowsPlatform {
  async findStorePackage(): Promise<StorePackage | undefined> {
    if (process.platform !== "win32") return undefined;
    const script = [
      "$package = @(Get-AppxPackage -Name 'OpenAI.Codex' | Where-Object { $_.SignatureKind -eq 'Store' -and $_.IsDevelopmentMode -eq $false } | Select-Object -First 1)",
      "if ($package.Count -ne 1) { exit 2 }",
      "$manifest = Get-AppxPackageManifest -Package $package[0].PackageFullName",
      "$application = @($manifest.Package.Applications.Application | Where-Object { $_.Executable -in @('app\\ChatGPT.exe', 'app/ChatGPT.exe') } | Select-Object -First 1)",
      "if ($application.Count -ne 1) { exit 3 }",
      "[pscustomobject]@{ name=$package[0].Name; fullName=$package[0].PackageFullName; familyName=$package[0].PackageFamilyName; installLocation=$package[0].InstallLocation; applicationId=$application[0].Id; executable=$application[0].Executable } | ConvertTo-Json -Compress",
    ].join("; ");
    try {
      const result = await runPowerShell(script, 256 * 1024);
      const parsed: unknown = JSON.parse(result.stdout.trim());
      if (!isRecord(parsed) || !isPackageRecord(parsed)) return undefined;
      if (!samePath(parsed.executable, "app\\ChatGPT.exe")) return undefined;
      const executablePath = win32.join(
        parsed.installLocation,
        "app",
        "ChatGPT.exe",
      );
      return {
        name: parsed.name,
        fullName: parsed.fullName,
        familyName: parsed.familyName,
        installLocation: parsed.installLocation,
        applicationId: parsed.applicationId,
        aumid: `${parsed.familyName}!${parsed.applicationId}`,
        executablePath,
      };
    } catch {
      return undefined;
    }
  }

  async listCodexProcesses(
    executablePath?: string,
  ): Promise<ProcessIdentity[]> {
    if (process.platform !== "win32") return [];
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name='ChatGPT.exe'\" | Select-Object ProcessId,ExecutablePath,CreationDate,CommandLine | ConvertTo-Json -Compress";
    try {
      const result = await runPowerShell(script, 512 * 1024);
      const raw = result.stdout.trim();
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const identities: ProcessIdentity[] = [];
      for (const row of rows) {
        if (!isRecord(row)) throw new Error("TARGET_IDENTITY_MISMATCH");
        const pid = row.ProcessId;
        const path = row.ExecutablePath;
        if (
          typeof pid !== "number" ||
          !Number.isSafeInteger(pid) ||
          pid < 1 ||
          (executablePath !== undefined && typeof path !== "string")
        )
          throw new Error("TARGET_IDENTITY_MISMATCH");
        const identity: ProcessIdentity = {
          pid,
          executablePath: typeof path === "string" ? path : "",
          startedAt:
            typeof row.CreationDate === "string" && row.CreationDate
              ? row.CreationDate
              : undefined,
          commandLine:
            typeof row.CommandLine === "string" && row.CommandLine
              ? row.CommandLine
              : undefined,
        };
        if (
          !executablePath ||
          samePath(identity.executablePath, executablePath)
        )
          identities.push(identity);
      }
      return identities;
    } catch {
      throw new Error("TARGET_IDENTITY_MISMATCH");
    }
  }

  async currentUserSid(): Promise<string | undefined> {
    if (process.platform !== "win32") return undefined;
    try {
      const result = await runPowerShell(
        "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
        16 * 1024,
      );
      const sid = result.stdout.trim();
      return isSid(sid) ? sid : undefined;
    } catch {
      return undefined;
    }
  }

  async processOwnerSid(pid: number): Promise<string | undefined> {
    if (process.platform !== "win32" || !isPid(pid)) return undefined;
    const script = [
      `$process = Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\"`,
      "if ($null -eq $process) { exit 2 }",
      "$owner = Invoke-CimMethod -InputObject $process -MethodName GetOwner",
      "if ($null -eq $owner.User -or $null -eq $owner.Domain) { exit 3 }",
      '$account = New-Object System.Security.Principal.NTAccount("$($owner.Domain)\\$($owner.User)")',
      "$account.Translate([System.Security.Principal.SecurityIdentifier]).Value",
    ].join("; ");
    try {
      const result = await runPowerShell(script, 16 * 1024);
      const sid = result.stdout.trim();
      return isSid(sid) ? sid : undefined;
    } catch {
      return undefined;
    }
  }

  async listeningPids(port: number): Promise<number[]> {
    if (process.platform !== "win32" || !isPort(port)) return [];
    const script = `Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ConvertTo-Json -Compress`;
    try {
      const result = await runPowerShell(script, 64 * 1024);
      const raw = result.stdout.trim();
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      const values = Array.isArray(parsed) ? parsed : [parsed];
      const pids = values.filter(
        (value): value is number =>
          typeof value === "number" && Number.isSafeInteger(value) && value > 0,
      );
      return [...new Set(pids)];
    } catch {
      return [];
    }
  }

  async launchStore(
    packageInfo: StorePackage,
    nonce: string,
    port: number,
  ): Promise<number> {
    if (
      process.platform !== "win32" ||
      !isPort(port) ||
      !/^[a-f0-9]{64}$/u.test(nonce) ||
      !isAumid(packageInfo.aumid)
    )
      throw new Error("STORE_ACTIVATION_FAILED:arguments");
    const argument = `--codexstyle-launch=${nonce} --remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`;
    const script = [
      "$activationSource = @'",
      STORE_ACTIVATION_SOURCE,
      "'@",
      "Add-Type -TypeDefinition $activationSource -Language CSharp -ErrorAction Stop",
      `$activatedProcessId = [CodexStyle.StoreApplicationActivator]::Activate('${packageInfo.aumid}', '${argument}')`,
      "$activatedProcessId",
    ].join("\n");
    try {
      // IApplicationActivationManager is the supported AUMID activation path
      // that carries app-specific arguments and returns the activated PID.
      const result = await runPowerShell(script, 64 * 1024);
      const activatedProcessId = Number(result.stdout.trim());
      if (!isPid(activatedProcessId))
        throw new Error("STORE_ACTIVATION_FAILED:pid");
      return activatedProcessId;
    } catch {
      throw new Error("STORE_ACTIVATION_FAILED");
    }
  }
}

async function runPowerShell(script: string, maxBuffer: number) {
  return execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      windowsHide: true,
      timeout: POWER_SHELL_TIMEOUT_MS,
      maxBuffer,
    },
  );
}

function isPackageRecord(
  value: Record<string, unknown>,
): value is Record<
  | "name"
  | "fullName"
  | "familyName"
  | "installLocation"
  | "applicationId"
  | "executable",
  string
> {
  return (
    typeof value.name === "string" &&
    value.name === "OpenAI.Codex" &&
    typeof value.fullName === "string" &&
    typeof value.familyName === "string" &&
    typeof value.installLocation === "string" &&
    typeof value.applicationId === "string" &&
    typeof value.executable === "string" &&
    /^[A-Za-z0-9._-]{1,128}$/u.test(value.familyName) &&
    /^[A-Za-z0-9._-]{1,128}$/u.test(value.applicationId) &&
    value.fullName.length > 0 &&
    value.installLocation.length > 2
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function isPid(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 0x7fffffff;
}

function isSid(value: string): boolean {
  return /^S-1-(?:\d+-){1,14}\d+$/u.test(value);
}

function isAumid(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}![A-Za-z0-9._-]{1,128}$/u.test(value);
}

function samePath(left: string, right: string): boolean {
  return (
    left.replaceAll("/", "\\").toLowerCase() ===
    right.replaceAll("/", "\\").toLowerCase()
  );
}
