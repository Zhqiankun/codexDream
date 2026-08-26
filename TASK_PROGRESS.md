# CodexStyle 任务进度

更新时间：2026-08-26

## 目标与范围

在 `codexStyle/` 新建 Windows x64 Electron 应用：本地主题库、离线 Studio、兼容普通 ZIP 导入/导出、系统托盘和仅限本工具拥有的 Store Codex 会话注入。`../old/` 全程只读。

最终需求与架构以 `.agents.md`、`REQUIREMENTS.md`、`PLAN.md` 为唯一事实源。明确不实现联网更新、在线社区、深链、外部会话控制或运行中热切换。

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

### Native secure-store 阶段

- [x] 用户明确授权安装 Microsoft 官方 Build Tools 与 Windows SDK。
- [x] 工具链实测可用：MSVC x64 `19.44.35228`、Windows SDK `10.0.26100.0`、Build Tools 2022 `17.14.37`，无需重启。
- [x] 将固定 `%LOCALAPPDATA%\\CodexStyle` 根、预定义 managed path、根句柄生命周期、逐段 handle-relative/reparse-aware I/O、原子提交、无 Node `fs` fallback、ASAR-unpacked 和模块缺失 fail-closed 写入 `.agents.md`、`REQUIREMENTS.md`、`PLAN.md`。
- [ ] 软件架构师独立审核并明确“审核通过”，必要时只细化内部边界，不改变 IPC `v: 1`、preload、renderer 或 `../old/`。
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
- 当前用户安装的 Store 包：`OpenAI.Codex 26.818.8289.0`，x64，`SignatureKind=Store`，非开发模式。
- `codexStyle/` 已连接公开仓库 `Zhqiankun/codexDream`，`main` 与 `origin/main` 同步；`v1.0.0` 发布改动将在验证后统一提交并打标签。

## 验证证据

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
