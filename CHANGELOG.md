# Changelog

## v1.1.0 — 2026-08-27

### English

- Added user-triggered in-app updates for NSIS-installed Windows builds, including fixed-source checks, verified downloads, progress, cancellation, restart-to-install, and install-on-exit.
- Added fail-closed installed-build detection so development and portable ZIP builds never execute an update installer.
- Added `latest.yml`, NSIS blockmap, SHA-512, installation-marker, packaged-runtime, and immutable-Release verification to the Windows release pipeline.
- Fixed intermittent managed Codex startup failures by retrying an empty loopback listener and transient process/SID queries while still rejecting wrong listener PIDs and identity mismatches immediately.

> The v1.1.0 binaries are not code-signed. Windows SmartScreen may display an unknown-publisher warning. Verify `SHA256SUMS.txt` before running a downloaded artifact.

### 简体中文

- 为 Windows NSIS 正式安装版新增用户主动触发的应用内更新，包括固定来源检查、校验下载、进度、取消、重启安装和退出时安装。
- 新增失败即停止的安装版检测，开发版和 ZIP 便携版不会执行更新安装器。
- Windows 发布流水线新增 `latest.yml`、NSIS blockmap、SHA-512、安装标记、打包运行时及公开 Release 不可覆盖校验。
- 修复受管 Codex 偶发启动失败：回环端口尚未监听、进程或 SID 查询短暂不可用时会继续严格重试；监听 PID 或身份不匹配时仍立即拒绝。

> v1.1.0 构建产物尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”。运行下载文件前请核对 `SHA256SUMS.txt`。

## v1.0.1 — 2026-08-27

### English

- Made full-window theme backgrounds resilient across supported Codex DOM variations by applying the artwork to both the document root and canvas with fixed, covered positioning.
- Extended configured-mode runtime styling to headers, composer controls, submit buttons, user and assistant message surfaces, dialogs, selection colors, and content-only sidebars.
- Added confirmed local-theme deletion with revision checks, protected active/selected themes, managed background cleanup, and transactional rollback on storage failures.
- Added double-click activation for saved themes, simplified ordinary editing to one save action, and consolidated launch checks into clearer user-facing results without weakening identity or compatibility validation.
- Added tag-triggered GitHub Actions releases with full verification, Windows x64 packaging, retained workflow artifacts, and SHA-256 publication.
- Added English and Simplified Chinese README screenshots showing themed home and conversation views.

> The v1.0.1 binaries are not code-signed. Windows SmartScreen may display an unknown-publisher warning. Verify `SHA256SUMS.txt` before running a downloaded artifact.

### 简体中文

- 将全窗口背景同时应用到文档根节点和画布，并使用固定覆盖定位，提高主题背景对受支持 Codex DOM 变化的适应能力。
- 扩展配置模式的真实运行时样式，覆盖顶部栏、输入区控件、发送按钮、用户与助手消息面板、对话框、选区颜色及仅内容区模式下的侧栏。
- 新增带确认的本地主题删除，包含 revision 校验、使用中主题保护、受管背景清理和存储失败时的事务回滚。
- 新增双击启用已保存主题，将普通编辑收敛为单一保存入口，并把启动检查整理为更清晰的用户结果，同时保留完整身份与兼容性验证。
- 新增标签触发的 GitHub Actions 发布流程，执行完整验证、Windows x64 打包、工作流产物留档和 SHA-256 发布。
- 在中英文 README 中新增主题首页和对话页面效果截图。

> v1.0.1 构建产物尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”。运行下载文件前请核对 `SHA256SUMS.txt`。

## v1.0.0 — 2026-08-26

### English

- Added the local-first Theme Studio with live Codex home and conversation previews.
- Added theme presets, background positioning, color opacity, sidebar text colors, message surfaces, panel effects, and custom send icons.
- Added validated ZIP import/export, image decoding limits, constrained Safe CSS, and managed Windows x64 storage.
- Added verified Microsoft Store Codex launch, session ownership checks, compatibility detection, and fail-closed runtime theme injection.
- Added a dedicated application, installer, and tray icon set.
- Added user-initiated GitHub Release update checks. CodexStyle never checks in the background, downloads silently, or executes remote files.
- Added Windows x64 installer and portable ZIP artifacts with SHA-256 checksums.
- Added complete English and Simplified Chinese project documentation.

> The v1.0.0 binaries are not code-signed. Windows SmartScreen may display an unknown-publisher warning. Verify `SHA256SUMS.txt` before running a downloaded artifact.

### 简体中文

- 新增本地优先主题工作室，以及 Codex 首页和对话页面的实时预览。
- 新增主题预设、背景焦点、颜色透明度、侧栏文字颜色、消息面板、表面效果与自定义发送图标。
- 新增受校验的 ZIP 导入导出、图片解码限制、受约束 Safe CSS 和 Windows x64 受管存储。
- 新增 Microsoft Store Codex 受管启动、会话所有权验证、兼容性检测与失败即停止的运行时主题注入。
- 新增独立的应用、安装器和托盘图标。
- 新增用户主动触发的 GitHub Release 更新检查；不后台检查、不静默下载，也不执行远程文件。
- 新增 Windows x64 安装器、免安装 ZIP 和 SHA-256 校验文件。
- 新增完整的中英文项目文档。

> v1.0.0 构建产物尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”。运行下载文件前请核对 `SHA256SUMS.txt`。
