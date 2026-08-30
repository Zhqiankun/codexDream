# Changelog

## v1.3.12 — 2026-08-30

### English

- Expanded the bundled wallpaper collection to 25 individually tuned themes and replaced the old base palette set with 15 modern-luxury presets spanning jewel tones, metals, velvet darks, and restrained pearl lights. Existing user themes remain untouched; exact untouched bundled themes migrate in place and deleted presets are not revived.
- Expanded structured color control to 29 values, including composer input text, send-icon foreground, and selection foreground. Fixed real Codex coverage for home/conversation composer surfaces, home titles and cards, current-thread tabs, assistant/user text, change cards, and command/edit/thinking summaries.
- Added the local CodexStyle Assistant plugin and authenticated loopback MCP bridge. A one-click Studio action installs or updates the fixed plugin through the verified local Codex CLI; the plugin ships its own Node.js 22.22.0 runtime and full license, so end users do not need Node.js or terminal commands. Codex can list themes, validate a complete palette, derive a separate draft while retaining its background, update only drafts, and explicitly select a saved theme. Saved themes cannot be overwritten through MCP.
- Added the CodexStyle theme-design skill. When the user gives no palette or visual direction it uses the bundled restrained modern-luxury brief; explicit colors, references, and styles always take priority. The Studio card now separates one-time plugin setup from everyday automatic connection and explains the review/save workflow.
- Made the left theme library viewport-bounded and independently scrollable, with instant normalized name search, match/total count, clear and no-result actions, and off-screen rendering optimization for large libraries. Mobile keeps the horizontal list.
- Hardened assistant validation by compositing translucent page backgrounds exactly once, rejecting out-of-range functional RGB channels, matching every RPC response ID, rotating authenticated local endpoints at startup, and rejecting browser-origin, malformed, oversized, or unauthorized requests.
- Pinned `js-yaml` to the fixed `4.3.2` release after the new merge-key/alias complexity advisories; the final official-registry production audit reports zero vulnerabilities.

> v1.3.12 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall or computer restart is required, and local themes are preserved. After enabling the plugin for the first time, create a new Codex task or restart Codex so it can load the plugin.

### 简体中文

- 将内置壁纸扩展为 25 套逐图独立调色主题，并用 15 套现代奢华基础预设替换旧基础配色，覆盖宝石色、金属、丝绒深色与克制珍珠浅色。用户已有主题保持不变；只原位迁移精确未编辑预设，删除过的预设不复活。
- 将结构化颜色扩展为 29 项，新增输入正文、发送图标前景和选区文字，并补齐首页/对话输入面板、首页标题与卡片、当前会话标签、助手/用户文字、文件变更卡片及命令/编辑/思考摘要的真实 Codex 覆盖。
- 新增本机 CodexStyle Assistant 插件与带认证的回环 MCP。Studio 可一键经已核对的本机 Codex CLI 安装或更新固定插件；插件自带 Node.js 22.22.0 专用运行时和完整许可证，最终用户不需要另装 Node.js 或执行终端命令。Codex 可以列出主题、校验完整配色、保留背景派生独立草稿、只更新草稿，以及在用户明确要求时选择已保存主题；MCP 不能覆盖已保存主题。
- 新增 CodexStyle 主题设计 Skill。用户未指定颜色或视觉方向时才使用内置的克制现代奢华提示；用户明确颜色、参考和风格始终优先。Studio 卡片现在明确区分“首次一次”插件设置与“以后每次”自动连接，并说明预览/保存流程。
- 左侧主题库改为视口内独立滚动，支持规范化名称即时搜索、匹配数/总数、清空与无结果操作，并对大型列表跳过离屏渲染；移动端继续使用横向列表。
- 加固助手校验：半透明页面背景只合成一次，拒绝超出范围的函数式 RGB 通道，严格匹配 RPC 响应 ID；本机认证端点随启动轮换，并拒绝浏览器 Origin、畸形、超限和未授权请求。
- 针对新披露的 merge-key/alias 复杂度公告，将 `js-yaml` 精确升级到已修复的 `4.3.2`；最终官方 registry 生产依赖审计为 0 漏洞。

> SignPath Foundation 申请仍在审核，v1.3.12 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载或重启电脑，本地主题会保留。首次启用插件后请新建 Codex 任务或重启 Codex，让它加载插件。

## v1.3.11 — 2026-08-30

### English

- Fixed Studio startup after a newer development or portable build writes a higher selector profile into the shared managed ownership record and an older build is launched afterward.
- Persisted ownership parsing now accepts canonical `openai-codex-shell/1..64` values and restores every non-current profile only as `ORPHANED`. It never reattaches, closes, resumes, or injects through that record.
- Kept runtime security strict: live identity verification, future-document registration, and injection still require an exact match with the current `/11` selector profile. Unknown prefixes, non-canonical numbers, `/0`, and `/65` remain fail-closed.

> v1.3.11 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall or computer restart is required, and local themes are preserved.

### 简体中文

- 修复新版开发版或便携版在共享受管 ownership 中写入更高 selector profile 后，再启动旧程序会阻断整个 Studio 的问题。
- 持久 ownership 解析现在接受规范的 `openai-codex-shell/1..64`；所有非当前 profile 都只恢复为“上次会话待确认”，绝不据此重新连接、关闭、恢复或注入会话。
- runtime 安全边界保持严格：真实身份验证、未来页面脚本注册与注入仍要求当前 `/11` profile 完全一致。未知前缀、非规范数字、`/0` 与 `/65` 继续 fail closed。

> SignPath Foundation 申请仍在审核，v1.3.11 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载或重启电脑，本地主题会保留。

## v1.3.10 — 2026-08-29

### English

- Added reverse Live Preview navigation: configurable regions show a scoped hover/focus highlight and label, and clicking opens Design → Colors, scrolls to the exact control, focuses it, and then releases navigation so every Studio tab remains usable.
- Consolidated managed Codex launch, status, safety checks, pause/resume, and end-session actions into the theme-design page; the separate session page and tab are no longer required.
- Fixed the responsive edge-scroll current-thread title used by maximized Codex windows. A verified direct bridge prevents the default white surface from flashing while React rebuilds the title node.
- Added the separate home composer project rail to selector profile `/11`. Home and conversation composers, the home project rail, and user-message surfaces now consume the declared `panelAlt` directly instead of multiplying its opacity by another 88% or 92%.

> v1.3.10 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall or computer restart is required, and local themes are preserved. Restart the managed Codex session after selecting the updated theme.

### 简体中文

- LIVE PREVIEW 新增反向定位：可配置区域会显示精确的悬停/键盘高亮和中文提示；点击后自动打开“设计 → 颜色”、滚动到具体控件并聚焦。定位请求只消费一次，之后仍可自由切换画面、组件样式和高级配置。
- 将 Codex 受管启动、状态、安全检查、暂停/恢复和结束会话操作合并到主题设计页，不再需要单独的会话页签。
- 修复最大化 Codex 窗口使用的响应式当前会话标题；已核对的直接 bridge 会在 React 重建标题节点时立即覆盖默认白色表面，不再闪白。
- selector profile `/11` 新增首页独有的 composer 项目工具条。首页/对话输入框、首页项目条和我的消息现在直接使用声明的 `panelAlt`，不再额外乘以 88% 或 92% 透明度。

> SignPath Foundation 申请仍在审核，v1.3.10 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载或重启电脑，本地主题会保留。选择更新后的主题后，请重启由 CodexStyle 管理的 Codex 会话。

## v1.3.9 — 2026-08-29

### English

- Fixed the selected conversation-tab background in Codex `26.825.4187.0` by targeting the verified tab surface and its `--app-shell-tab-background` variable instead of only coloring the outer button.
- Fixed the home headline color by registering the current `data-feature="game-source"` / `group/title` structure in selector profile `/9` while retaining the bounded heading fallback.
- Added four independent home suggestion-card backgrounds. Every card can use its own color and opacity or a local PNG/JPEG/WebP image, with matching Live Preview and real Codex injection.
- Card images are decoded in the main process, resized to a bounded WebP thumbnail, embedded in `theme.json`, and preserved by the existing three-file ZIP. Older themes default to their existing shared card color, and user-created themes or presets are not overwritten.

> v1.3.9 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall or computer restart is required, and local themes are preserved. Restart the managed Codex session after selecting the updated theme.

### 简体中文

- 修复 Codex `26.825.4187.0` 中当前会话标签背景不生效的问题：现在命中已核对的标签表面，并覆盖其实际使用的 `--app-shell-tab-background` 变量，不再只修改外层按钮。
- 修复首页主标题颜色不生效的问题：selector profile `/9` 登记当前 `data-feature="game-source"` / `group/title` 结构，同时保留有界的标题标签兼容选择器。
- 首页四张快捷卡片可分别使用独立颜色与透明度，或选择各自的本地 PNG/JPEG/WebP 图片；LIVE PREVIEW 与真实 Codex 注入使用同一配置。
- 卡片图片由主进程解码并压缩为有界 WebP 缩略图，嵌入 `theme.json` 后继续随原有三件套 ZIP 往返。旧主题自动沿用原来的共享卡片颜色，不覆盖用户已有主题或预设。

> SignPath Foundation 申请仍在审核，v1.3.9 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载或重启电脑，本地主题会保留。选择更新后的主题后，请重启由 CodexStyle 管理的 Codex 会话。

## v1.3.8 — 2026-08-29

### English

- Fixed startup after upgrading from v1.3.6 when a valid ownership record still contains selector profile `/7`. The record now enters the existing orphaned-session recovery state instead of being misclassified as `STORE_TAMPERED:ownership-state`.
- Kept the security boundary intact: historical profiles are accepted only for parsing stale ownership state. Runtime identity verification and injection still require the current `/8` profile, while unknown or malformed records remain fail-closed.
- Replaced both the hand-maintained persisted-profile whitelist and its predecessor tests with a bounded `1..current` range derived from the current profile version, preventing the latest historical profile from being omitted during future upgrades.

> v1.3.8 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall or computer restart is required, and local themes are preserved.

### 简体中文

- 修复从 v1.3.6 升级后，合法 ownership 记录仍携带 selector profile `/7` 时无法启动的问题。该记录现在进入既有的“上次会话待确认”恢复状态，不再被误判为 `STORE_TAMPERED:ownership-state`。
- 安全边界保持不变：历史 profile 只用于解析过期 ownership 状态；运行时身份验证与注入仍只接受当前 `/8`，未知或畸形记录继续 fail closed。
- 将手写的持久化 profile 白名单及前代测试列表都改为按当前版本有界生成 `1..current`，防止以后升级时再次漏掉最近一代。

> SignPath Foundation 申请仍在审核，v1.3.8 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载或重启电脑，本地主题会保留。

## v1.3.7 — 2026-08-29

### English

- Expanded structured theme colors from eighteen to twenty-six with independent controls for the selected conversation tab, home headline, home suggestion cards, and command/edit/thinking activity summaries. Background, primary text, and secondary text are separated where applicable.
- Added matching Live Preview nodes and automatic home/conversation switching when a color field is hovered or focused, so every new control can be located before saving.
- Upgraded the verified Codex selector profile to `/8` and added narrowly scoped injection bridges for the current selected tab, home title/cards, and `group/activity-header` summaries without modifying the Store application package.
- Added strict catalog-v3 migration for all thirteen wallpaper presets. Untouched presets can upgrade directly from catalog v1 or v2 using exact predecessor fingerprints; user-edited presets remain unchanged and deleted presets are not restored.

> v1.3.7 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall is required, and local themes are preserved.

### 简体中文

- 将结构化主题配色从十八色扩展为二十六色：当前会话标题、首页主标题、首页快捷卡片，以及命令/编辑/思考摘要均可独立配置；需要区分的区域分别提供背景、主要文字和次要文字颜色。
- 为新增颜色补齐同构 LIVE PREVIEW 节点；悬停或聚焦颜色项时自动切换到对应首页或对话页，保存前即可定位实际作用区域。
- 将已核对的 Codex 选择器 profile 升级到 `/8`，只为当前会话标签、首页标题/卡片和 `group/activity-header` 活动摘要增加受控注入，不修改 Store 应用包。
- 为 13 套壁纸预设增加严格 catalog v3 迁移：通过两代精确 fingerprint，可从 catalog v1 或 v2 直接升级未编辑预设；用户改过的预设不覆盖，删过的预设不复活。

> SignPath Foundation 申请仍在审核，v1.3.7 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载，本地主题会保留。

## v1.3.6 — 2026-08-29

### English

- Refined all thirteen bundled wallpaper presets to use literal 20% page, panel, dialog, and sidebar opacity with 10% borders/dividers. Live Preview and real injection now consume declared transparent page/panel colors directly, while sidebar opacity is applied as an absolute alpha with a compatibility fallback.
- Added a strict catalog-v2 migration: only untouched v1 presets whose stored fingerprints still match are upgraded in place. Library IDs, artwork, selection, and existing state are retained; edited presets are preserved and deleted presets are never revived.
- Moved next-launch theme selection above the editor and upgraded the left library to show lazy `app://` background thumbnails, with page-color fallback for transparent placeholders and the two color-only built-ins.
- Removed legacy-compatible ZIP export from the renderer, public export schema, main service, ZIP writer, and regression suite. Full current-theme ZIP export, untouched formal-package export, and safe import of historical ten- or twelve-color ZIPs remain available.

> v1.3.6 is still unsigned while the SignPath Foundation application is pending. Windows SmartScreen may display an unknown-publisher warning; verify `SHA256SUMS.txt` before running the installer. Install over the existing copy—no uninstall is required, and local themes are preserved.

### 简体中文

- 将 13 套内置壁纸预设统一调整为页面、面板、弹窗和侧栏最终 20% 透明度，边框与分隔线 10%。LIVE PREVIEW 与真实注入会直接消费声明的透明页面/面板色，侧栏使用绝对 alpha 并保留兼容回退。
- 新增严格的 catalog v2 迁移：只有存储 fingerprint 仍与 v1 原始值完全一致的未编辑预设才会原位升级。library ID、图片、选择和已有状态保持不变；用户改过的预设不覆盖，删过的预设不复活。
- 将“下次启动主题”选择移到编辑器上方；左侧主题库优先显示延迟解码的受控 `app://` 背景缩略图，透明占位和两个纯色基础主题回退为页面背景色。
- 从 renderer、公开导出 schema、主进程服务、ZIP 写入器和回归测试中移除旧版兼容 ZIP 导出。当前完整主题 ZIP、未编辑正式原包导出，以及历史十色或十二色 ZIP 的安全导入继续保留。

> SignPath Foundation 申请仍在审核，v1.3.6 尚未签名。Windows SmartScreen 仍可能显示“未知发布者”；运行安装程序前请核对 `SHA256SUMS.txt`。直接覆盖原安装即可，无需卸载，本地主题会保留。

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
