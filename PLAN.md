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
```

`Result<T>` 固定为 `{ok:true,data:T}` 或 `{ok:false,error:{code,messageKey,details?}}`。普通 IPC 协议版本为 `v:3`；`studio.rendererReady` 单独保留固定 `v:1` bootstrap 并返回主进程版本/协议，用于识别覆盖安装后的驻留旧主进程。handler 验证唯一主窗口 `webContents`、`app://` frame、协议、Zod schema、上限和操作锁。租户上下文固定为当前 Windows SID 和其 `%LOCALAPPDATA%\\CodexStyle`。

公开调用固定为：bootstrap `studio.rendererReady`；`studio.getSnapshot`；`theme.get/createDraft/patchDraft/discardChanges/chooseBackground/chooseSendIcon/commit/delete/importZip/resolveImport/exportZip/selectForNextLaunch/clearSelection`；`session.launch/pause/resume/endOwned`；`update.getStatus/request/cancel/install/openRelease`；`diagnostics.openLogs`。唯一事件是 `studio:state-changed`。诊断调用不接收路径，只能打开主进程固定的 Electron `userData/logs`。

主题展示配置归属 theme domain：`backgroundScope` 为 `content | window`，`sidebarOverlayOpacity` 为 `0..100` 整数，缺省兼容值为 `window / 75`。`ThemeDetail` 返回必填规范化值，`ThemePatch` 接收可选更新；main 负责协议校验、持久化、ZIP 往返和注入，renderer 只通过既有 bridge 编辑并按返回 detail 预览。全窗口侧栏遮罩使用固定 `rgb(15 23 42)`，由注入 bridge 以受控样式覆盖主题侧栏背景，防止 Safe CSS 顺序造成预览与真实结果偏差。

结构化主题配置同样归属 theme domain：`appearance`、`art`、十八色 `colors` 和 `style` 由 `theme.json` 持久化。原十色继续作为 v1 导入必填兼容基线，`sidebarText/assistantPanel/assistantMessageText/userMessageText/changeCardBackground/changeCardText/topBarBackground/topBarText` 为可选兼容扩展；规范化后的 `ThemeDetail` 与 renderer patch 始终携带完整十八色。`src/contracts/theme-config.ts` 是唯一允许的新跨层公开抽象，负责稳定类型、默认值、规范化、颜色处理、token CSS 和配置模式 Safe CSS 生成；renderer 只 type-import 这些契约，并通过预览专用属性反映尚未保存的结构化值，main 仍是 CSS 生成、验证、revision、持久化、导入导出和注入的权威。该模块不得依赖 React、Electron、Node 或存储实现，并由独立单元测试证明生成结果始终通过 `dreamskin-safe-css/1`。

`theme.patchDraft` 在普通 IPC `v:3` 下接收结构化字段及有界 `themeJson` 源码。普通 patch 可携带 name/description/themeId/backgroundScope/sidebarOverlayOpacity/appearance/art/colors/styleConfig 与高级 CSS；`themeJson` patch 必须单独提交，main 完成 JSON 语法、严格字段、图片引用和范围校验后才更新 name/themeId/description/config，并在配置模式下重新生成 CSS。第一次持久化编辑前由 store 建立受管 checkpoint；`theme.discardChanges` 只接受 revisioned 主题标识，并原子恢复最近 commit 或新建起点，revision 保持单调且不改变“下次启动”选择。主题索引升级为 v2 并单向迁移 v1；背景替换、导入替换和恢复均写入新的全局唯一 UUID 文件，再以索引原子替换作为唯一提交点，不覆盖活动图片。旧记录缺少 style 时规范化为 advanced，新草稿显式写入 configured 默认值和透明占位背景。`theme.exportZip` 保持同一调用并区分完整 `simplified`、显式降级的 `compatibility` 与未编辑正式包 `formal`；兼容导出以 v1.0.x 的 Safe CSS/十二色能力为冻结策略，不得携带六个新颜色字段或引用旧策略不认识的选择器、状态及 token。

内置图片主题包归属 main infrastructure：`resources/presets/catalog.json` 与图片作为固定 app.asar 资源，`bundled-presets.ts` 负责有界读取、严格 schema、稳定 pack/theme ID、图片格式和 SHA-256 校验。`LocalThemeStore` 只接收已验证字节，并以 v2 `installedPresetPacks` 标记执行一次批量事务；随机受管 UUID 图片、13 条 ready 记录与 pack 标记由同一次索引提交生效，现有主题状态保持不变。该能力不扩展公开 contracts、preload、IPC 或 renderer 文件访问。

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

IPC 方法集合、preload API 形状和 `../old/**` 保持不变；展示配置只扩展现有 `ThemeDetail`/`ThemePatch` 数据字段及三件套 `theme.json` 的可选兼容字段。

## CDP 状态机

```text
NO_SESSION -> EXTERNAL_BLOCKED
NO_SESSION -> LAUNCHING -> VERIFYING_CDP -> INJECTING -> THEMED_SESSION
VERIFYING_CDP/INJECTING -> INCOMPATIBLE
THEMED_SESSION -> PAUSED_FUTURE -> NO_SESSION
任意有记录状态 -> ORPHANED（身份不完整或崩溃恢复）
```

必须验证启动前 PID 基线、AUMID 启动 nonce、新 PID/开始时间/SID/精确 exe/AppX full 与 family name、字面 127.0.0.1 监听 PID、无重定向的 `/json/version` 与 `/json/list`、Browser ID、同端口 WebSocket、`app://` target 和版本化 selector profile。watcher 持有 Browser WebSocket 身份锚点。禁止直接 exe fallback、任意端口附着、按名称杀进程或控制外部会话。

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

10. 主题库交互与设置收敛：在既有 `RevisionSchema` 上增加 `theme.delete`，由 store 负责索引/背景资产删除与失败回滚，controller 在工具拥有会话期间拒绝删除；renderer 增加确认对话框与 ready 主题双击选择，移除普通“应用草稿”并保留 patch-before-commit 的单一保存动作。启动检查仅合并展示项，不删除任何底层身份或兼容验证。配置模式 bridge 为背景画布、焦点、十八色和透明磨砂表面提供实际消费者。

11. 颜色语义与预览定位：颜色面板按可见区域分组并以页面位置命名，默认隐藏内部 token 字段名，高级显示只作为排障入口；悬停与键盘聚焦通过 renderer 本地状态标记预览目标，不进入主题契约、IPC 或持久化。助手回复文字、用户消息文字、文件变更卡片背景/文字、顶部栏背景和顶部栏文字由独立颜色 token 驱动；顶部栏背景默认完全透明。真实注入只作用于版本化 selector profile 已登记的顶部栏、消息和文件变更卡片节点，不扩大任意 DOM 选择范围。

12. 正式安装版自更新：以 `UpdateService` 持有检查、下载、进度、取消、已下载、延后安装和安装失败状态；infra adapter 独占 `electron-updater`，固定 generic GitHub Release 源并显式关闭隐式下载/退出安装。NSIS 写入安装标记，开发版与 ZIP fail closed。renderer 只接收无路径的进度快照；立即安装或退出时安装都必须先经 controller operation gate 清理本工具拥有的 Codex 会话。Actions 发布并验证同构建的安装包、blockmap、`latest.yml` 和校验和。

13. 内置图片主题包：将 13 张用户提供图片以 ASCII 资源名和严格 catalog 打入 app.asar；main 在首次需要时逐张有界校验全部资产，避免同时解码大图造成启动内存峰值，再由 secure-store 批量追加 ready 主题并记录稳定 pack ID。验收覆盖已有库升级、二次启动不重复、删除不复活、图片/manifest 篡改、写入失败全回滚、包内文件与哈希，以及不新增 renderer/IPC 路径边界。

## 验证命令

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:renderer
npm run test:integration
npm run test:e2e
npm run build
npm run package:win
npm run verify:package
```

native 阶段还必须在 Visual Studio x64 开发环境中实际编译 addon，并覆盖：根及每一层 junction/symlink/reparse、非法 managed path、句柄关闭/替换、并发锁、写入/flush/rename 崩溃点、journal/backup 恢复、Node `fs` fallback 静态禁用、`.node` 缺失/错架构、ASAR-unpacked 布局，以及外部导出 ZIP 不受 managed root 限制但不能反向访问保护域。

兼容测试使用临时目录调用 `../old/windows/assets/theme-package-validator.mjs`，证明显式“旧版兼容 ZIP”可被旧契约接受；完整主题 ZIP 负责当前十八色无损往返，不宣称可由旧版读取。不得修改旧文件。实机 smoke 的实际版本、命令、截图/日志和未验证项必须记录。

## 风险与完成门槛

- CDP 对同一 Windows 用户的本地进程没有认证；回环、nonce、PID/Browser ID 绑定只能降低风险。
- Store 升级可能破坏参数透传或 selector profile，应明确报不兼容，不得降级安全边界。
- 未签名 NSIS 更新只能依赖固定 HTTPS Release 源和 `latest.yml` SHA-512 完整性，Windows 仍可能显示未知发布者；代码签名启用前不得宣称发布者身份已验证。首个带自更新能力的版本仍需旧用户手动安装一次。
- ZIP、图片解析和崩溃遗留调试会话属于高风险，必须由测试工程师独立验证，并由高风险安全审计师复核。
- native 文件系统边界、reparse/TOCTOU、原子提交、跨进程锁和 `.node` 打包属于高风险；未获得行为测试与独立安全审计通过不得交付。
- 产品代码完成、自报测试通过、构建成功均不是交付完成。只有测试工程师检查最终契约、diff 和实际命令后通过，安全审计结论明确，才可完成。
