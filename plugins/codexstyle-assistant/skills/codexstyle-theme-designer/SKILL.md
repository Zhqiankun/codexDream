---
name: codexstyle-theme-designer
description: Create, refine, validate, or select CodexStyle themes through the local CodexStyle MCP tools. Use when a user asks Codex to generate colors, derive a theme, optimize readability, inspect the theme library, or choose a saved theme.
---

# CodexStyle Theme Designer

Use the `codexstyle` MCP server as the only data and mutation boundary. Never read or edit CodexStyle storage files directly.

## Workflow

1. Call `status`, then `list_themes`.
2. Resolve the source theme from the user's exact name or the selected theme. Ask only when multiple themes remain plausible.
3. Read the source with `get_theme`.
4. Never update a saved theme. Call `create_theme_draft` with `sourceLibraryId` to preserve its background and settings, or omit the source for a blank draft.
5. Generate every color in the palette contract. Read [references/palette-contract.md](references/palette-contract.md) when creating or changing colors.
6. Call `validate_palette`. Revise failed foreground/surface pairs before writing.
7. Call `update_theme_draft` with the draft's current `revision`, the complete 29-color object, and the intended appearance.
8. Tell the user the draft name and ask them to review it in CodexStyle Live Preview and save it there.

Only call `select_theme` when the user explicitly asks to select an already saved theme. Commit, delete, import, export, and Codex-launch actions are intentionally unavailable.

## Default aesthetic

If the user has not explicitly specified colors or a visual direction, use this direction while still respecting the selected background image and accessibility checks:

> 现代奢华美学，浓郁而克制的配色，深色基调搭配少量高亮点缀，宝石色调，高级材质，丝绒、漆面、玻璃与金属细节，精致光影，强烈但优雅的明暗对比，高端品牌广告质感，简洁构图，大量留白，华丽但不俗艳。

Explicit user colors, references, or style choices always take precedence over this default.
