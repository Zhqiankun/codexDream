# CodexStyle 交付计划与架构契约

本文件连同 `REQUIREMENTS.md` 构成本轮实现的最终契约。其他历史或并行设计说明不是实现依据；冲突时以此处锁定的固定源后台检查、用户触发下载与安装、严格三件套 ZIP、仅下次工具启动注入和本文件 IPC 契约为准。

## 固定技术栈

- Electron `43.3.0`，启用 context isolation、sandbox、asar integrity/fuses。
- React `19.2.8`、TypeScript `5.9.3`、electron-vite `5.0.0`、Vite `7.3.6`。
- Zod `4.4.3`、css-tree `3.2.1`、yauzl `3.3.1`、yazl `3.3.1`、sharp `0.35.3`、ws `8.21.2`。
- Vitest `4.1.10`、React Testing Library、Playwright `1.62.1`。
- electron-builder `26.15.3`，仅 Windows x64、当前用户 NSIS、asar 开启。
- 精确依赖版本和 `package-lock.json`；开发/CI 使用 Node `22.22.0`、npm `10.9.4`。
- native secure-store 使用仓库内 C++ 源码与 Node-API/N-API 构建；支持 Visual Studio Build Tools 2019/2022 的 MSVC x64 C++ 工具链与 Windows SDK `10.0.19041.0` 或更高版本，构建脚本由 node-gyp 选择最新可用实例。最终用户不需要安装编译工具链。

## 模块与公开契约

```text
src/contracts/                         IPC 类型、schema、Result/ErrorCode
src/main/app/                          Electron 生命周期与编排
src/main/ipc/                          sender/schema 校验与 handler
src/main/domain/                       主题、选择、会话不变量与端口
src/main/infra/                        原子存储、ZIP、图片、Safe CSS
src/main/infra/secure-store/           受限 TypeScript 端口与 native binding adapter
src/main/assistant/                    Codex 本机 RPC、调色板校验与非破坏草稿策略
src/main/platform/                     Windows AppX/进程/端口查询
src/main/session/                      CDP 启动、身份锚点、watcher、清理
src/main/tray/                         托盘与窗口生命周期
src/main/updates/                      正式安装版更新状态机与 Electron updater adapter
src/main/protocols/                    app://theme-asset 映射
src/preload/                           最小白名单 bridge
src/renderer/app/                      页面编排
src/renderer/features/                 library、studio、session、settings
src/renderer/components/               无业务通用 UI
src/renderer/api/bridge.ts             renderer 唯一 API 入口
src/renderer/styles/                   设计 tokens 与全局样式
native/secure-store/                   Windows x64 N-API 源码、预定义路径表与 native 测试支撑
plugins/codexstyle-assistant/          Codex 插件、STDIO MCP 与主题设计 Skill
```

`Result<T>` 固定为 `{ok:true,data:T}` 或 `{ok:false,error:{code,messageKey,details?}}`。普通 IPC 协议版本为 `v:5`；`studio.rendererReady` 单独保留固定 `v:1` bootstrap 并返回主进程版本/协议，用于识别覆盖安装后的驻留旧主进程。handler 验证唯一主窗口 `webContents`、`app://` frame、协议、Zod schema、上限和操作锁。租户上下文固定为当前 Windows SID 和其 `%LOCALAPPDATA%\\CodexStyle`。

公开调用固定为：bootstrap `studio.rendererReady`；`studio.getSnapshot`；`assistant.installPlugin`；`theme.get/createDraft/patchDraft/discardChanges/chooseBackground/chooseSendIcon/chooseHomeCardImage/commit/delete/importZip/resolveImport/exportZip/selectForNextLaunch/clearSelection`；`session.launch/pause/resume/endOwned`；`update.getStatus/request/cancel/install/openRelease`；`diagnostics.openLogs`。唯一事件是 `studio:state-changed`。诊断调用不接收路径，只能打开主进程固定的 Electron `userData/logs`；助手安装调用不接收路径或命令，只能让 main 从固定随包 marketplace 经已核对的当前用户 Codex CLI 安装固定插件 ID。

主题展示配置归属 theme domain：`backgroundScope` 为 `content | window`，`sidebarOverlayOpacity` 为 `0..100` 整数，缺省兼容值为 `window / 75`。`ThemeDetail` 返回必填规范化值，`ThemePatch` 接收可选更新；main 负责协议校验、持久化、ZIP 往返和注入，renderer 只通过既有 bridge 编辑并按返回 detail 预览。全窗口侧栏遮罩使用固定 `rgb(15 23 42)`，由注入 bridge 以受控样式覆盖主题侧栏背景，防止 Safe CSS 顺序造成预览与真实结果偏差。

结构化主题配置同样归属 theme domain：`appearance`、`art`、二十九色 `colors`、固定四项 `homeCards` 和 `style` 由 `theme.json` 持久化。原十色继续作为 v1 导入必填兼容基线，`sidebarText/assistantPanel/assistantMessageText/userMessageText/composerText/changeCardBackground/changeCardText/topBarBackground/topBarText/threadTabBackground/threadTabText/homeTitleText/homeCardBackground/homeCardText/activityBackground/activityText/activityMuted/accentText/selectionText` 为可选兼容扩展；旧主题缺少 `homeCards` 时从 `homeCardBackground` 生成四项纯色默认值。规范化后的 `ThemeDetail` 与 renderer patch 始终携带完整二十九色和四张卡片。`src/contracts/theme-config.ts` 是唯一允许的新跨层公开抽象，负责稳定类型、默认值、规范化、颜色与卡片图片 Data URL 边界、token CSS 和配置模式 Safe CSS 生成；renderer 只 type-import 这些契约，并通过预览专用属性反映尚未保存的结构化值，main 仍是图片解码压缩、CSS 生成、验证、revision、持久化、导入导出和注入的权威。该模块不得依赖 React、Electron、Node 或存储实现，并由独立单元测试证明生成结果始终通过 `dreamskin-safe-css/1`。

`theme.patchDraft` 在普通 IPC `v:5` 下接收结构化字段及有界 `themeJson` 源码。普通 patch 可携带 name/description/themeId/backgroundScope/sidebarOverlayOpacity/appearance/art/colors/homeCards/styleConfig 与高级 CSS；`theme.chooseHomeCardImage` 只接收 library ID、revision 和 `0..3` 卡片索引，main 将选定的 PNG/JPEG/WebP 有界解码并尝试多档尺寸/质量，最终只写入不超过 48 KiB 的 WebP Data URL。`themeJson` patch 必须单独提交，main 完成 JSON 语法、严格字段、图片引用和范围校验后才更新 name/themeId/description/config，并在配置模式下重新生成 CSS。第一次持久化编辑前由 store 建立受管 checkpoint；`theme.discardChanges` 只接受 revisioned 主题标识，并原子恢复最近 commit 或新建起点，revision 保持单调且不改变“下次启动”选择。主题索引升级为 v2 并单向迁移 v1；背景替换、导入替换和恢复均写入新的全局唯一 UUID 文件，再以索引原子替换作为唯一提交点，不覆盖活动图片。旧记录缺少 style 时规范化为 advanced，新草稿显式写入 configured 默认值和透明占位背景。`theme.exportZip` 保持同一调用，只接受完整 `simplified` 与未编辑正式包 `formal`；四张卡片图嵌入 `theme.json`，不改变三件套 ZIP。旧版兼容降级导出从契约、main 和 renderer 一并移除，历史十色或十二色 ZIP 的读取兼容仍保留。

内置图片主题包归属 main infrastructure：根 `resources/presets/catalog.json` 与 25 张图片继续作为不可改写的 schema v4 / pack v7 历史基线；新增 `resources/presets/user-wallpapers-2026-08-31-v8/catalog.json`、同目录 10 张图片及 `SOURCES.md` 组成独立固定增量包，不覆盖、不替代也不迁移 v7。`bundled-presets.ts` 对两套已知 catalog 分别有界读取，校验稳定 pack/theme ID、图片格式、尺寸与 SHA-256，并区分 `introducedThemeIds`、`previousFingerprints` 和 `previousImageSha256`；不得退化为扫描任意资源目录。`LocalThemeStore` 保留 pack v7 的既有事务语义，再以独立 `user-wallpapers-2026-08-31-v8` pack 标记在单事务中仅追加 10 个新 ready 主题；已有主题、用户编辑、用户删除、revision、checkpoint、选择项与 last-known-good 均不变化，任一图片、索引或持久化失败必须回滚本包全部写入。全新安装最终为原有 2 个基础主题 + 25 个 v7 图片主题 + 10 个 v8 图片主题，共 37 套。`ThemeSummary` 只返回页面背景色与受控缩略图 URL，不暴露文件路径、图片字节或新 IPC 方法；`SOURCES.md` 仅作为随包授权记录，不进入运行时配置解析。

CodexStyle Assistant 归属独立本机集成边界：主进程只在字面 `127.0.0.1` 随机端口提供版本化 RPC，并把端口与每次启动轮换的 bearer token 写入 native secure-store 的 `assistant/endpoint.json`；浏览器 Origin、非回环访问、错误路径/方法/content-type、超限正文与错误 token 一律拒绝。随应用打包的 `codexstyle-assistant` 插件通过 STDIO MCP 读取该端点，不直接读取主题库、背景字节或用户 CSS。公开工具仅允许查询、完整二十九色校验、从已有主题派生独立草稿、更新草稿和显式选择已保存主题；已保存主题不可被 MCP 覆盖，保存、删除、导入、导出和启动 Codex 不对插件开放。Skill 在用户没有明确指定颜色或视觉方向时才采用“现代奢华美学，浓郁而克制的配色，深色基调搭配少量高亮点缀，宝石色调，高级材质，丝绒、漆面、玻璃与金属细节，精致光影，强烈但优雅的明暗对比，高端品牌广告质感，简洁构图，大量留白，华丽但不俗艳”作为默认方向；用户明确要求始终优先。

## Native secure-store 架构契约

### 边界与依赖

`LocalThemeStore` 和会话 ownership 持久化只能依赖 main 内部的 `SecureManagedStore` 端口。该端口不是 IPC/public contract，不得从 preload 或 renderer 导出。Windows x64 adapter 是唯一生产实现；不得存在 Node `fs` fallback 或“native 不可用时继续运行”的分支。

native addon 只接受枚举化 operation 与预定义相对 managed path ID，不接受通用字符串路径。预定义表至少覆盖：

```text
state/index.json
themes/<validated-content-name>
transactions/index.journal
transactions/index.backup
transactions/<controlled-temp-name>
lock/store.lock
ownership/owned-session.json
assistant/endpoint.json
```

动态文件名只能来自已验证的内部 ID、内容哈希或 native 生成的临时 token，并由受限 adapter 映射；禁止调用方提交分隔符、盘符、UNC、ADS、`.` 或 `..`。主题导入源与用户选择的导出 ZIP 是受保护域外的显式边界，不得复用 managed-store API。

### 根句柄生命周期与逐段访问

主进程在恢复 index、journal 或 ownership 之前初始化 secure-store。native 层从当前用户 `%LOCALAPPDATA%` 的可信定位创建/打开固定 `CodexStyle` 根，确认真实目录、无 reparse tag，并持有根目录句柄直至 store dispose/application shutdown；不得在每次操作时重新按完整路径解析根。

从根到叶的每个目录/文件都必须使用父目录句柄执行 handle-relative NT I/O。每段使用 `FILE_OPEN_REPARSE_POINT` 等效选项打开，查询 reparse tag、对象类型与期望访问语义后才继续下一段。任何段、根句柄、目标句柄或 rename 目标异常都返回 `STORE_TAMPERED`，上层停止本次操作并不得尝试 Node `fs`。

### 原子提交与恢复

受管写入流程固定为：在目标父目录句柄下创建同目录唯一临时文件；有界写入；flush 文件内容；保持父目录身份不变并以 handle-relative rename 原子提交。journal、backup、index、ownership 与主题资产都使用相同规则。异常或崩溃恢复必须重新逐段验证所有候选文件，且只能选择完整旧状态或完整新状态。

锁文件通过受管根句柄创建和释放；跨进程/跨实例竞争必须 fail closed 或返回既有忙状态，不得绕过锁直接写入。secure-store dispose 必须在所有 in-flight operation 完成后关闭根句柄；关闭后任何调用均失败。

### 构建与打包

native 源码随仓库维护并在 Windows x64 构建阶段编译为 N-API `.node`。electron-builder 必须将它声明为 ASAR-unpacked 资源，`verify:package` 必须检查归档布局、x64/N-API 可加载性和不存在 JS fallback。生产启动时从固定 unpacked 位置加载；缺失、错误位置、加载失败或架构不匹配统一 `STORE_TAMPERED`。

除经审核新增的 `theme.chooseHomeCardImage` 外，IPC 方法集合保持不变；preload 只暴露对应强类型方法，`../old/**` 保持只读。展示配置扩展现有 `ThemeDetail`/`ThemePatch` 数据字段及三件套 `theme.json` 的可选兼容字段，不向 renderer 暴露路径或原始图片字节。

## CDP 状态机

```text
NO_SESSION -> EXTERNAL_BLOCKED
NO_SESSION -> LAUNCHING -> VERIFYING_CDP -> INJECTING -> THEMED_SESSION
VERIFYING_CDP/INJECTING -> INCOMPATIBLE
THEMED_SESSION -> PAUSED_FUTURE -> NO_SESSION
任意有记录状态 -> ORPHANED（身份不完整或崩溃恢复）
```

必须验证启动前 PID 基线、AUMID 启动 nonce、新 PID/开始时间/SID/精确 exe/AppX full 与 family name、字面 127.0.0.1 监听 PID、无重定向的 `/json/version` 与 `/json/list`、Browser ID、同端口 WebSocket、`app://` target 和版本化 selector profile。watcher 持有 Browser WebSocket 身份锚点。禁止直接 exe fallback、任意端口附着、按名称杀进程或控制外部会话。

持久化 ownership 的解析兼容与当前会话验证必须分离：解析器接受前缀正确、数字规范且位于 `1..64` 的 profile，使合法旧记录与有界未来记录都只恢复为 `ORPHANED`；真正的 runtime 验证、重新注册和注入仍只接受 `CODEX_SELECTOR_PROFILE` 当前值。测试动态覆盖全部前代值，并显式覆盖 `current + 1`、`/64`、未知前缀、非规范数字与 `/65`；非当前 profile 永不转化为 `OwnedSession`。

## 文件所有权

- 协调员：`.agents.md`、`REQUIREMENTS.md`、`PLAN.md`。
- 后端：`package*.json`、`electron-builder.*`、`electron.vite.config.*`、`tsconfig*.json`、`src/contracts/**`、`src/main/**`、`src/preload/**`、`tests/main/**`、`tests/fixtures/**`。
- 本阶段 secure-store 后端独占：`native/secure-store/**`、native 构建配置与脚本、`src/main/infra/secure-store/**`、`src/main/infra/local-store.ts`、`src/main/session/session-service.ts`、`src/main/app/controller.ts`、`package.json`、`package-lock.json`、`electron-builder.yml`、`scripts/verify-package.mjs`、`scripts/architecture-check.mjs` 及必要 `tests/main/**`、`tests/fixtures/**`。除非软件架构师发现契约缺口，不得修改其他文件。
- 前端：`src/renderer/**`、`resources/icons/**`、`tests/renderer/**`。
- 测试：只读检查全部代码与命令，可写 `tests/acceptance/**`。

前后端不得修改对方文件。契约由后端唯一维护；变更后必须先通知前端和测试。根配置由后端创建，前端基于该配置实现但不得自行改动。

secure-store 实施明确禁止修改 `src/contracts/**`、`src/preload/**`、`src/renderer/**`、`tests/renderer/**`、`tests/acceptance/**` 和 `../old/**`。测试工程师只读审查全部实现，可新增 `tests/acceptance/**`；高风险安全审计师只读复核 native/打包/失败行为。

## 实施阶段

1. Scaffold/contracts：根构建配置、严格 Electron 安全配置、IPC 类型与最小 preload。
2. 后端平台与域：原子主题库、ZIP/图片/Safe CSS、AppX 适配、会话状态机、CDP watcher、托盘、更新占位。
3. 前端 Studio：库浏览、编辑预览、导入/导出、冲突、会话状态与托盘相关反馈。
4. 集成和安全测试：IPC sender/schema、恶意 ZIP、TOCTOU/reparse、零网络、外部会话和 CDP 假适配器。
5. 真实 Store smoke：当前用户 Store 包发现、AUMID/CDP 身份、外部会话阻断、注入/重载、暂停/恢复、托盘退出与 NSIS 安装。

6. Native secure-store：根句柄与 managed path 表、逐段 handle-relative/reparse 校验、原子写与恢复、local/session 接入、ASAR-unpacked 和缺失 fail-closed。

7. 背景作用域配置：先扩展 theme contract 与兼容默认值，再接入本地存储/ZIP/真实注入，最后接入 Studio 控件与 LIVE PREVIEW；以旧记录迁移、revision/正式包编辑语义、ZIP 往返、payload 内容和 renderer 交互测试作为回归门槛。

8. 结构化 Studio：实现共享配置契约与生成器；接入存储、ZIP 和 payload；将编辑器拆为设计、CSS、theme.json 三面板。CSS 面板默认展示配方开关与有界参数，高级源码为显式次级模式。验收覆盖旧 CSS 不改写、自动 CSS 安全性、JSON 原子拒绝、焦点/变量注入、配置往返和键盘可访问性。

9. 多页面 LIVE PREVIEW：预览根继续由 Studio 草稿唯一驱动，页面状态仅保留在 renderer 内；首页与对话共享背景、侧栏、结构化变量和 Safe CSS 注入，不扩展 IPC、主题数据或持久化边界。

10. 主题库交互与设置收敛：在既有 `RevisionSchema` 上增加 `theme.delete`，由 store 负责索引/背景资产删除与失败回滚，controller 在工具拥有会话期间拒绝删除；renderer 增加确认对话框与 ready 主题双击选择，移除普通“应用草稿”并保留 patch-before-commit 的单一保存动作。启动检查仅合并展示项，不删除任何底层身份或兼容验证。配置模式 bridge 为背景画布、焦点、当前二十九色和透明磨砂表面提供实际消费者。

11. 颜色语义与预览定位：颜色面板按可见区域分组并以页面位置命名，默认隐藏内部 token 字段名，高级显示只作为排障入口；悬停与键盘聚焦通过 renderer 本地状态标记预览目标，不进入主题契约、IPC 或持久化。助手回复文字、用户消息文字、文件变更卡片、顶部栏、当前会话标题、首页标题/快捷卡片和命令/编辑/思考摘要由独立颜色 token 驱动；顶部栏背景默认完全透明。真实注入只作用于版本化 selector profile 已登记节点，不扩大任意 DOM 选择范围。

12. 正式安装版自更新：以 `UpdateService` 持有检查、下载、进度、取消、已下载、延后安装和安装失败状态；infra adapter 独占 `electron-updater`，固定 generic GitHub Release 源并显式关闭隐式下载/退出安装。NSIS 写入安装标记，开发版与 ZIP fail closed。renderer 只接收无路径的进度快照；立即安装或退出时安装都必须先经 controller operation gate 清理本工具拥有的 Codex 会话。Actions 发布并验证同构建的安装包、blockmap、`latest.yml` 和校验和。

13. 内置图片主题包：将 13 张用户提供图片以 ASCII 资源名和严格 catalog 打入 app.asar；main 在首次需要时逐张有界校验全部资产，避免同时解码大图造成启动内存峰值，再由 secure-store 批量追加 ready 主题并记录稳定 pack ID。验收覆盖已有库升级、二次启动不重复、删除不复活、图片/manifest 篡改、写入失败全回滚、包内文件与哈希，以及不新增 renderer/IPC 路径边界。

14. 预设迁移与 Studio 布局：catalog v2 将页面背景与 panel alpha 固定为 20%、侧栏遮罩固定为最终 20%、line alpha 固定为 10%，main/preview 以 relative-color 绝对 alpha 并保留 `color-mix` fallback，避免透明 panel 被二次相乘；旧 pack 仅在 fingerprint 精确匹配且无 checkpoint 时原位迁移。下次启动选择卡移动到编辑器上方，主题摘要返回背景色与受控缩略图 URL，renderer 对真实图片使用 lazy thumbnail、对透明占位回退背景色。旧版兼容 ZIP 从导出枚举、写入分支和 Studio 删除，完整 ZIP 与旧包导入保持。

15. 标题、首页与活动颜色：保持 `theme-config.ts` 为唯一跨层颜色契约，将颜色从十八色扩展为二十六色；selector profile `/8` 仅登记当前会话 tab、首页主标题、首页快捷卡片和 `group/activity-header` 活动摘要四类已核对节点。payload 通过独立 token bridge 覆盖背景、主文字和次要文字；renderer 使用相同变量和 `data-ds-part` 构造首页/对话预览，并在聚焦颜色项时自动切换对应页面。catalog v3 为 13 套图片主题补齐新颜色，并保存 v1/v2 两代精确 fingerprint，确保跨版本升级仍不覆盖用户编辑或复活删除项。

16. Ownership 升级兼容热修复：从当前 profile 版本自动、有界生成 `1..current` 持久化解析集合，使 v1.3.6 留下的完整 `/7` ownership 状态在 v1.3.7+ 启动时进入既有 `ORPHANED` 流程，而不是阻断应用初始化。动态测试覆盖所有历史 profile，并单独证明畸形值及 `current + 1` 仍 fail closed；不删除 ownership 文件、不放宽当前 profile 的 runtime 身份验证，也不修改主题或用户数据。

17. 当前 Codex 标题与首页卡片：对 Store Codex `26.825.4187.0` 只读核对真实 DOM 后，将 selector profile 升级到 `/9`。当前会话标签同时命中已选中按钮与 `group/tab` 表面，并覆盖实际消费的 `--app-shell-tab-background`；首页标题登记 `data-feature="game-source"` 和 `group/title`。四个 `group/home-suggestions` 卡片按受控 DOM 顺序标记 `0..3`，各自消费结构化颜色或有界 WebP。图片选择、持久化、预览、三件套 ZIP、旧主题默认补全和真实注入使用同一 theme-domain 契约。

18. 响应式表面与单页工作流：selector profile `/11` 登记最大化 edge-scroll 当前会话标题及首页独立 composer rail，并为节点重建提供同一已核对选择器的直接 bridge，消除映射防抖期间的白色闪烁。配置模式对 composer、首页 rail 和用户消息直接消费 `panelAlt`。renderer 通过预览根事件委托与内部 control ID 实现悬停/键盘提示、一次性点击定位、滚动聚焦和短暂反馈，不新增主题/IPC 状态；会话启动卡合并到主题设计页，底层 controller 与 session 状态机保持不变。

19. Ownership 前向解析：保留 native 受管文件与完整字段验证，把 profile 解析从“仅当前及历史版本”改为有界 `openai-codex-shell/1..64`。`restoreOrphanedState` 对任何合法非当前记录只设置 `ORPHANED`；不读取其 PID/端口重新连接，不删除记录，不关闭外部进程。`verifyOwnedIdentity` 的严格当前 profile 等值判断保持不变，以 E2E 预置 `current + 1` 记录证明 Studio 可启动，并以越界/畸形单测证明 fail-closed 边界仍在。

20. Composer 与前景语义：在统一颜色契约中新增 composerText、accentText 与 selectionText；旧主题按 text 或 background 补全，catalog 预设显式保存。真实 payload 仅把 composerText 桥接到已核对的 data-codex-composer 可编辑节点与光标，不侵入 placeholder 或 footer；发送箭头消费 accentText，文本选区消费 highlight/selectionText 成对颜色，首页独立 composer rail 继续消费 secondary。LIVE PREVIEW 为这些消费者提供独立热点并可点击定位。

21. 现代奢华预设重构：删除 Studio 原六套基础预设，建立 15 套宝石深色、金属冷调、丝绒暖色和珍珠浅色预设；每套拥有独立的主要前景、次要前景、输入表面、助手表面、accent、focus、发送图标及选区配对。catalog v7 以用户目录当前 25 张图片为唯一来源逐图重做 25 套主题，页面背景、panel 和 line 统一为 20% alpha，并用图片平均色合成后的 WCAG 对比度测试约束正文、输入、操作与选区。原 13 套保留稳定 ID，三张变化图片用旧 image hash 与 v6 fingerprint 双重约束替换，12 套新主题通过 introducedThemeIds 首次加入；历史 v3 配置仅保存在测试 fixture。

22. CodexStyle Assistant：主进程增加带 native 受管端点描述的认证回环 RPC，应用关闭时删除描述文件；插件用官方 MCP SDK 暴露 `status/list_themes/get_theme/validate_palette/create_theme_draft/update_theme_draft/select_theme` 七项工具。所有写操作继续经过 controller operation gate 与 revision，ready 主题只可派生、不允许原位修改，完整调色板写入前必须通过语义和 WCAG 对比度校验。插件随包携带固定 Node.js 22.22.0 x64 专用运行时及许可证；显式 `assistant.installPlugin` 仅允许 main 经当前用户固定 Codex CLI、随包 marketplace 和固定插件 ID 安装/更新，renderer 不提供参数。Studio 展示未启动、本机就绪与已调用三态，并固定区分“首次一次：安装并启用插件”“以后每次：只需启动 CodexStyle”“开始设计：在 Codex 描述配色后回到 Studio 预览并保存”；不得把 listening 误写成插件未安装，也不要求用户维护端口或密钥。Skill 仅在用户未给出颜色/视觉方向时采用锁定的现代奢华默认提示。

23. 大型主题库导航：桌面端把应用工作区约束到动态视口，左侧标题、操作、名称搜索和统计保持固定，仅主题列表独立纵向滚动；主编辑区使用独立滚动容器。搜索只在 renderer 对现有 snapshot 派生过滤，不新增 IPC、持久状态或主题排序，使用延迟查询与 `content-visibility` 保持百项以上列表输入流畅。无结果提供明确反馈与清空入口；搜索不改变总数、ready 计数、当前编辑主题、双击选择和缩略图回退。窄屏继续使用自动高度与横向主题列表。

24. v8 增量图片主题：冻结根 v7 catalog 与 25 张资产，在固定子目录新增独立 `user-wallpapers-2026-08-31-v8` catalog、10 张经授权图片和 `SOURCES.md`。10 套主题使用全新稳定 ID、完整二十九色和逐图焦点/安全区/画面参数，页面背景、panel、line 与侧栏遮罩均固定 20%；正文、输入、操作与选区按各自原图缩放至 64×64 后的 RGB 平均色合成并满足 WCAG `4.5:1`。安装路径覆盖全新库得到 37 套、已有 v7 库只追加 10 套、二次启动幂等、用户删除不复活、任一步失败全回滚，并证明根 v7 字节与迁移结果不变。

25. 插件/技能页搜索 rail：以 Store Codex `26.825.6671.0` 的已核对 bundle 为 selector profile `/12` 基线，将 `div.sticky.bg-surface:has(input#plugins-page-search)` 映射为独立 `plugins-search-rail` part。payload 同时提供 owner-scoped part 规则与 root-scoped 直接规则，使首次渲染和 SPA 延迟挂载都以主题 `background` 覆盖 rail 及其 `::after` 渐变；不修改宿主全局 surface token，不新增颜色字段或 IPC。

## 验证命令

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:renderer
npm run test:integration
npm run test:mcp
npm run test:e2e
npm run build
npm run package:win
npm run verify:package
```

native 阶段还必须在 Visual Studio x64 开发环境中实际编译 addon，并覆盖：根及每一层 junction/symlink/reparse、非法 managed path、句柄关闭/替换、并发锁、写入/flush/rename 崩溃点、journal/backup 恢复、Node `fs` fallback 静态禁用、`.node` 缺失/错架构、ASAR-unpacked 布局，以及外部导出 ZIP 不受 managed root 限制但不能反向访问保护域。

完整主题 ZIP 必须覆盖当前二十九色与结构化配置的无损往返；历史十色、十二色、十八色或二十六色 ZIP 只验证安全导入与默认值补全，不再生成面向旧客户端的降级包。实机 smoke 的实际版本、命令、截图/日志和未验证项必须记录。

v8 增量包还必须由定向主进程测试覆盖两个固定 catalog 的确定性加载顺序、10 个新 ID/资源哈希、pack 标记幂等、v7 删除项与 v8 删除项均不复活、已有用户编辑保持、复制/索引失败回滚和全新安装 37 套计数；预设对比度测试以每张原图的 64×64 平均色验证 11 组前景/表面配对均不低于 `4.5:1`。`verify:package` 必须同时核对根 v7 的 catalog/25 张图片保持原样、v8 catalog/10 张图片及 `resources/presets/user-wallpapers-2026-08-31-v8/SOURCES.md` 位于预期 ASAR 资源位置且字节可读。

## 风险与完成门槛

- CDP 对同一 Windows 用户的本地进程没有认证；回环、nonce、PID/Browser ID 绑定只能降低风险。
- Store 升级可能破坏参数透传或 selector profile，应明确报不兼容，不得降级安全边界。
- 未签名 NSIS 更新只能依赖固定 HTTPS Release 源和 `latest.yml` SHA-512 完整性，Windows 仍可能显示未知发布者；代码签名启用前不得宣称发布者身份已验证。首个带自更新能力的版本仍需旧用户手动安装一次。
- ZIP、图片解析和崩溃遗留调试会话属于高风险，必须由测试工程师独立验证，并由高风险安全审计师复核。
- native 文件系统边界、reparse/TOCTOU、原子提交、跨进程锁和 `.node` 打包属于高风险；未获得行为测试与独立安全审计通过不得交付。
- 产品代码完成、自报测试通过、构建成功均不是交付完成。只有测试工程师检查最终契约、diff 和实际命令后通过，安全审计结论明确，才可完成。
