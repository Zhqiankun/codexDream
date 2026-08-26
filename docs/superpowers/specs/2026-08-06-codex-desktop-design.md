# CodexStyle Windows Electron 设计说明

日期：2026-08-06
状态：需求与架构已审核通过，进入实施

本说明必须与项目根目录的 `REQUIREMENTS.md` 和 `PLAN.md` 一致；两者是唯一最终事实源。旧设计中的联网更新、运行中热切换、无 CSS 主题兼容和旧 IPC 命名均已废止。

## 产品边界

CodexStyle 是仅支持 Windows x64 的 Electron 桌面工具，统一承载本地主题库、离线 Studio、托盘生命周期和本工具拥有的官方 Store Codex 会话。

本版本不包含在线 Gallery、登录、投稿、云同步、网页一键换肤、`dreamskin://`、网络更新检查、下载或升级。更新入口只返回“更新尚未配置，当前不可用”。

外部启动的 Codex 永不注入、关闭、重启或附着。已运行外部 Codex 时，只提示用户自行关闭；关闭后才能由 CodexStyle 启动新的受管会话。

## 技术与安全基线

- Electron 43、React 19、TypeScript、electron-vite；renderer 开启 sandbox 与 context isolation。
- renderer 只能通过 preload 的强类型白名单 bridge 使用能力，不具备 Node、Electron、文件系统、PowerShell、CDP 或网络权限。
- 只经当前用户注册的 `OpenAI.Codex` AppX/AUMID 启动，不使用直接 `ChatGPT.exe` 参数回退。
- 不修改 WindowsApps、ACL、`app.asar`、官方签名或执行策略，不要求管理员权限。
- CDP 只允许字面 `127.0.0.1`，并绑定启动 nonce、AppX 身份、PID、开始时间、监听 PID、端口和 Browser ID。

## 组件职责

```text
React renderer
  -> preload window.codexStyle
  -> main IPC adapters
  -> application services
  -> domain ports
  -> local-store / ZIP / image / Windows AppX / CDP infrastructure
```

- `ThemeRepository`：主题、草稿、语义指纹、导入事务和 last-known-good。
- `SelectionService`：下次工具启动使用的主题和暂停标记。
- `CodexSessionService`：受管会话的启动 nonce、包身份、PID/开始时间、端口和 Browser ID。
- renderer：只拥有临时 UI 状态；真实主题、文件和会话状态归 main。
- `src/contracts/`：唯一跨层公开契约；domain 不依赖 Electron、PowerShell 或 React。

## 主题数据流

```text
原生文件选择器
  -> 有界 ZIP/图片读取
  -> 严格 schema、媒体解码和 Safe CSS AST 校验
  -> staging + journal
  -> semantic fingerprint 与冲突判断
  -> 原子发布到主题库
  -> 只刷新主题库，不自动选择或注入
```

离线 Studio 支持创建、编辑、安全预览、保存、导入和导出。保存 ready 与选择用于下次启动是两个动作；任何失败均不改变选择或 last-known-good。

普通兼容 ZIP 必须恰好包含 `theme.json`、非空 `theme.css` 和一张被引用的 PNG/JPEG/WebP，可位于根目录或唯一一层目录。正式旧包还需严格校验 manifest、Windows 平台、大小与 SHA-256。所有新建或编辑主题默认导出兼容三件套；未编辑正式导入项才能重建正式包，`manifest.sig` 只保留并标记“签名未验证”。

不支持无 CSS 主题、手工移动主题目录或按目录名猜测覆盖/删除。Safe CSS、图片和 ZIP 限制以 `REQUIREMENTS.md` 为准，并在导入、commit、选择和注入前复验。

## IPC 契约

协议版本为 `v: 1`，统一响应：

```ts
type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ErrorCode; messageKey: string; details?: SafeDetail[] };
    };
```

公开调用固定为：

- `studio.getSnapshot`
- `theme.get/createDraft/patchDraft/chooseBackground/commit/importZip/resolveImport/exportZip/selectForNextLaunch/clearSelection`
- `session.launch/pause/resume/endOwned`
- `update.getStatus/request`

唯一主进程事件是 `studio:state-changed`，payload 为不含路径、PID、端口和 nonce 的公共 snapshot。文件选择与导出由 main 打开原生对话框；renderer 不传任意路径或命令。

## Codex 启动与注入

```text
用户点击启动
  -> 取得单用户操作锁
  -> 发现并验证当前用户 Store OpenAI.Codex
  -> 枚举进程并阻断任何外部会话
  -> 经 AUMID 传入 256-bit nonce、127.0.0.1 和随机端口
  -> 验证新 PID/AppX/nonce/监听 PID/Browser ID
  -> 验证 app:// target 与版本化 selector profile
  -> 注入已重新校验的所选主题
  -> watcher 持有 Browser WebSocket 身份锚点
```

参数未透传、CDP 缺失、身份不完整、端口复用或 selector 不兼容均返回明确不兼容，绝不降级附着。部分注入失败时只通过同一已验证 CDP 清理 marker；仅可关闭由同一 nonce 完整证明所有权的新会话。

暂停和恢复只影响后续工具启动与 watcher 的未来注入，不追溯修改当前页面。切换主题需要用户关闭并重新由工具启动。崩溃恢复只报告孤儿会话，不自动附着、关闭或注入。

## 窗口、托盘与退出

- 关闭主窗口仅隐藏至托盘。
- 托盘提供打开 Studio、启动 Codex、暂停/恢复、更新占位和退出。
- 退出时若存在完整验证的工具拥有会话，先提示将关闭该会话以回收 CDP；确认后才清理和优雅关闭。
- 清理失败则工具保持运行并显示错误，不按进程名强杀。

## 更新占位

本版本不引入 `autoUpdater`、HTTP client、下载器、外链或后台检查。renderer 和托盘的更新入口调用 `update.request`，稳定返回 `UPDATE_UNCONFIGURED` 并显示“更新尚未配置，当前不可用”。

## 验证设计

- main 单测：主题字段、图片、Safe CSS、ZIP 攻击、指纹冲突、journal 回滚、选择与暂停语义。
- IPC 集成：sender/frame/schema/大小/操作锁、无路径和会话秘密泄漏。
- Windows 假适配器：AppX 发现、外部进程阻断、nonce、回环监听 PID、Browser ID、端口复用和清理。
- renderer：离线 Studio、主题库、冲突、状态反馈、键盘与可访问性、零网络更新占位。
- 兼容性：新导出的简化 ZIP 在临时目录通过 `../old/windows/assets/theme-package-validator.mjs`；旧目录只读。
- 打包：sandbox/context isolation、asar/fuses、当前用户 NSIS、无外部 Node 依赖。
- 实机：外部会话阻断、AUMID/CDP 身份、注入与重载、不可兼容失败、暂停/恢复、托盘退出。

## 风险

CDP 对同一 Windows 用户的本机进程本质上不认证；回环、nonce 和进程/Browser ID 锚定只能降低风险。Store 更新也可能破坏参数透传或 selector。任何不确定身份或兼容性均必须 fail closed，并由测试工程师和高风险安全审计师独立复核。
