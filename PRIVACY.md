# CodexStyle Privacy Policy

Effective date: August 28, 2026

This policy covers CodexStyle itself. CodexStyle is an independent community project and is not affiliated with, endorsed by, or sponsored by OpenAI.

## Summary

CodexStyle is local-first. It has no user accounts, cloud synchronization, advertising, telemetry, analytics, or automatic crash-reporting service. The application does not sell personal data and does not send themes, preferences, imported assets, or Codex conversation content to the maintainer or to SignPath.

## Data stored on the device

CodexStyle stores its managed data for the current Windows user under:

```text
%LOCALAPPDATA%\CodexStyle
```

This data can include saved themes, drafts, imported background images and icons, constrained Safe CSS, preferences, selection state, update state, and security or session-ownership metadata needed to manage a Codex session launched by CodexStyle. Theme ZIP exports are written only to the location the user chooses in the native save dialog.

CodexStyle does not intentionally read or persist Codex conversation content. Local process, Microsoft Store package, port, and session identity information is used only to validate and manage the Codex session started by CodexStyle. It is not uploaded by CodexStyle.

## Network activity

Theme editing, preview, import, export, and local theme storage do not require a network connection. CodexStyle does not poll in the background and does not silently download or install updates.

The installed Windows build contacts the fixed CodexStyle GitHub Releases endpoint only after the user explicitly chooses **Check and update**. GitHub may receive ordinary request metadata such as the IP address and user agent under the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). CodexStyle uses the response only to check, download, verify, and—after another explicit user choice—install an application update. The portable ZIP build does not perform in-app updates.

Codex Desktop may independently connect to OpenAI when the user launches or uses it. That network activity belongs to Codex Desktop and the user's OpenAI account, not to CodexStyle. Users should consult OpenAI's applicable privacy terms for that service.

SignPath is used in the software release process if and when code signing is enabled. CodexStyle does not send end-user runtime data to SignPath.

## Local CDP connection

To apply a selected visual theme at runtime, CodexStyle may start and verify a Codex Desktop session and connect to that session through the Chrome DevTools Protocol (CDP). The CDP listener and client are restricted to the literal loopback address `127.0.0.1`; CodexStyle does not expose CDP on a LAN address, a public interface, or a remote host.

The local CDP connection is used only for the user-initiated, CodexStyle-owned, identity-verified session. It applies the theme at runtime and does not upload CDP traffic, page content, or conversation content to the maintainer, GitHub, or SignPath.

## Codex installation and system changes

CodexStyle does not modify the installed Codex application, `WindowsApps`, `app.asar`, Codex's official signature, Windows access-control lists, or Windows execution policies. It does not attach to Codex sessions launched outside CodexStyle. Theme changes apply only at runtime to a session launched and verified by CodexStyle.

## Retention, deletion, and uninstall

Local data remains on the device until the user deletes individual themes in CodexStyle or removes the local data directory. Uninstalling the NSIS application removes the installed program files but intentionally leaves `%LOCALAPPDATA%\CodexStyle` in place so themes and settings can survive an upgrade or reinstall. Deleting a portable application copy also does not remove this managed data.

To remove all CodexStyle data:

1. Export any themes the user wants to keep.
2. Exit CodexStyle completely from the system tray.
3. Uninstall or delete the application files as applicable.
4. Delete `%LOCALAPPDATA%\CodexStyle` manually.

Deleting that directory permanently removes the locally stored themes, assets, preferences, and managed state. CodexStyle has no cloud copy from which to restore them.

## User-provided reports

If a user opens an issue or otherwise contacts the maintainer, CodexStyle receives only the information the user chooses to provide. GitHub issues may be public. Users should remove secrets, conversation content, personal information, and private theme assets before attaching logs, screenshots, or files.

Privacy questions may be submitted through the repository's [issue tracker](https://github.com/Zhqiankun/codexDream/issues).

## Policy changes

Material changes to this policy are published in the public repository with their revision history. Continued use of a new release is subject to the policy shipped or linked with that release.

---

# CodexStyle 隐私政策

生效日期：2026 年 8 月 28 日

本政策仅适用于 CodexStyle 本身。CodexStyle 是独立的社区项目，与 OpenAI 不存在隶属、认可或赞助关系。

## 摘要

CodexStyle 坚持本地优先，不提供用户账号、云同步或广告，也不包含遥测、使用分析或自动崩溃上报服务。应用不会出售个人数据，也不会把主题、偏好、导入素材或 Codex 对话内容发送给维护者或 SignPath。

## 设备上的本地数据

CodexStyle 把当前 Windows 用户的受管数据保存在：

```text
%LOCALAPPDATA%\CodexStyle
```

这些数据可能包括已保存主题、草稿、导入的背景图片和图标、受约束的 Safe CSS、偏好、选择状态、更新状态，以及管理由 CodexStyle 启动的 Codex 会话所需的安全或会话所有权元数据。导出主题 ZIP 时，文件只会写入用户在系统保存对话框中选择的位置。

CodexStyle 不会主动读取或持久保存 Codex 对话内容。本地进程、Microsoft Store 包、端口和会话身份信息只用于验证和管理 CodexStyle 启动的 Codex 会话，CodexStyle 不会上传这些信息。

## 网络行为

主题编辑、预览、导入、导出和本地存储均不要求联网。CodexStyle 不会在后台轮询，也不会静默下载或安装更新。

只有用户明确点击**检查并更新**后，Windows 正式安装版才会访问固定的 CodexStyle GitHub Releases 地址。GitHub 可能依据其 [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)接收 IP 地址、User-Agent 等常规请求元数据。CodexStyle 仅使用响应来检查、下载和验证应用更新，并在用户再次明确选择后执行安装。便携 ZIP 版本不执行应用内更新。

用户启动或使用 Codex Desktop 时，Codex Desktop 可能独立连接 OpenAI。该网络行为属于 Codex Desktop 及用户的 OpenAI 账号，不属于 CodexStyle。用户应查阅 OpenAI 对该服务适用的隐私条款。

如果未来启用代码签名，SignPath 仅用于软件发布流程。CodexStyle 不会向 SignPath 发送最终用户的运行时数据。

## 本地 CDP 连接

为了在运行时应用用户选择的视觉主题，CodexStyle 可以启动并验证一个 Codex Desktop 会话，再通过 Chrome DevTools Protocol（CDP）连接该会话。CDP 监听端与客户端仅限字面回环地址 `127.0.0.1`；CodexStyle 不会把 CDP 暴露到局域网地址、公共网络接口或远程主机。

本地 CDP 连接仅用于用户主动发起、由 CodexStyle 拥有并通过身份验证的会话。它只在运行时应用主题，不会把 CDP 流量、页面内容或对话内容上传给维护者、GitHub 或 SignPath。

## Codex 安装与系统修改

CodexStyle 不修改已安装的 Codex 应用、`WindowsApps`、`app.asar`、Codex 官方签名、Windows 访问控制列表或 Windows 执行策略，也不会附着到从 CodexStyle 外部启动的 Codex 会话。主题只会在运行时作用于由 CodexStyle 启动并验证通过的会话。

## 保留、删除与卸载

本地数据会一直保留在设备上，直到用户在 CodexStyle 中删除单个主题，或主动删除本地数据目录。卸载 NSIS 正式安装版会移除已安装的程序文件，但会有意保留 `%LOCALAPPDATA%\CodexStyle`，使主题和设置可以跨升级或重装继续使用。删除便携版程序文件也不会移除这份受管数据。

如需彻底移除 CodexStyle 数据：

1. 先导出希望保留的主题。
2. 从系统托盘彻底退出 CodexStyle。
3. 根据所用版本卸载或删除应用程序文件。
4. 手动删除 `%LOCALAPPDATA%\CodexStyle`。

删除该目录会永久移除本地主题、素材、偏好和受管状态。CodexStyle 不保留可用于恢复的云端副本。

## 用户主动提供的信息

如果用户提交 Issue 或通过其他方式联系维护者，维护者只会收到用户主动提供的信息。GitHub Issue 可能公开。附加日志、截图或文件前，请移除密钥、对话内容、个人信息和私有主题素材。

隐私问题可通过仓库的 [Issue 页面](https://github.com/Zhqiankun/codexDream/issues)提交。

## 政策变更

本政策如有重大修改，将连同修订历史发布在公开仓库中。使用新版本时，以该版本附带或链接的政策为准。
