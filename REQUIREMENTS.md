# CodexStyle 需求与验收

## 目标

CodexStyle 是仅支持 Windows x64 的 Electron 桌面工具，提供本地主题库、离线 Studio、普通 ZIP 导入/导出、托盘常驻，以及对本工具启动并完整验证身份的官方 Microsoft Store `OpenAI.Codex` 会话进行主题注入。

## 非目标

- 在线 Gallery、账号登录、投稿、云同步或协作。
- 网页一键换肤、`dreamskin://` 或其他深链。
- 后台下载、未由用户触发的安装、任意更新源或更新官方 Codex。固定 Release 元数据的有界定时检查不在此列。
- 注入、重启或关闭用户从外部启动的 Codex。
- WindowsApps ACL/所有权修改、二进制复制、asar 修改、签名绕过或直接 exe 回退。

## 用户流程

1. 用户打开 CodexStyle；关闭主窗口时应用隐藏至托盘，只有托盘“退出”结束工具。
2. 用户在离线 Studio 创建、编辑、预览并保存主题，或导入兼容普通 ZIP。导入只加入主题库，不自动应用。
3. 用户显式选择一个 ready 主题用于下次由本工具启动的 Codex 会话。
4. 若已有任何外部官方 Codex 进程，工具只提示用户自行关闭；取消或等待均不改变该会话。
5. 外部会话关闭后，用户由工具启动 Codex。工具仅在 AppX、进程、回环端口、Browser ID 和 renderer 标记全部验证通过后注入。
6. CDP 参数未透传、端点身份不符或选择器不兼容时，工具显示不兼容并保持未注入，不做权限或启动方式绕过。
7. 暂停和恢复仅影响后续注入；不追溯重写当前页面。运行中的已拥有会话需要改变主题时，提示用户关闭后重启。
8. 更新入口可见；Windows x64 NSIS 正式安装版在启动完成后及每 20 分钟从固定 GitHub Release 更新源静默检查最新稳定版，只在按钮旁提示，不自动下载。用户点击后才在应用内下载；下载完成且 SHA-512 校验通过后，用户可选择立即重启安装或退出时安装。开发版与 ZIP 便携版明确提示不支持，并保留经过校验的 Release 页面作为手动下载回退。

## 主题契约

内部存储主键为 UUID `libraryId`；外部 `theme.json.id` 不是主键。新建和编辑使用严格 v1 主题字段集，受管索引使用 v2 并只允许从旧 v1 单向迁移。背景与 checkpoint 文件使用全局唯一 UUID；替换和恢复采用 copy-on-write，索引原子替换是唯一提交点，不能先覆盖活动图片。

每个主题还包含以下展示配置，并由 Studio 预览、真实 Codex 注入和简化 ZIP 共用：

- `backgroundScope` 只能为 `"content"`（仅内容区）或 `"window"`（全窗口）。
- `sidebarOverlayOpacity` 是 `0` 到 `100` 的整数，表示全窗口模式下左侧栏固定深色遮罩层的强度；`colors.panel` 保持为独立底色且保留自身 alpha，两层共同合成，任一透明度调整都必须可见。Studio 与真实注入使用同一双层 `background`，并同时覆盖宿主侧栏本体及其继承背景的 `::after`。仅内容区模式直接使用 panel 原值，不消费遮罩值，Studio 必须禁用控件并解释原因。
- 旧的内部主题或 ZIP 缺少上述字段时按 `backgroundScope: "window"`、`sidebarOverlayOpacity: 75` 读取；新建、编辑和简化导出必须显式写入这两个字段。
- 修改任一展示配置都按普通主题编辑处理：递增 revision、退回 draft、使正式导入项变为已编辑并只能导出简化 ZIP。
- `appearance` 只能为 `auto | light | dark`。`art` 包含 `focusX/focusY`（`0..1`）、`safeArea`（`none | left | right`）和 `taskMode`（`ambient | full | off`）。背景焦点必须立即改变预览与真实注入的图片定位。
- `colors` 的兼容基线仍为 `background/panel/panelAlt/accent/accentAlt/secondary/highlight/text/muted/line` 十个安全颜色值；当前可选扩展为 `sidebarText/assistantPanel/assistantMessageText/userMessageText/composerText/changeCardBackground/changeCardText/topBarBackground/topBarText/threadTabBackground/threadTabText/homeTitleText/homeCardBackground/homeCardText/activityBackground/activityText/activityMuted/accentText/selectionText`。main 读取旧主题时必须补全缺失扩展：消息、输入与首页主要文字继承正文色，文件变更与首页卡片背景继承次级面板色，顶部栏及命令/思考次要文字继承说明文字，会话标题优先继承顶部栏颜色，发送图标与选区文字兼容旧页面背景前景；再将规范化后的二十九色转换为登记的 `--ds-theme-color-*` 变量，供受控注入或高级 Safe CSS 使用。
- 文件变更卡只允许外层卡片绘制一次 `changeCardBackground`；宿主的列表 surface、文件行、展开/收起操作及内嵌 diff surface 必须透明继承，避免半透明颜色重复合成。`changeCardText` 覆盖标题、普通操作和文件路径，新增/删除数量继续保留宿主的绿/红状态色。
- `homeCards` 固定为四项，每项包含安全 `color` 与 `mode: color | image`；图片模式还必须包含主进程生成、单项不超过 48 KiB 的 WebP Data URL。四张卡片可独立配置，旧主题缺少该字段时按既有 `colors.homeCardBackground` 生成四张纯色卡片。renderer 不接收源图片路径或原始字节；选择图片只能经版本化 IPC 由 main 有界读取、解码、裁切并压缩，之后按普通主题编辑递增 revision。
- `style` 包含 `mode`、四个配方开关和受限表面参数。`mode: "configured"` 时，sidebar、composer、message、dialog 配方以及 blur、radius、borderWidth、shadow 由结构化配置确定，并通过唯一共享生成器产生非空 `theme.css`；用户无需手改 CSS。`mode: "advanced"` 时保留既有 Safe CSS 源码编辑和验证能力。
- 新主题默认使用配置模式；旧内部主题和未声明 `style` 的导入包按高级模式读取，禁止迁移时覆盖原 CSS。两种模式都必须在 commit、导出、选择和注入前通过相同 Safe CSS 校验。
- Studio 提供“设计 / CSS / theme.json”三个面板。theme.json 源码只能在显式“校验并应用”后进入主题记录；其字段、大小、图片引用和配置范围由 main 复验，未应用的文本不得进入预览、ZIP 或注入。
- Studio 的颜色面板默认按“页面与窗口 / 对话与输入 / 标题与首页 / 命令与思考 / 操作与状态 / 文字与边界”展示用户可理解的作用位置，不把 `accentAlt` 等内部字段名作为主标签；显式切换到高级显示后才展示原始字段名。鼠标悬停或键盘聚焦任一颜色项时，LIVE PREVIEW 必须自动切到存在该目标的首页或对话页并标出实际影响区域，且预览映射必须与真实注入消费者一致。
- LIVE PREVIEW 的可配置区域必须支持反向定位：鼠标悬停或键盘聚焦时只高亮最具体的区域并显示中文提示；点击或键盘激活后切到“设计 → 颜色”、滚动并聚焦对应控件。定位是一次性请求，完成后不得锁住设计子页或阻止切换组件样式与高级配置。该交互仅为 renderer 本地状态，不进入主题、IPC 或持久化。
- `panelAlt` 的声明透明度是输入框、首页 composer 项目工具条与用户消息的最终透明度；配置模式、LIVE PREVIEW 和真实注入不得再通过额外 88%/92% 混合二次稀释。
- 普通设计与 CSS 编辑只提供一个“保存主题”入口；该入口按 revision 先持久化变更再提交 ready，不再暴露容易混淆的“应用草稿”按钮。theme.json 仍保留独立的“校验并应用”，因为未验证源码不得进入普通保存流程。
- 左侧主题列表单击只打开编辑，双击已保存主题将其选择为下次启动主题；草稿双击只提示先保存，不发生隐式提交。删除主题必须经明确确认，当前下次启动主题、last-known-good 主题或存在工具拥有会话时禁止删除；成功删除同时移除受管背景资产。
- 应用可携带经审核的图片主题包。包内 `catalog.json` 使用稳定 `packId` 和稳定主题 ID，声明每张图片的 SHA-256、完整二十九色、外观、焦点、画面、表面配置及背景范围；main 必须在写入该预设包前严格校验目录字段、图片格式、尺寸和哈希，renderer、preload 与 IPC 不接收资源路径或图片字节。
- v2 主题索引允许持久化有界且唯一的 `installedPresetPacks`。未安装主题包应在一次 store-owned 事务内追加 ready 主题、复制图片并提交 pack 标记，不改变已有主题、revision、选择项、last-known-good、暂停状态或 checkpoint；失败必须恢复旧索引并清理已暂存图片。后继主题包可声明多个被替代 pack 与每个旧主题的有界精确 fingerprint 列表，只原位升级仍保持任一已声明旧指纹且没有 checkpoint 的内置主题；用户改过或删过的主题必须保持原样且不得复活。
- 根目录 schema v4 / pack v7 `user-wallpapers-2026-08-30-v7` 及其 25 张图片是已发布、不可改写的历史基线。新增图片必须进入独立固定目录和独立 catalog；本轮增量包固定为 `resources/presets/user-wallpapers-2026-08-31-v8/`、`packId: user-wallpapers-2026-08-31-v8`，只首次引入 10 个全新稳定主题 ID，不替代、不迁移也不修改 v7。其图片再分发授权与原始文件映射记录在同目录 `SOURCES.md`，该记录必须随源码和安装包交付，但不得作为运行时可执行配置或放宽图片校验。

### CodexStyle Assistant

- 应用随包提供 `codexstyle-assistant` Codex 插件、主题设计 Skill、STDIO MCP、固定 Node.js 22.22.0 x64 专用运行时与完整许可证。首次安装/启用由用户点击 Studio 的固定安装入口，经 main 使用无用户参数的已核对 Codex CLI 和随包 marketplace 完成；renderer 不接收路径、命令或 CLI 输出。之后只要 CodexStyle 已运行，连接必须自动建立，不要求用户安装外部 Node.js，也不要求输入端口、路径或密钥。当前已打开的 Codex 未加载新插件时，应提示用户新建任务或重启 Codex。
- 主进程仅在字面 `127.0.0.1` 随机端口监听版本化 RPC，并为每次应用启动生成新 bearer token。端点描述只写入 native secure-store 管理的 `assistant/endpoint.json`；应用关闭时删除。浏览器 Origin、非回环访问、错误路径/方法/content-type、超限请求、无效 schema 或错误 token 必须 fail closed。
- MCP 仅暴露状态、主题列表、主题详情、完整配色校验、派生草稿、新建/更新草稿及显式选择已保存主题。插件不得直接读取或修改主题存储，不得返回背景图片字节、原始 CSS、端点 token 或文件路径，也不得提供保存、删除、导入、导出、启动 Codex 或覆盖 ready 主题的能力。
- Skill 必须先校验完整二十九色与前景/表面对比度，再按 revision 更新独立草稿，并要求用户回到 Studio Live Preview 审核和保存。仅当用户没有明确指定颜色、参考或视觉方向时，默认采用：“现代奢华美学，浓郁而克制的配色，深色基调搭配少量高亮点缀，宝石色调，高级材质，丝绒、漆面、玻璃与金属细节，精致光影，强烈但优雅的明暗对比，高端品牌广告质感，简洁构图，大量留白，华丽但不俗艳”；用户明确要求始终优先。

### 主题 ZIP

- 普通 `.zip`，文件位于根目录或唯一一层目录。
- 恰好包含非空 `theme.json`、非空 `theme.css` 和 `theme.json.image` 指向的一张 PNG/JPEG/WebP；四张首页卡片的可选 WebP 缩略图嵌入 `theme.json.homeCards`，不增加 ZIP 文件项。
- “导出主题 ZIP”使用同样的三件套，并在 `theme.json` 中完整保留当前二十九色、四张首页卡片及其他展示配置，供当前版本无损往返。Studio、preload 与 IPC 不再提供旧版兼容降级导出；历史十色、十二色、十八色或二十六色 ZIP 仍按既有兼容默认值安全导入。

### 正式旧包

- 包含 `manifest.json`、`theme.json`、`theme.css` 和一张 `background.jpg|png|webp`。
- 可选 `LICENSE.txt`、`manifest.sig`；manifest 字段、Windows 平台、最低版本、字节数和 SHA-256 必须严格验证。
- `manifest.sig` 保留但不验签，UI 标记“签名未验证”。
- 只有未编辑的正式导入项可重建原始正式包导出；编辑后只能导出新的完整主题 ZIP，不能再冒充原始正式包。

### 安全限制

- ZIP 不超过 32 MiB、最多 32 项、解压总量不超过 64 MiB。
- `theme.json` 兼容导入不超过 1 MiB，新建/正式包及 Studio 源码编辑不超过 384 KiB；其中每张首页卡片 WebP Data URL 不超过 48 KiB。CSS 不超过 256 KiB。
- 图片不超过 10 MiB，宽高各不超过 16384，总像素不超过 5000 万，并校验媒体魔数和实际解码。
- 拒绝绝对路径、路径穿越、重复路径、链接/reparse、嵌套归档、Windows 保留名、未知文件、歧义根目录、加密项和压缩滥用。
- Safe CSS 固定为 `dreamskin-safe-css/1`：最多 128 条规则、512 个声明、19 个登记 `data-ds-part`，仅允许 `hover`/`focus-visible`/`focus-within` 和白名单属性、变量与值；拒绝 `@`、`url()`、转义、注释和未知语法。
- 导入、commit、选择、注入前均复验；任何失败均 fail closed。

## 冲突与事务

- 同语义指纹返回 `DUPLICATE_CONTENT`，不写入。
- 同 `themeId` 不同内容先返回 `THEME_ID_CONFLICT`；只有用户显式选择“保留两份”或基于 `expectedRevision` 替换后才继续。
- 名称重复只提示，不覆盖。
- 替换使用 journal、backup、staging 和重读指纹；last-known-good 正在引用的主题禁止替换。
- 导入、编辑或导出失败不改变选择和 last-known-good。

## Windows 受管存储安全契约

- 仅支持 Windows x64。受管存储由仓库内源码受控、随应用构建的 N-API native 模块提供，不下载或信任第三方预编译 secure-store 二进制。
- 唯一受保护根为当前 Windows 用户的 `%LOCALAPPDATA%\\CodexStyle`。模块只接受编译期登记的相对 managed path/operation 标识，不接受 renderer、IPC、用户输入、绝对路径、UNC、盘符、ADS、`.`、`..` 或任意路径拼接。
- 主进程初始化存储时安全创建或打开根目录，校验其为真实目录且不是 reparse point，并持有根句柄至受管存储停止或应用退出。根句柄失效、身份变化或关闭顺序异常均 fail closed。
- `state/`、`themes/`、`transactions/`、`lock/` 与 `ownership/` 是完整保护域。每个路径段都必须从已验证父句柄出发，以 handle-relative NT I/O 和 `FILE_OPEN_REPARSE_POINT` 语义打开，再查询并拒绝任意 reparse tag、错误对象类型、路径逃逸或句柄身份异常。
- 保护域的读取、创建、锁、删除、恢复和提交不得调用 Node `fs` 作为 fallback。任一 native 加载、路径、reparse、对象类型、I/O、flush、rename 或恢复异常统一映射为既有 `STORE_TAMPERED`，且不得继续启动会话或静默重建状态。
- 受管原子写必须在目标同目录创建不可预测且受控的临时文件，完成有界写入并 flush 后，通过父目录句柄执行 handle-relative rename。失败后只能保留完整旧版本或完整新版本，恢复流程不得信任未经同样验证的临时、journal 或 backup。
- native `.node` 必须位于 ASAR unpacked 资源中并随 Windows x64 安装包交付。生产运行时模块缺失、加载失败、N-API/架构不兼容或解析到 ASAR 内错误位置时必须 `STORE_TAMPERED`，禁止使用 JavaScript 文件系统实现降级。
- 用户通过原生保存对话框选择的主题导出 ZIP 不属于受保护根；它继续使用既有有界 ZIP 导出、取消无副作用和目标文件原子替换规则。该例外不得成为访问任意 managed path 的通道。
- 主进程诊断日志固定写入 Electron `userData/logs`，与 secure-store 保护域隔离。日志使用按日本地 JSONL、单文件不超过 5 MiB、默认保留 7 天；启动时及每 24 小时清理过期文件。只允许事件、版本、错误码、Zod 字段路径和脱敏截断后的错误信息，不得写入主题/CSS/JSON/图片内容、Codex 对话、nonce、令牌、密钥、完整命令行或 URL 查询参数。用户只能通过固定 IPC 打开日志目录，renderer 不接收路径。日志创建、写入、清理或打开失败不得改变主题、会话或更新控制流。
- 当前 IPC 为 `v: 5`；`rendererReady` 使用固定 `v: 1` bootstrap 并返回主进程版本/协议，专门识别覆盖安装后仍驻留的旧主进程。其余请求版本不一致时必须返回明确的不兼容错误。该边界不改变 `../old/` 或主题 ZIP 三件套兼容契约。

## 会话与退出行为

- 只接受当前用户注册、`SignatureKind=Store`、非开发模式的 `OpenAI.Codex`。
- 只经 AppX/AUMID 启动，参数包含随机 256-bit nonce、`--remote-debugging-address=127.0.0.1` 和随机可用端口。
- 任一 PID、进程开始时间、SID、包身份、nonce、监听 PID、端口、Browser ID 或 selector profile 不匹配即终止 watcher，不重新附着。
- 外部会话绝不受控。发现外部会话时返回 `EXTERNAL_SESSION_RUNNING`。
- 托盘“退出”若存在已验证的工具拥有会话，先明确提示将关闭该会话；确认后才清理并优雅关闭。清理失败时工具保持运行，不强杀。
- 崩溃恢复的内部状态仍为 `ORPHANED`，界面只显示“上次会话待确认”及用户可理解的安全说明，不使用“孤儿会话”术语，也不自动附着、关闭或注入。
- `ownership/owned-session.json` 中格式严格、前缀正确且 profile 版本位于有界 `1..64` 的记录，无论早于或晚于当前版本，都必须按过期会话恢复为 `ORPHANED`，不能仅因升级或降级而误报 `STORE_TAMPERED`。非当前 profile 只允许显示过期状态，绝不能用于重新附着、关闭或注入；当前会话验证仍只接受当前 profile。未知前缀、非规范数字、`0`、大于 `64`、畸形字段或受管文件验证失败继续 fail closed。

## IPC 与错误

preload 暴露版本化强类型方法：snapshot、固定助手插件安装、主题读取/草稿/编辑（含背景、外观、焦点、配色、四张首页卡片、样式配置和显式 theme.json 应用）、放弃本次修改、主背景与单张首页卡片图片选择/commit/导入冲突处理/导出/选择、会话启动/暂停/恢复/结束，以及检查并下载更新、取消下载、选择安装时机和打开已验证 Release 页面。main 只发送 `studio:state-changed` 公共 snapshot 事件。renderer 不接收本地路径、下载路径、PID、端口、nonce、插件命令或 CLI 输出，也不能提交任意插件 ID、marketplace、更新地址、版本或安装器参数。

正式安装版启动完成后应在主进程静默检查一次更新，并在每次检查结束 20 分钟后再次检查；托盘驻留期间继续执行。后台检查只读取固定 Release 元数据，不自动下载，失败不弹窗且不覆盖稳定状态。发现新版时通过公共 snapshot 显示在顶部更新按钮旁，只有用户点击后才进入现有校验下载流程。

错误码至少包含：`IPC_INVALID`、`UNAUTHORIZED_RENDERER`、`OPERATION_BUSY`、`STALE_REVISION`、`UNSAFE_ARCHIVE`、`UNSAFE_CSS`、`UNSAFE_IMAGE`、`DUPLICATE_CONTENT`、`THEME_ID_CONFLICT`、`THEME_IN_USE`、`STORE_TAMPERED`、`STORE_PACKAGE_NOT_FOUND`、`EXTERNAL_SESSION_RUNNING`、`CDP_UNAVAILABLE`、`TARGET_INCOMPATIBLE`、`TARGET_IDENTITY_MISMATCH`、`INJECTION_FAILED`、`CLEANUP_FAILED`、`UPDATE_UNSUPPORTED`、`UPDATE_CHECK_FAILED`、`UPDATE_DOWNLOAD_FAILED`、`UPDATE_INSTALL_FAILED`、`UPDATE_OPEN_FAILED`。

## 可观察验收

1. 可创建、编辑、预览、保存本地主题；切换“仅内容区/全窗口”和调整侧栏遮罩时 LIVE PREVIEW 立即更新，保存、重开与简化 ZIP 往返后配置不丢失。
2. 有效旧版普通 ZIP 可导入；缺件、不安全 CSS/图片/归档或冲突不会静默覆盖。
3. 导入只进入主题库，必须显式选择才影响后续工具启动。
4. 支持的 Store Codex 上，仅工具启动且身份验证完整的会话显示主题；外部启动会话保持原样。
5. 已有外部会话时工具不终止它，用户关闭后才能由工具启动。
6. 暂停、恢复、关闭窗口至托盘和显式退出都有清晰状态结果。
7. CDP 或选择器不兼容时显示明确失败，不注入、不绕过、不破坏 Codex。
8. 正式安装版在启动完成后静默请求一次固定 GitHub `releases/latest/download` 更新元数据，之后每次检查结束 20 分钟再检查；慢请求不得重入，失败保持稳定状态并继续下轮。后台发现新版只在顶部按钮旁提示，不请求安装资产。用户点击更新后才下载元数据声明的资产；`latest.yml` 必须是稳定 SemVer，安装包名称、大小和 SHA-512 必须一致，下载进度可见且可取消。校验成功前不能安装，安装必须再次由用户选择“立即重启安装”或“退出时安装”。
9. 开发版、非 Windows、缺少 NSIS 安装标记或 ZIP 便携版返回 `UPDATE_UNSUPPORTED`，不得下载或执行安装器。当前不带更新能力的旧版本需要手动安装首个支持自更新的版本，此后才可应用内升级。
10. 受管根或任一路径段为 junction、symlink 或其他 reparse point，native 模块缺失/加载失败，或 handle-relative 操作出现身份异常时，应用返回 `STORE_TAMPERED`，不使用 Node `fs` 降级且不继续使用该存储。
11. 在写入、flush、rename 和恢复各失败点，重启后只能读到完整旧状态或完整新状态；`state/themes/transactions/lock/ownership` 均遵守相同根句柄和逐段校验规则。
12. 打包后的 `.node` 位于 ASAR unpacked 资源并可在无 Build Tools 的普通用户环境加载；删除该文件会稳定 fail closed。用户选择的外部导出 ZIP 仍可按原契约创建，且不能借此访问 managed path。
13. 全窗口模式下背景覆盖根区域并透过配置的侧栏遮罩可见；仅内容区模式下背景只覆盖主内容区域。相同主题配置在 LIVE PREVIEW 和真实 Codex 注入中使用相同作用域与遮罩规则。
14. 自动/浅色/深色、水平/垂直焦点、安全区、任务画面和二十九色配色在设计面板可配置，保存、重开、完整主题 ZIP 往返后配置不丢失；助手回复、用户消息、输入正文、发送图标、选区文字、文件变更卡片、顶部栏、当前会话标题、首页标题与快捷卡片、命令/编辑/思考摘要均有独立背景或文字控制。首页四张快捷卡片还可逐张选择独立颜色/透明度或本地图片，并在 LIVE PREVIEW 和真实 Codex 注入中一致；焦点、颜色变量和 color-scheme 同样一致。
15. 配置模式下启停四个样式配方或调整 blur/radius/border/shadow 会立即更新预览，并由共享生成器写入合法非空 theme.css；无需编辑源码。高级模式继续支持现有 CSS，旧主题不会被自动改写。
16. theme.json 面板可校验并应用合法源码；语法错误、未知字段、越界值或图片引用变化会被拒绝且不改变 revision、预览、选择或已持久化主题。
17. LIVE PREVIEW 可在“首页”和“对话”之间即时切换；两个页面复用同一主题根、侧栏、背景作用域、焦点、画面处理、颜色变量和 Safe CSS，切换只影响预览内容，不修改草稿或 revision。
18. 主题可在确认后删除并从重启后的主题库消失；已选择、last-known-good 或工具拥有会话期间的删除返回 `THEME_IN_USE` 且不改变主题或资产。左侧双击 ready 主题立即更新下次启动选择，双击草稿不提交。
19. 新建主题即带安全透明占位背景，可只调整颜色后保存；历史版本产生且精确符合旧草稿特征的无背景主题在保存时原子补齐透明背景。未知、损坏或显式图片无效的主题仍 fail closed，完整 ZIP 继续包含一张图片。
20. 非法颜色在 renderer 明确标注且不能提交；IPC 校验失败日志只包含安全字段路径与错误码。覆盖安装后新旧 renderer/main 混用时显示完全退出并重启的明确提示，不允许继续编辑或保存。
21. 主进程日志按日生成并自动清理，用户可从工作台打开日志目录；日志内容与保留策略符合上述隐私边界，日志基础设施故障不影响应用启动和安全状态。
22. 普通编辑区提供“保存主题”和“放弃本次修改”两个明确操作，并自动保持 patch-before-commit 的 revision 顺序；放弃操作恢复最近 commit 或新建起点，不删除主题、不改变下次启动选择。高级 JSON 的独立校验边界不变。
23. 启动检查界面只展示“Store Codex 可启动 / 会话可安全管理 / 主题与当前版本兼容”三项用户可理解结果，但底层 AppX、PID、SID、nonce、监听端口、Browser ID、CDP 和版本化选择器验证不得删减。配置模式的背景、二十九色、焦点、画面、配方、圆角、边框、阴影、模糊和发送图标都必须有真实注入消费者或明确失败反馈。
24. 当前 schema v4 / pack v7 内置图片主题包必须包含用户目录当前 25 张图片对应的 25 个 ready 记录；页面背景色与侧栏/弹窗面板色使用 20% alpha，左侧栏遮罩字段为 20%，边框与分隔线使用 20% alpha。全新主题库得到原有 2 个基础主题加 25 个图片主题。升级既有 pack 时，原 13 套只迁移精确未编辑项；三张内容已替换的图片还必须同时匹配 previous image SHA-256 才可原子替换，用户编辑或删除项不覆盖、不复活。12 个新增主题只在 v7 首次引入，不得被后续 pack 当作已删除主题复活。catalog、任一图片、替换写入或索引持久化失败时，主题记录与新旧图片字节必须整体回滚；安装包中的 catalog 与 25 张图片逐项通过 SHA-256 校验。
25. 下次启动主题选择卡位于编辑器与预览之前；左侧主题列表对真实背景图显示受控 `app://theme-asset` 缩略图，对透明占位或无自定义背景的主题显示页面背景色。列表不得获得文件路径，图片延迟解码；Studio 只提供完整主题 ZIP 与未编辑正式原包导出，不显示旧版兼容 ZIP 操作。
26. 从旧版本升级或从新版降级时，合法且有界的非当前 `ownership` profile 只能使启动状态进入 `ORPHANED`，Studio 必须正常打开且主题库保持不变；动态回归覆盖 profile `/1` 到当前前一版，并单独覆盖 `current + 1` 与 `/64`。未知前缀、非规范版本及 `/65` 仍稳定返回 `STORE_TAMPERED:ownership-state`；runtime profile 不相等时仍禁止连接和注入。
27. selector profile `/11` 必须命中 Codex `26.825.4187.0` 当前选中会话标签的真实表面与 `--app-shell-tab-background` 消费者、最大化 edge-scroll 当前会话标题、首页 `data-feature="game-source"` / `group/title` 标题结构，以及首页独立的 composer controls rail；仅当前选中或当前页面目标被覆盖。四张 `group/home-suggestions` 卡片按 DOM 顺序获得稳定索引，分别消费自己的颜色或有界 WebP 图片。响应式标题和首页 composer rail 在节点重建后不得闪回默认白色表面。
28. LIVE PREVIEW 首页与对话的主要颜色消费者均可反向定位；点击“我的消息文字”和任一首页快捷卡片必须分别聚焦准确颜色项或卡片项，定位后画面、组件样式和高级配置仍可正常切换。键盘激活、减少动画和焦点反馈均有回归覆盖。
29. Codex 受管启动、状态、安全检查、暂停/恢复与结束会话操作必须位于主题设计页；不再要求用户切换单独的“Codex 会话”页。底层身份验证、外部会话阻断和 operation gate 不得因页面合并而改变。
30. “输入文字”必须作为独立结构化颜色，仅作用于首页与对话 composer 的已输入正文和光标；旧主题缺少该字段时回落到通用正文色。占位文字继续消费 muted，输入框底部工具栏和首页“选择项目”rail 继续消费 secondary，三者不得互相覆盖。LIVE PREVIEW 必须同时展示并可反向定位输入正文、占位文字和工具栏文字。
31. Studio 必须提供 15 套互不重复的现代奢华基础配色，覆盖墨绿古铜、藏蓝银辉、酒红香槟、紫晶珍珠、奶油玫瑰金、炭灰蓝宝石等宝石色与金属色方向；原基础预设不再展示。根 v7 的 25 套与独立 v8 的 10 套图片主题必须按各自画面内容独立配色，不得只替换单个 accent。所有基础预设和图片主题的页面背景、panel 与 line 均为 20% alpha；输入正文、发送图标及选区前景/背景必须成对通过对比度回归。
32. Codex 插件首次启用后，CodexStyle 启动即创建自动发现端点，实际 MCP smoke 必须使用随包 Node.js runtime 按 `.mcp.json` 原样启动、列出七项固定工具并能读取状态和主题列表；错误 token 与浏览器 Origin 返回拒绝，应用退出后端点描述消失。一键安装只能调用固定随包 marketplace 和固定插件 ID，旧插件升级后必须核对安装版本及 enabled 状态；运行时、bundle、许可证与 marketplace 均须通过包内字节校验。派生操作保留源主题和背景，ready 主题更新被拒绝，过期 revision 被拒绝，失败的配色对比度不得写入。用户未明确颜色/视觉方向时使用锁定的现代奢华默认提示，明确颜色或风格时不得套用该默认。Studio 必须固定展示三步：首次只安装/启用一次，日常只启动 CodexStyle，随后在已加载插件的 Codex 任务中描述配色并回到 Studio 预览保存；`listening` 只能表述本机接口已自动就绪，不能推断插件未安装或暗示需要手动连接。
33. 桌面端左侧主题库必须限制在当前可用视口内，标题、新建/导入、名称搜索和底部统计固定，仅主题列表纵向滚动；100 个及以上主题不得拉长整页。搜索即时、忽略大小写与全半角差异，显示“匹配数/总数”，提供清空和无结果反馈，且不得修改主题顺序、总数、ready 计数、当前编辑项或下次启动选择。单击、双击、图片缩略图、颜色回退和图片失败回退行为保持；760px 以下恢复自动高度与横向列表。
34. v8 增量包必须与根 v7 并存加载；全新存储首次启动得到 2 个基础主题、25 个 v7 图片主题和 10 个 v8 图片主题，共 37 个 ready 主题。已有 v7 安装只追加尚未安装的 v8 包，旧 pack 标记、现有 revision、checkpoint、选择项与 last-known-good 保持；用户此前删除的 v7 主题不得因 v8 出现而复活，v8 安装并记录 pack 后用户删除的 v8 主题也不得在后续启动重新出现。验收必须证明根 `catalog.json` 与 25 张 v7 资产保持不变，v8 catalog 严格 schema、10 个新 ID/图片名/格式/尺寸/SHA-256、`introducedThemeIds`、20% 页面/panel/line、20% 侧栏遮罩、图片平均色合成后的正文/输入/操作/选区 WCAG 对比度、二次启动幂等、失败全回滚和安装包内 v7 + v8 两套目录均正确；`verify:package` 还必须核对 v8 的 10 张图片与 `SOURCES.md` 授权记录。
35. selector profile `/12` 必须覆盖插件与技能浏览页共用的 sticky 搜索 rail。只允许通过当前页面语义锚点 `input#plugins-page-search` 与同时具备 `sticky`、`bg-surface` 的祖先容器进行版本化匹配；rail 实色和其 `::after` 底部渐变都消费主题 `background`，SPA 后挂载仍须自动映射。禁止全局覆盖 Codex 的 `--color-surface`，不得借此影响对话框、卡片、按钮或普通输入表面。
36. selector profile `/13` 必须让助手标准 Markdown 在流式生成阶段和完成阶段使用同一 `assistantMessageText`。完成态继续覆盖 `h1..h6`、段落、列表、引用、强调与表格普通文字；流式态只补这些语义节点的直接 `_FadeIn_` 文本 span。任何包含链接、`code`、`pre` 或 `[data-markdown-copy="inline-code"]` 的流式包装节点必须排除，禁止设置可继承的 `-webkit-text-fill-color`，不得抹平链接、行内代码或代码块原生颜色。
