# Changelog

## v1.3.5 — 2026-08-29

### English

- Added thirteen bundled wallpaper presets, each with a matching eighteen-color palette, light or dark appearance, artwork focus, background scope, surface opacity, and configured component styling.
- Added a strict main-process preset catalog with bounded image decoding, SHA-256 verification, stable pack/theme identifiers, and fixed ASAR packaging; renderer, preload, and IPC receive no asset paths or image bytes.
- Added one-time, atomic preset installation for both new and existing libraries. Existing themes, ordering, selection, last-known-good state, pause state, and checkpoints are preserved; failures roll back staged images and index changes.
- Added regression and release-package coverage for first install, upgrade, duplicate prevention, delete-without-revival, tampered assets, write rollback, packaged ASAR hashes, and a real packaged-runtime smoke test.

> v1.3.5 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall is required, and local themes are preserved.

### 简体中文

- 新增 13 套内置壁纸预设；每套都带完整十八色、浅色或深色外观、画面焦点、背景范围、表面透明度和组件样式配置。
- 新增严格的主进程预设目录：有界解码图片、校验 SHA-256、固定 pack/theme 标识并打入 ASAR；renderer、preload 和 IPC 不接收资源路径或图片字节。
- 新增适用于全新及已有主题库的一次性原子安装。已有主题、顺序、当前选择、last-known-good、暂停状态和 checkpoint 均保持不变；任一步骤失败都会回滚暂存图片和索引变更。
- 补充首次安装、升级、不重复、删除不复活、资产篡改、写入回滚、安装包 ASAR 哈希及真实成品启动烟测的回归与发布验证。

> SignPath Foundation 申请仍在审核，v1.3.5 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载，本地主题会保留。

## v1.3.4 — 2026-08-28

### English

- Added an explicit, confirmed “Discard current changes” action that restores the latest committed theme or a new theme's creation state, including colors, CSS, background artwork, send icons, and advanced JSON, without deleting the theme or changing its next-launch selection.
- Upgraded the managed theme index to v2 with durable edit checkpoints, copy-on-write image replacement/recovery, globally unique image IDs, monotonic replacement revisions, v1 migration, and fail-closed rollback/tamper checks.
- Added a quiet installed-build update check shortly after startup and every 20 minutes thereafter. Background checks only read the fixed GitHub Release metadata, never download automatically, preserve stable state on failure, and avoid overlapping slow requests.
- Replaced the reset-like update glyph with a download/install icon, added a nearby “new version available” status pill, improved tray update states, and upgraded regular IPC to protocol v3 while retaining the v1 bootstrap handshake.

> v1.3.4 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall is required, and local themes are preserved.

### 简体中文

- 新增明确且带二次确认的“放弃本次修改”：可恢复最近一次保存状态或新主题的创建初始状态，覆盖颜色、CSS、背景、发送图标和高级 JSON；不会删除主题，也不会改变下次启动选择。
- 受管主题索引升级至 v2：加入持久化编辑 checkpoint、图片 copy-on-write 替换与恢复、全局唯一图片 ID、单调递增的导入替换 revision、v1 迁移，以及 fail closed 的回滚与防篡改校验。
- 正式安装版会在启动后静默检查一次更新，之后每 20 分钟检查。后台只读取固定 GitHub Release 元数据，不自动下载；失败保持稳定状态，慢请求也不会重叠。
- 更新入口改用下载/安装语义图标，按钮旁新增“有新版可用”状态提示，完善托盘更新状态；普通 IPC 升级至 v3，同时保留 v1 bootstrap 握手。

> SignPath Foundation 申请仍在审核，v1.3.4 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载，本地主题会保留。

## v1.3.3 — 2026-08-28

### English

- Prevented invalid color values from reaching theme-save IPC, added field-level format guidance, and recorded only safe Zod issue paths/codes for rejected requests.
- Upgraded regular IPC to protocol v2 while retaining a narrow bootstrap handshake, so a renderer loaded by an older resident tray process shows an explicit full-exit/restart screen instead of failing later during save.
- Made color-only themes complete by creating an atomic transparent PNG for new drafts and safely backfilling precisely recognized older backgroundless drafts during commit. Unknown or damaged records remain fail-closed.
- Made the muted “input placeholder and explanatory text” color visible in the preview and bridged supported composer placeholder selectors in real Codex, while retaining separate toolbar and primary-action colors.
- Added privacy-bounded daily JSONL diagnostics with 5 MiB segments, seven-day retention, startup/24-hour cleanup, secret/path/query sanitization, and a Studio button that opens the log directory.

> v1.3.3 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall is required, and local themes are preserved.

### 简体中文

- 阻止非法颜色进入主题保存 IPC，增加字段级格式说明，并且只为被拒绝请求记录安全的 Zod 字段路径与错误码。
- 普通 IPC 升级至 v2，同时保留收窄的启动握手；如果新版 renderer 被旧托盘主进程加载，会明确提示完全退出并重启，不再等到保存时才失败。
- 新建主题原子创建透明 PNG，使只配颜色的主题可以直接保存；提交时也会安全补齐精确识别出的历史无背景草稿，未知或损坏记录继续 fail closed。
- “输入占位与说明文字”颜色在预览中不再被额外淡化，并桥接到真实 Codex composer 的受支持占位选择器；工具栏和主要操作仍使用各自颜色。
- 新增受隐私边界约束的按日 JSONL 诊断日志：5 MiB 分段、保留 7 天、启动及每 24 小时清理、密钥/路径/URL 查询脱敏，并可在工作台打开日志目录。

> SignPath Foundation 申请仍在审核，v1.3.3 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载，本地主题会保留。

## v1.3.2 — 2026-08-28

### English

- Fixed a startup failure that treated a valid selector-profile v6 ownership record as tampered after upgrading to selector profile v7.
- Prevented process-only startup failures by removing the blocking cache-clear dependency, serializing second-instance requests behind initialization, and reporting initialization errors through a native dialog.
- Added a renderer-ready handshake, guarded window display, and one bounded BrowserWindow rebuild for navigation, preload, renderer-process, or startup-timeout failures while keeping the renderer sandbox enabled.
- Added regression coverage for startup ordering, single-instance queuing, stale window events, bounded recovery, and the v6 ownership migration.
- Added the project code-signing policy and privacy notice required for the pending SignPath Foundation open-source application. This release remains unsigned.

> If v1.3.1 stays running in the background without opening a window, manually download and run the v1.3.2 installer once because the in-app updater is unavailable in that state. Install over the existing copy—no uninstall is required, and local themes are preserved. The v1.3.2 binaries are not code-signed, so Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer.

### 简体中文

- 修复 selector profile 升级至 v7 后，将合法的 v6 ownership 记录误判为篡改而导致的启动失败。
- 移除会阻塞首屏的缓存清理依赖，将第二实例请求排队到初始化完成后，并通过原生对话框显示初始化错误，避免只剩后台进程。
- 新增 renderer-ready 握手、受控窗口显示，以及针对导航、preload、renderer 进程和启动超时的单次有界 BrowserWindow 重建，同时保持 renderer 沙箱开启。
- 为启动顺序、单实例排队、旧窗口事件、有界恢复和 v6 ownership 迁移补充回归测试。
- 补充 SignPath Foundation 开源申请所需的代码签名政策和隐私声明；本版本仍未签名。

> 如果 v1.3.1 只在后台运行而无法打开窗口，需要手动下载并运行一次 v1.3.2 安装程序，因为该状态下无法使用应用内更新。直接覆盖原安装即可，无需先卸载，本地主题会保留。v1.3.2 构建产物尚未进行代码签名，Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。

## v1.3.1 — 2026-08-28

### English

- Fixed packaged update checks by normalizing `electron-updater` exports across CommonJS and Electron/Node ESM dynamic imports.
- Added deterministic validation for the updater and cancellation-token exports, with regression coverage for the real mixed namespace/default export shape.
- Reworded update-check failures so non-network errors are no longer incorrectly reported as GitHub connection failures.

> Users on v1.3.0 or earlier must manually download and run the v1.3.1 installer once; those clients cannot reliably discover this updater fix in-app. Install over the existing copy—no uninstall is required. The v1.3.1 binaries are not code-signed, so Windows SmartScreen may display an unknown-publisher warning. Verify `SHA256SUMS.txt` before running the installer.

### 简体中文

- 修复正式打包版本的更新检查：兼容 `electron-updater` 在 CommonJS 与 Electron/Node ESM 动态导入下的不同导出形态。
- 对 updater 与取消令牌导出增加确定性校验，并用真实的 namespace/default 混合形态补充回归测试。
- 调整更新检查失败文案，不再把非网络错误误报成 GitHub 连接失败。

> v1.3.0 及更早版本必须手动下载并运行一次 v1.3.1 安装程序；这些旧版本无法可靠地通过应用内检查发现本次更新器修复。直接覆盖原安装即可，无需先卸载。v1.3.1 构建产物尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。

## v1.3.0 — 2026-08-28

### English

- Added independent assistant-reply text color controls while preserving native link colors and code syntax highlighting.
- Added configurable file-change card background and text colors, including opacity, location-aware live-preview highlighting, and a compact change-card preview.
- Added selector profile v7 support for current Codex turn-diff cards. Ordinary card text follows the theme while green additions and red deletions retain their semantic colors.
- Expanded the normalized theme palette to eighteen colors with safe fallbacks for older saved themes, lossless current ZIP round trips, and explicit six-field downgrade behavior for v1.0.x–v1.2.x compatibility exports.

> The v1.3.0 binaries are not code-signed. Windows SmartScreen may display an unknown-publisher warning. Verify `SHA256SUMS.txt` before running a downloaded artifact.

### 简体中文

- 新增独立的“助手回复文字”颜色配置，同时保留原生链接颜色和代码语法高亮。
- 新增“文件变更背景、文件变更文字”配置，支持透明度、按位置高亮的实时预览，以及紧凑的变更卡片预览。
- selector profile 升级至 v7，适配当前 Codex 文件变更卡片；普通卡片文字跟随主题，绿色新增数和红色删除数继续保留语义色。
- 将规范化主题配色扩展至十八色；旧主题安全回退，当前主题 ZIP 无损往返，面向 v1.0.x–v1.2.x 的兼容导出会明确降级六个新字段。

> v1.3.0 构建产物尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”。运行下载文件前请核对 `SHA256SUMS.txt`。

## v1.2.0 — 2026-08-27

### English

- Reorganized Theme Studio colors into four location-based groups, with plain-language labels, hover and keyboard-focus preview locators, and an advanced view for raw token names.
- Added configurable user-message text, top-bar background, and top-bar text colors. The top bar defaults to transparent and now covers version-gated Store Codex application-menu and conversation-header selectors.
- Kept current and older themes safe across upgrades with optional color fallbacks, selector-profile v5 ownership recovery, and the user-facing “Previous session needs confirmation” state instead of internal orphan terminology.
- Split lossless current-theme ZIP export from explicit v1.0.x/v1.1.x-compatible export, backed by a frozen v1.0.x Safe CSS policy and clear guidance when advanced CSS requires the current format.
- Aligned live-preview message surfaces, opacity behavior, disabled artwork, and configured recipes with the real injected Codex styles.

> The v1.2.0 binaries are not code-signed. Windows SmartScreen may display an unknown-publisher warning. Verify `SHA256SUMS.txt` before running a downloaded artifact.

### 简体中文

- 将主题颜色整理为四个按页面位置划分的分组，使用直白名称；鼠标悬停或键盘聚焦时会在预览中定位影响区域，高级视图才显示原始 token 名称。
- 新增“我的消息文字、顶部栏背景、顶部栏文字”三项配置。顶部栏背景默认透明，并覆盖版本化受控的 Store Codex 应用菜单栏和会话标题栏选择器。
- 通过可选颜色回退、selector profile v5 ownership 恢复，以及“上次会话待确认”的用户文案，保证当前主题和旧主题升级时不会被误判为篡改。
- 将无损的当前主题 ZIP 与显式面向 v1.0.x/v1.1.x 的兼容 ZIP 分开导出；兼容路径使用冻结的 v1.0.x Safe CSS 策略，高级 CSS 不兼容时会明确提示改用完整格式。
- 统一 LIVE PREVIEW 与真实 Codex 注入的消息面板、透明度、关闭背景画面和组件配方效果。

> v1.2.0 构建产物尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”。运行下载文件前请核对 `SHA256SUMS.txt`。

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
