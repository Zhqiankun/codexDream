# CodexStyle 任务进度

更新时间：2026-08-29

## 目标与范围

在 `codexStyle/` 新建 Windows x64 Electron 应用：本地主题库、离线 Studio、兼容普通 ZIP 导入/导出、系统托盘和仅限本工具拥有的 Store Codex 会话注入。`../old/` 全程只读。

最终需求与架构以 `.agents.md`、`REQUIREMENTS.md`、`PLAN.md` 为唯一事实源。联网能力仅限固定 GitHub Release 更新源；不实现在线社区、深链、外部会话控制或运行中热切换。

## 阶段状态

- [x] 用户明确授权实施并确认收紧契约。
- [x] 产品经理审核通过。
- [x] 软件架构师审核通过并锁定主题、IPC、CDP、退出与更新契约。
- [x] 创建 `.agents.md`、`REQUIREMENTS.md`、`PLAN.md`。
- [x] 修正并行设计说明中的历史冲突。
- [x] Scaffold 与 `src/contracts`。
- [x] 后端 main/preload/domain/infrastructure/platform/session 实施。
- [x] 前端 renderer、应用图标和 renderer 测试实施。
- [x] 主智能体按最终契约完成静态检查、自动化回归、真实 Electron E2E、构建、打包和包校验。
- [ ] 测试工程师独立检查契约、diff 和实际命令。
- [x] 本轮发现的暂停恢复、正式包编辑标记、无界图片读取、退出生命周期、错误提示、E2E 和干净构建缺陷已修复并复测。
- [ ] 高风险安全审计师复核 CDP、进程控制、IPC 和本地文件安全。
- [x] 汇总验证证据、未验证项和剩余风险。
- [x] Studio 结构化主题配置：设计 / CSS / theme.json 三面板、外观与焦点、十色变量、四类组件配方及受限表面参数。
- [x] 配置模式 Safe CSS 生成、主进程严格 theme.json 应用、受管持久化、三件套 ZIP 往返和真实注入链路完成。
- [x] LIVE PREVIEW 增加首页 / 对话即时切换；两个页面共享主题草稿、背景作用域、焦点、颜色和 Safe CSS，未新增持久化或 IPC 状态。
- [x] 编辑器增加“放弃本次修改”，由受管 checkpoint 恢复最近保存或新建起点，并保留 revision 与下次启动选择语义。
- [x] 主进程增加启动后及每 20 分钟静默更新检查；只提示新版，不自动下载，顶部更新入口改用安装语义图标与状态胶囊。
- [x] 13 张用户提供图片已分别形成内置主题预设；主进程严格校验并一次性原子追加，已有主题及选择状态不被覆盖。
- [x] v1.3.6 预设透明度、无覆盖 catalog v2 迁移、主题库缩略图、顶部启动主题选择及旧版兼容导出移除已完成。
- [x] v1.3.7 二十六色契约已接通：会话标题、首页标题/快捷卡片、命令/编辑/思考摘要均有独立颜色、双页面预览定位和 selector profile `/8` 真实注入；catalog v3 可从 v1 或 v2 安全迁移，用户编辑与删除语义保持。
- [x] v1.3.8 ownership 升级兼容热修复：v1.3.6 写入的合法 selector profile `/7` 按过期会话恢复，不再阻断启动；当前 `/8` 运行时验证和未知状态 fail-closed 边界保持不变。
- [x] v1.3.9 会话标签与首页标题真实 DOM 修复完成；selector profile `/9` 覆盖当前 Codex 的标签表面变量与标题结构，首页四张快捷卡片可分别使用颜色/透明度或本地图片并随主题 ZIP 往返。
- [x] v1.3.10 响应式标题、首页 composer rail、`panelAlt` 最终透明度、LIVE PREVIEW 反向定位及主题设计页内受管 Codex 启动已完成；selector profile 升级到 `/11`。
- [x] v1.3.11 ownership 前向解析完成：合法 `1..64` 非当前 profile 仅恢复为 `ORPHANED`，runtime 连接与注入仍严格要求当前 `/11`；未知前缀、非规范值与 `/65` 继续 fail closed。

### Native secure-store 阶段

- [x] 用户明确授权安装 Microsoft 官方 Build Tools 与 Windows SDK。
- [x] 工具链实测可用：MSVC x64 `19.44.35228`、Windows SDK `10.0.26100.0`、Build Tools 2022 `17.14.37`，无需重启。
- [x] 将固定 `%LOCALAPPDATA%\\CodexStyle` 根、预定义 managed path、根句柄生命周期、逐段 handle-relative/reparse-aware I/O、原子提交、无 Node `fs` fallback、ASAR-unpacked 和模块缺失 fail-closed 写入 `.agents.md`、`REQUIREMENTS.md`、`PLAN.md`。
- [ ] 软件架构师独立审核并明确“审核通过”，必要时只细化内部边界，不放宽 IPC `v: 4`、bootstrap 握手、preload、renderer 或 `../old/`。
- [x] 已实施 native addon、main adapter、local/session 接入、构建打包和 main tests。
- [ ] 测试工程师独立执行 native 行为测试、完整回归、构建与打包验证。
- [ ] 高风险安全审计师独立复核 reparse/TOCTOU、原子提交、锁、模块加载和 fail-closed 证据。

## 角色与文件责任

- 研发协调员：治理文档与阶段协调。
- 产品经理：范围、流程、非目标和可观察验收；已完成。
- 软件架构师：边界、数据所有权、IPC、CDP 与风险；已完成。
- 后端架构师：根构建配置、`src/contracts/**`、`src/main/**`、`src/preload/**`、`tests/main/**`、`tests/fixtures/**`。
- 前端架构师：`src/renderer/**`、`resources/icons/**`、`tests/renderer/**`。
- 测试工程师：独立验证；只可写 `tests/acceptance/**`。
- 高风险安全审计师：只读复核安全契约、diff 与证据。

## 当前环境

- Windows；Node `22.22.0`、npm `10.9.4`、pnpm `9.12.3`。
- 当前用户安装的 Store 包：`OpenAI.Codex 26.825.4187.0`，x64，`SignatureKind=Store`，非开发模式；本轮只读核对其当前会话标签、首页卡片和活动摘要标记，未修改 Store 包。
- `codexStyle/` 已连接公开仓库 `Zhqiankun/codexDream`；当前发布基线为 `v1.3.8`，本轮 `v1.3.9` 改动将在完整验证后统一提交并打标签。

## 验证证据

- 2026-08-30 `v1.3.11` 发布候选：本机只读确认启动失败记录包含完整 14 字段且 profile 为 `/10`，实际启动程序却是 `D:\\codexDream\\CodexStyle\\CodexStyle.exe` v1.3.9/profile `/9`，属于新版数据被旧便携版读取的降级场景。持久 ownership 解析现接受有界 `1..64` 并只恢复 `ORPHANED`，runtime 当前 profile 严格等值检查未改。25 项 session 定向测试覆盖全部历史值、`current + 1`、`/64` 及未知/非规范/越界拒绝。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check`、201 项主进程测试、54 项 renderer 测试、7 项集成测试、预置未来 `/12` 的 1 项真实 Electron E2E、`npm run package:win` 和 `npm run verify:package` 全部通过。安装包 `CodexStyle-1.3.11-x64.exe` 为 121,790,715 字节，SHA-256 `f7abdaf6584f58228f7794200b838f51e06c93e002b46815d7b1de08c8e24665`；便携包 `CodexStyle-1.3.11-x64.zip` 为 164,888,602 字节，SHA-256 `ee7e2ef049790a36fcd07a6d2ea873825a77a4d3ee214a636d1265de8a272650`。

- 2026-08-29 `v1.3.10` 发布候选：只读 CDP 实测确认 edge-scroll 标题默认白色来自响应式 Toolbar 子表面，首页项目条来自独立 `data-composer-rail-*` controls rail；两者已加入 `/11` 精确 profile 和无映射空窗的 direct bridge。首页/对话 composer 与用户消息直接消费 `panelAlt` 最终 alpha。LIVE PREVIEW 反向定位使用事件委托、最具体区域提示、一次性请求、滚动聚焦和减少动画；Codex 启动与检查合并到主题设计页。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check`、196 项主进程测试、54 项 renderer 测试、7 项集成测试、1 项真实 Electron E2E、`npm run package:win` 和 `npm run verify:package` 全部通过。安装包 `CodexStyle-1.3.10-x64.exe` 为 121,790,793 字节，SHA-256 `4f0e3dcff15a4fc4e8d10c0c71430877c49ea0e619639726b6a681aabce7ca14`；便携包 `CodexStyle-1.3.10-x64.zip` 为 164,888,670 字节，SHA-256 `c7c9850b128dbccb7d94aa306f8e6e928a7b2387c7bceb2ae74a6c6ffe985d53`。

- 2026-08-29 `v1.3.9` 发布候选：只读核对 Store Codex `26.825.4187.0` 的打包 DOM，确认白色会话标签由 `group/tab` 表面内联 `--app-shell-tab-background` 驱动，首页标题实际为 `data-feature="game-source"` / `group/title` 而非标题标签。selector profile 升级到 `/9` 并增加同构 payload 测试；四张首页卡片新增独立颜色/图片契约，图片由 main 压缩为单项不超过 48 KiB 的 WebP Data URL，旧主题补全、受管存储、三件套 ZIP、IPC/preload、Studio 与真实注入链路均已覆盖。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check`、193 项主进程测试、53 项 renderer 测试、7 项集成测试、1 项真实 Electron E2E、`npm run package:win` 和 `npm run verify:package` 全部通过。安装包 `CodexStyle-1.3.9-x64.exe` 为 121,767,417 字节，SHA-256 `77d0b923e3d1ed3eb97786a569561220a7530aab6d8c8ec146663956860292e8`；便携包 `CodexStyle-1.3.9-x64.zip` 为 164,885,161 字节，SHA-256 `ae23ce69c5988a5d8d9f144b7796308ee44cfc91b24e29b9ab4ce61703c3db91`。

- 2026-08-29 `v1.3.8` 热修复候选：本机失败记录经只读核对为 ownership v1 + selector profile `/7`，与 v1.3.7 漏列最近前代 profile 的根因完全吻合。解析集合改为由当前版本自动、有界生成 `1..current`；动态单测覆盖 `/1` 至 `/7` 全部历史值，畸形值和 `/9` 继续拒绝。隔离 Electron E2E 在启动前通过 native secure-store 预置上一代 ownership，应用成功打开并报告 `ORPHANED`，随后主题读取与本地写入均通过。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check`、188 项主进程测试、52 项 renderer 测试、7 项集成测试、1 项真实 Electron E2E、`npm run package:win` 和 `npm run verify:package` 全部通过。安装包 `CodexStyle-1.3.8-x64.exe` 为 121,763,305 字节，SHA-256 `3eaf062abb3e9404ab37166b0304b05f30a2c564dc0c1077544f982db210618f`；便携包 `CodexStyle-1.3.8-x64.zip` 为 164,879,286 字节，SHA-256 `c4651817f80fbe05c1fa84cbc0832214dbc2c88c5852d9ad6cbb644e44662cfb`。

- 2026-08-29 `v1.3.7` 发布候选：结构化配色扩展到 26 项，selector profile `/8` 同时覆盖当前会话标签外层容器与选中 tab、首页标题/快捷卡片及命令/编辑/思考活动摘要；13 套 catalog v3 预设均含 26 色和 v1/v2 两代精确 fingerprint，从两代前置 pack 原位迁移、编辑保留与删除不复活均通过回归。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check`、186 项主进程测试、52 项 renderer 测试、7 项集成测试和 1 项沙箱外隔离 Electron E2E 全部通过；`npm run package:win` 与 `npm run verify:package` 通过。安装包 `CodexStyle-1.3.7-x64.exe` 为 121,763,083 字节，SHA-256 `e4e1802b8277d960748f629833ab1cd23edee156c5e12ef9d49430915694dbcd`；便携包 `CodexStyle-1.3.7-x64.zip` 为 164,879,304 字节，SHA-256 `5972828561f7edab780f3b26617c865421a5f6ef2d82057a8270dcff217c3641`。

- 2026-08-29 `v1.3.6` 发布候选：13 套 catalog v2 预设统一页面/面板/侧栏 20% 与边框 10%，全部旧 fingerprint 均通过原位迁移验证，编辑项与删除项保持；主题库缩略图、纯色回退、顶部选择卡和旧版兼容导出移除已由 renderer 与真实 Electron 验证。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check`、185 项主进程测试、52 项 renderer 测试、7 项集成测试和 1 项真实 Electron E2E 全部通过；安装包 ASAR/catalog/图片哈希与 native 布局通过校验，打包成品隔离启动得到 15 个主题、13 个 v2 预设且透明度全部正确。

- 2026-08-29 `v1.3.5` 发布候选：13 套图片主题目录、一次性 pack 标记、已有库升级、删除不复活和失败全回滚均已实现。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check`、184 项主进程测试、51 项 renderer 测试、8 项集成测试和 1 项真实 Electron E2E 全部通过；安装包 ASAR 内 catalog 与 13 张图片逐项通过 SHA-256，打包成品以隔离数据目录启动并得到原 2 套加新 13 套主题。

- 2026-08-26 `v1.0.0` 发布候选完成：加入用户主动触发的 GitHub Release 更新检查；固定 API 与 Release 地址、稳定语义版本、响应大小和超时均由 main 校验，不后台轮询、不静默下载、不执行远程文件。
- `npm run test:unit`：20 个文件、95 项通过；`npm run test:renderer`：2 个文件、29 项通过；`npm run test:integration`：2 个文件、6 项通过，仓库外可选旧版验证器缺失时 1 项明确跳过；真实 Electron E2E 1 项通过。
- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run architecture:check`、`npm run test:e2e` 和 `npm run verify:package` 全部通过。native secure-store 使用已安装的 VS 2019 MSVC x64 工具链从源码干净重建。
- 发布产物：`CodexStyle-1.0.0-x64.exe`（109,217,880 字节）与 `CodexStyle-1.0.0-x64.zip`（152,228,116 字节）；SHA-256 分别为 `b970798e2b6d9f2ec7da1038715817a2cce52fbfc70e4afa1df8b9b2ead8b15a`、`240208c59d7b7d3dac00bb8f71b490b4fb95ed8f9fb89d8e3b0ea5b1d7822e49`。

- 2026-08-26 LIVE PREVIEW 首页 / 对话切换完成：`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check` 和 `npx electron-vite build` 通过；`npm run test:renderer` 为 2 个文件、22 项通过。开发版实窗确认首页壁纸覆盖侧栏与主区域，首页输入框复用主题配方，切换不保存草稿或递增 revision。
- 2026-08-26 结构化主题 Studio 完成：新草稿默认配置生成，旧主题保留高级 CSS；renderer 只 type-import 契约，main 独占生成、校验、revision、持久化、导入导出和注入权威。
- `npm run test:unit`：15 个文件、68 项通过；`npm run test:renderer`：2 个文件、20 项通过；`npm run test:integration`：3 个文件、7 项通过。合计 20 个文件、95 项脚本级回归通过。
- `npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run architecture:check` 与 `npm run build` 全部通过；Windows x64 native secure-store 已从源码干净重建。
- 干净重启开发版后实窗检查 1245×813 布局：设计、配置生成 CSS、高级 CSS、theme.json 和 Live Preview 均正常显示；检查产生的临时模式切换已恢复且未持久化。

- 2026-08-25 恢复审计已启动：已确认 `codexStyle/` 是实际 Git 工作区，当前仓库尚无提交且全部文件为未跟踪；`../old/` 保持只读。由于既有阶段勾选与实际文件树不一致，本轮将以 `REQUIREMENTS.md`、`PLAN.md`、源码检查和实际命令结果重新判定完成状态。
- 2026-08-25 完成性修复：正式导入主题更换背景后正确降级为已编辑兼容包；外部图片改为 10 MiB 有界稳定读取；同名导入、未验证签名、正式包原样导出和错误提示已接入 UI；持久暂停可在无 owned session 时恢复；`before-quit` 不再被“关闭即隐藏”逻辑阻断。
- 新增确定性图标生成、Windows `.ico`、README、显式 Electron 43 二进制准备和真实 Electron E2E；未新增跨业务共享抽象，renderer → preload → main → domain/infra 依赖方向不变。
- 从空 native build 输出开始执行 `npm run test:unit`：14 个文件、53 项全部通过；`npm run test:renderer`：2 个文件、14 项全部通过；`npm run test:integration`：3 个文件、7 项全部通过。
- `npm run test:e2e` 在隔离临时 `%LOCALAPPDATA%` 中启动真实 Electron 43.3.0 与 native secure-store，验证内置主题、创建草稿的真实持久化写入、更新占位和正常退出：1 项通过；截图位于 `test-results/e2e/codexstyle-studio.png`。
- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run architecture:check` 全部通过。
- `npm ci` 从锁文件成功安装 555 个包；用精确 override 将传递依赖 `nanoid` 从有高危公告的 `3.3.17` 固定到 `3.3.18`，官方 registry 的 `npm audit --omit=dev --audit-level=high` 报告 0 个漏洞。
- `npm run package:win` 成功生成 Windows x64 当前用户 NSIS 安装器；`npm run verify:package` 已验证安装器、有效应用图标、ASAR 资源、应用和 native addon 的 x64 PE 架构、ASAR 外 `.node` 布局及 addon 实际加载。
- 最终产物：`release/CodexStyle-0.1.0-x64.exe`，108,944,575 字节，SHA-256 `685E98DF47AA6D40190121233A1B3488DF63256F69A230E162028FCCAEC42FB0`。

- 已只读检查 `old/AGENTS.md`、Windows README、运行时说明、主题 validator、injector、启动和更新脚本。
- 已确认旧契约的三件套 ZIP、正式 manifest、Safe CSS、图片限制和严格 Store/CDP 身份规则。
- 2026-08-08 恢复检查确认 operation gate 已由 `AppController` 统一仲裁，IPC handler 不再自行广播；`EXTERNAL_SESSION_RUNNING` 状态变化会广播，`UNKNOWN` 与 `OPERATION_BUSY` 不会滥广播。
- 实际运行 `npx vitest run tests/main/operation-gate.test.ts tests/main/operation-gate-controller.test.ts tests/acceptance/ipc-boundary.test.ts`：3 个文件、11 项全部通过。
- 2026-08-08 工具链复查：Visual Studio Build Tools 2022 `17.14.37` 已完整注册，包含 `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`，实例可启动且无需重启；Windows SDK `10.0.26100.0` 已注册。原生 secure-store 实施仍等待主线程确认已锁定契约与文件责任。
- 只读 Store 检查确认当前版本和身份满足发现条件，但当前已有外部 `ChatGPT.exe` 会话运行。按安全契约未关闭、附着或注入它，因此真实 Store 启动/CDP/selector/injection smoke 仍未执行。

## 阻塞与风险

- 当前无已知产品代码或架构阻塞。
- CDP 同用户本地认证限制、Store 版本兼容、ZIP/图片解析、进程所有权与崩溃遗留会话属于高风险，必须独立测试和安全审计。
- 真实 Store smoke 被当前外部 Codex 会话阻断；需要在所有外部 Codex 关闭后另行执行，且生产版本不暴露 CDP 时“不兼容”是正确结果，不得以权限绕过换取通过。
- 当前单智能体执行约束下未取得独立测试工程师和高风险安全审计师签字；按 `PLAN.md` 的严格发布完成门槛，仍不能宣称独立安全验收完成。
- 安装器 Authenticode 状态为 `NotSigned`；需要项目方提供代码签名证书后才能改善 SmartScreen 发布信任。
- 本轮失败调试遗留 6 个 `%TEMP%\codexstyle-*` 隔离目录，递归清理被本机安全策略拒绝；内容不含正式用户数据且不影响项目。
