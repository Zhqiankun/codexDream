<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="CodexStyle icon">
</p>

<h1 align="center">CodexStyle</h1>

<p align="center">
  A local-first theme studio and managed launcher for OpenAI Codex Desktop on Windows.
</p>

<p align="center">
  <a href="https://github.com/Zhqiankun/codexDream/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Zhqiankun/codexDream?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/platform-Windows%20x64-0078D4?style=flat-square">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-2E8B57?style=flat-square">
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

CodexStyle lets you design, preview, save, import, and export visual themes for the Microsoft Store build of Codex Desktop. It applies a theme only to a Codex session launched and verified by CodexStyle, while leaving the installed Codex application untouched.

> [!IMPORTANT]
> CodexStyle is an independent community project. It is not affiliated with, endorsed by, or sponsored by OpenAI. Codex and OpenAI are trademarks of OpenAI.

## Highlights

- Live 16:9 previews for the Codex home and conversation views.
- Theme presets plus controls for colors, opacity, background images, panel styling, shadows, corner radius, sidebar text, message surfaces, and send icons.
- Validated background-image and custom-icon imports with clear size and format guidance.
- Local theme library with ordinary ZIP import and export.
- Optional constrained Safe CSS for advanced styling.
- A dedicated Windows app icon, tray icon, and packaged application identity.
- Managed Codex launch with Store package detection, session isolation, CDP identity checks, and selector-profile compatibility checks.
- Local-first storage with a native Windows x64 secure-store component.
- User-initiated update checks against this repository's latest stable GitHub Release, with no background polling or silent installation.

## Download

Download `v1.0.0` from [GitHub Releases](https://github.com/Zhqiankun/codexDream/releases/latest):

- `CodexStyle-1.0.0-x64.exe` — guided Windows installer.
- `CodexStyle-1.0.0-x64.zip` — portable archive.
- `SHA256SUMS.txt` — SHA-256 checksums for both binaries.

The release is currently unsigned. Windows SmartScreen may show an unknown-publisher warning; verify the SHA-256 checksum before running the application.

## Requirements

| Component        | Requirement                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| Operating system | Windows 10/11 x64                                                       |
| Codex            | Microsoft Store package `OpenAI.Codex`                                  |
| Network          | Not required for theme editing; Codex itself may require network access |
| Permissions      | Standard user account; no administrator privileges required by default  |

## Getting started

1. Install or extract CodexStyle from the latest release.
2. Open **Theme Studio** and choose a preset or create a theme.
3. Adjust the colors, opacity, panels, background, message surfaces, and send icon while checking the live preview.
4. Save the theme and open **Codex Session**.
5. Close externally launched Codex windows, select the saved theme, and choose **Launch Codex**.

CodexStyle verifies that the launched Store Codex session belongs to it before applying the selected theme. If the installed Codex build no longer matches the supported selector profile, CodexStyle stops at the compatibility boundary instead of injecting uncertain styles.

## Safety boundaries

CodexStyle is deliberately narrow in scope:

- It does not modify `WindowsApps`, `app.asar`, access-control lists, the official signature, or Windows execution policies.
- It does not take over, close, restart, or inject into Codex sessions launched outside CodexStyle.
- It applies themes at runtime only to an owned and verified session.
- It validates imported ZIP files, images, icons, and Safe CSS before storing or applying them.
- It performs no background update checks and includes no silent auto-installer or remote analytics service. GitHub is contacted only when the user chooses **Check for updates**.
- Managed data stays under `%LOCALAPPDATA%\CodexStyle` for the current Windows user.

See [REQUIREMENTS.md](REQUIREMENTS.md) for the complete product and security contract.

## Development

### Toolchain

- Windows x64
- Node.js `22.22.0`
- npm `10.9.4`
- Visual Studio Build Tools 2019 or 2022 with the MSVC x64 C++ workload
- Windows SDK `10.0.19041.0` or later

### Setup

```powershell
git clone https://github.com/Zhqiankun/codexDream.git
cd codexDream
npm ci
npm run dev
```

### Verification

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:renderer
npm run test:integration
npm run test:e2e
npm run architecture:check
```

`test:unit` builds the native secure-store from source. `test:e2e` prepares the locked Electron runtime, builds the app, and launches a real Electron shell against an isolated temporary local-data directory.

### Build Windows packages

```powershell
npm run package:win
npm run verify:package
```

Artifacts are written to `release/`. Packaging verifies the renderer and main-process resources, icons, Windows x64 executable, native addon architecture, and native addon loading.

## Project layout

```text
src/contracts/          Shared IPC and theme contracts
src/main/app/           Main-process application orchestration
src/main/domain/        Theme domain model
src/main/infra/         Local storage, ZIP, image, CSS, and native adapters
src/main/platform/      Windows Store and process integration
src/main/session/       Managed Codex session and theme injection
src/preload/            Narrow Electron preload bridge
src/renderer/           React Theme Studio and session UI
native/secure-store/    Windows x64 N-API secure-store source
tests/                  Unit, renderer, acceptance, and Electron E2E tests
```

Additional project documents:

- [REQUIREMENTS.md](REQUIREMENTS.md) — product contract and acceptance criteria.
- [PLAN.md](PLAN.md) — architecture and delivery plan.
- [TASK_PROGRESS.md](TASK_PROGRESS.md) — implementation and verification history.

## Contributing

Issues and pull requests are welcome. Keep changes within the documented trust boundary, preserve the one-way module dependencies, and include tests for behavior changes. Run the verification commands relevant to your change before opening a pull request.

## License

CodexStyle is released under the [MIT License](LICENSE).
