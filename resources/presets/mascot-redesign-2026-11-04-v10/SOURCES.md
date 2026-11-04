# 四组角色六档重设计素材来源

本目录包含用户于 2026-11-04 委托重设计并授权随 CodexStyle v1.3.35 发布的四组主题：白龙 · 思考进阶、DeepSeek · 沧海鲸歌、Claude · 琥珀书庭和 Gemini · 星穹双子。

- 角色参考来自用户在对话中提供的四张设定图；参考图不随本包分发。
- 24 张最终 PNG 使用 OpenAI 内置图像生成工具生成。每组从低档小萌物逐步成长至华丽形态，六档保持不同全身动作。GPT 突出白龙特征，DeepSeek 突出海洋水流，Claude 突出阅读求知，Gemini 突出猫耳、猫尾与灵动姿态。
- 图片为 1672 × 941，Gemini ultra 为 1671 × 941；普通背景复用各组 low 发行资产。安装时普通背景与各档背景分别生成独立 UUID 文件；全部 SHA-256 由 catalog.json 固定声明，运行时继续验证媒体格式、尺寸与字节上限。
- 三套历史主题沿用 v9 themeId；新白龙主题使用独立 UUID v4。仅当既有主题精确匹配 v9 的图片哈希和完整内容指纹时原位升级，用户编辑和删除保持不变。历史发行图片保留原样。
- v9 基线指纹使用原 catalog 的名称、描述、配色、画面、样式、首页卡片、普通背景与六档图片哈希，经当前既有 writeThemeConfiguration、generateConfiguredCss 和 themeFingerprint 计算；测试再次以真实 v9 安装结果核对。
- 配色和阅读参数沿用用户已确认的现有四套主题。本包不包含原始对话、参考照片、生成草稿或本机主题库信息。
- 这些插画为用户委托制作的主题，不是 OpenAI、DeepSeek、Anthropic 或 Google 的官方主题，不表示相关品牌的赞助、背书或认可。

| 主题                | 资源文件                | 档位                                      |
| ------------------- | ----------------------- | ----------------------------------------- |
| 白龙 · 思考进阶     | `gpt-{effort}.png`      | low / medium / high / xhigh / max / ultra |
| DeepSeek · 沧海鲸歌 | `deepseek-{effort}.png` | low / medium / high / xhigh / max / ultra |
| Claude · 琥珀书庭   | `claude-{effort}.png`   | low / medium / high / xhigh / max / ultra |
| Gemini · 星穹双子   | `gemini-{effort}.png`   | low / medium / high / xhigh / max / ultra |

本文件记录来源和发布范围，不参与运行时配置解析，不改变图片、路径、字节数或校验规则。
