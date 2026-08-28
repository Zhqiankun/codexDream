<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="CodexStyle 图标">
</p>

<h1 align="center">CodexStyle</h1>

<p align="center">
  面向 Windows 的本地优先 Codex Desktop 主题工作室与受管启动器。
</p>

<p align="center">
  <a href="https://github.com/Zhqiankun/codexDream/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/Zhqiankun/codexDream?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/platform-Windows%20x64-0078D4?style=flat-square">
  <img alt="本地优先" src="https://img.shields.io/badge/data-local--first-2E8B57?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

CodexStyle 用于设计、实时预览、保存、导入和导出 Microsoft Store 版 Codex Desktop 的视觉主题。它只会向由 CodexStyle 启动并验证通过的 Codex 会话应用主题，不修改已经安装的 Codex 应用。

> [!IMPORTANT]
> CodexStyle 是独立的社区开源项目，与 OpenAI 不存在隶属、认可或赞助关系。Codex 和 OpenAI 是 OpenAI 的商标。

## 效果展示

<p align="center">
  <a href="docs/viewImages/1a79b280-60db-4c51-86b9-afa3ee8ca0c6.png">
    <img src="docs/viewImages/1a79b280-60db-4c51-86b9-afa3ee8ca0c6.png" alt="应用粉色 CodexStyle 主题后的 Codex 首页" width="100%">
  </a>
</p>

<table>
  <tr>
    <td width="50%" align="center"><strong>对话工作区</strong></td>
    <td width="50%" align="center"><strong>主题化消息面板</strong></td>
  </tr>
  <tr>
    <td><a href="docs/viewImages/dbb7011a-a20e-479a-bae4-45e79009a708.png"><img src="docs/viewImages/dbb7011a-a20e-479a-bae4-45e79009a708.png" alt="应用粉色 CodexStyle 主题后的 Codex 对话工作区"></a></td>
    <td><a href="docs/viewImages/ba92a3fc-046c-4ffc-932c-bfa1b472517d.png"><img src="docs/viewImages/ba92a3fc-046c-4ffc-932c-bfa1b472517d.png" alt="应用主题后的用户与助手消息面板"></a></td>
  </tr>
</table>

## 功能亮点

- 提供 Codex 首页与对话页面的 16:9 实时预览。
- 内置 13 套壁纸主题预设，并支持调整颜色、透明度、背景图、面板样式、阴影、圆角、左侧栏文字、消息面板和发送图标。内置预设只追加一次，不覆盖已有本地主题。
- 导入背景图片和自定义图标时进行格式、尺寸与解码校验，并在页面显示明确要求。
- 本地主题库支持无损的当前主题 ZIP，以及显式面向 v1.0.x–v1.2.x 的旧版兼容 ZIP；兼容导出会移除六个新颜色字段，并拒绝旧版无法读取的高级 CSS。
- 为高级样式提供受约束的 Safe CSS。
- 独立的 Windows 应用图标、托盘图标和打包身份。
- 受管 Codex 启动流程，包含 Store 包检测、会话隔离、CDP 身份校验和版本选择器兼容性检查。
- 数据本地优先，通过 Windows x64 原生 secure-store 组件保护关键状态。
- Windows 正式安装版支持用户主动触发校验下载，显示进度并可取消、重启安装或退出时安装；后台检查只读取固定发布元数据，不会静默下载或安装。
- 提供受隐私边界约束的按日诊断日志，默认保留 7 天，并可在工作台一键打开日志目录用于排查。

## 下载

从 [GitHub Releases](https://github.com/Zhqiankun/codexDream/releases/latest) 下载 `v1.3.5`：

- `CodexStyle-1.3.5-x64.exe` — Windows 安装程序。
- `CodexStyle-1.3.5-x64.zip` — 免安装压缩包。
- `SHA256SUMS.txt` — 发布包与更新元数据的 SHA-256 校验值。

当前发布包未进行代码签名，Windows SmartScreen 可能显示“未知发布者”提示。运行前请先核对 SHA-256 校验值。

`v1.3.5` 新增 13 套带配色、外观模式、画面焦点和表面参数的壁纸预设。已有本地主题、当前选择、暂停状态和 checkpoint 均保持不变，预设包只追加一次。直接覆盖原安装即可，无需卸载；能够正常打开的 v1.3.1 及以上安装版可使用应用内更新。ZIP 便携版仍需手动更新。

## 运行要求

| 项目     | 要求                                     |
| -------- | ---------------------------------------- |
| 操作系统 | Windows 10/11 x64                        |
| Codex    | Microsoft Store 包 `OpenAI.Codex`        |
| 网络     | 编辑主题无需联网；Codex 本身可能需要网络 |
| 权限     | 默认使用普通用户权限，无需管理员权限     |

## 快速开始

1. 从最新 Release 安装或解压 CodexStyle。
2. 打开**主题设计**，选择预设或新建主题。
3. 调整颜色、透明度、面板、背景图、消息面板和发送图标，并通过实时预览确认效果。
4. 保存主题，然后打开 **Codex 会话**。
5. 关闭从外部启动的 Codex 窗口，选择已保存主题，再点击**启动 Codex**。

需要保留全部当前字段时使用**导出主题 ZIP**；仅在分享给 CodexStyle v1.0.x 至 v1.2.x 时使用**导出旧版兼容 ZIP**。未编辑的正式导入包可以原样导出，一旦编辑便不能再重建原始正式包。

CodexStyle 只会在确认 Store Codex 会话确实由本工具启动后应用主题。如果已安装的 Codex 版本不再匹配受支持的选择器配置，CodexStyle 会停在兼容性边界，不会注入不确定的样式。

## 安全边界

CodexStyle 会严格限制自身作用范围：

- 不修改 `WindowsApps`、`app.asar`、访问控制列表、官方签名或 Windows 执行策略。
- 不接管、关闭、重启或注入从 CodexStyle 外部启动的 Codex 会话。
- 只在运行时向由本工具拥有且验证通过的会话应用主题。
- 存储或应用前会校验导入的 ZIP、图片、图标和 Safe CSS。
- 不进行后台更新检查，不包含静默自动安装器，也不接入远程分析服务。只有用户点击**检查并更新**时才会访问 GitHub；仅 NSIS 正式安装版可下载更新，并且 SHA-512 校验通过后仍需用户明确选择安装时机。
- 受管数据固定保存在当前 Windows 用户的 `%LOCALAPPDATA%\CodexStyle`。

隐私、发布完整性、产品和安全契约请查看 [PRIVACY.md](PRIVACY.md)、[CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) 与 [REQUIREMENTS.md](REQUIREMENTS.md)。

## 开发

### 工具链

- Windows x64
- Node.js `22.22.0`
- npm `10.9.4`
- Visual Studio Build Tools 2019 或 2022（MSVC x64 C++ 工作负载）
- Windows SDK `10.0.19041.0` 或更高版本

### 本地启动

```powershell
git clone https://github.com/Zhqiankun/codexDream.git
cd codexDream
npm ci
npm run dev
```

### 完整验证

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

`test:unit` 会先从源码编译 native secure-store；`test:e2e` 会准备锁定版本的 Electron 运行时，构建应用，并使用隔离的临时本地数据目录启动真实 Electron shell。

### 构建 Windows 发布包

```powershell
npm run package:win
npm run verify:package
```

构建产物保存在 `release/`。包校验会检查渲染进程与主进程资源、图标、Windows x64 可执行文件、原生扩展架构及其实际加载能力。

正式二进制文件由 [Release 工作流](.github/workflows/release.yml) 构建，不使用维护者电脑上的本地产物。推送稳定的 `v*` 标签后，GitHub Windows Runner 会运行完整验证、构建安装包与免安装 ZIP、校验并发布 `latest.yml` 和 NSIS blockmap、重新生成 `SHA256SUMS.txt`、保留工作流产物并发布对应的 GitHub Release。频道清单最后上传，已经公开的同版本 Release 不允许覆盖。

## 项目结构

```text
src/contracts/          IPC 与主题共享契约
src/main/app/           主进程应用编排
src/main/domain/        主题领域模型
src/main/infra/         本地存储、ZIP、图片、CSS 与原生适配
src/main/platform/      Windows Store 与进程集成
src/main/session/       受管 Codex 会话及主题注入
src/preload/            收窄后的 Electron preload 桥接层
src/renderer/           React 主题工作室与会话界面
native/secure-store/    Windows x64 N-API secure-store 源码
tests/                  单元、渲染层、验收与 Electron E2E 测试
```

其他项目文档：

- [REQUIREMENTS.md](REQUIREMENTS.md) — 产品契约与验收标准。
- [PLAN.md](PLAN.md) — 架构与交付计划。
- [TASK_PROGRESS.md](TASK_PROGRESS.md) — 实现和验证记录。
- [PRIVACY.md](PRIVACY.md) — 本地数据与联网行为。
- [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) — 发布签名角色与政策。

## 参与贡献

欢迎提交 Issue 和 Pull Request。请保持文档约定的信任边界与单向模块依赖，并为行为变更补充测试。提交 Pull Request 前，请至少运行与改动相关的验证命令。

## 许可证

CodexStyle 使用 [MIT License](LICENSE) 开源。
