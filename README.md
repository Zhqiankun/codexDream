# CodexStyle

CodexStyle 是仅面向 Windows x64 的离线 Electron 主题 Studio。它管理本地主题、导入和导出普通 ZIP，并且只会为由本工具启动且完成身份验证的 Microsoft Store `OpenAI.Codex` 会话注入主题。

## 安全边界

- 不修改 `WindowsApps`、`app.asar`、ACL、官方签名或系统执行策略。
- 不接管、关闭或注入外部启动的 Codex 会话。
- 不联网检查更新；更新入口固定显示“尚未配置”。
- 受管数据固定保存在当前用户的 `%LOCALAPPDATA%\CodexStyle`，由仓库源码构建的 Windows x64 N-API secure-store 访问。
- 导入包、图片和 Safe CSS 会按 [REQUIREMENTS.md](./REQUIREMENTS.md) 的上限与安全规则校验。

## 环境

- Windows x64
- Node.js `22.22.0`、npm `10.9.4`
- Visual Studio Build Tools 2022（MSVC x64）
- Windows SDK `10.0.26100.0`

安装依赖：

```powershell
npm ci
```

## 开发与验证

```powershell
npm run dev
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:renderer
npm run test:integration
npm run test:e2e
npm run architecture:check
```

`test:unit` 会先从源码编译 native secure-store；`test:e2e` 会先准备锁定版本的 Electron 二进制，再构建应用并在隔离的临时 `%LOCALAPPDATA%` 中启动真实 Electron shell。

## 构建安装包

```powershell
npm run package:win
npm run verify:package
```

安装器输出为 `release/CodexStyle-0.1.0-x64.exe`。包校验会检查主资源、应用图标、安装器、x64 native addon 以及 addon 的实际加载能力。

## 产品契约

- [需求与验收](./REQUIREMENTS.md)
- [架构与交付计划](./PLAN.md)
- [当前验证进度](./TASK_PROGRESS.md)
