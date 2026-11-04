---
name: codexstyle-theme-designer
description: Create, refine, validate, or select CodexStyle themes through the local CodexStyle MCP tools. Use when a user asks Codex to generate colors, derive a theme, configure draft backgrounds, replace and save existing theme backgrounds, optimize readability, inspect the theme library, or choose a saved theme.
---

# CodexStyle Theme Designer

Use the `codexstyle` MCP server as the only data and mutation boundary. Never read or edit CodexStyle storage files directly.

## Workflow

1. Call `status`, then `list_themes`.
2. Resolve the source theme from the user's exact name or the selected theme. Ask only when multiple themes remain plausible.
3. Read the source with `get_theme`.
4. For colors, background-mode changes, and general design, call `create_theme_draft` with `sourceLibraryId` to preserve its background and settings, or omit the source for a blank draft. For an explicitly authorized replacement of images on an existing saved theme, use the bounded saved-background workflow below instead.
5. When creating or changing colors, generate every color in the palette contract. Read [references/palette-contract.md](references/palette-contract.md), call `validate_palette`, and revise failed foreground/surface pairs before writing.
6. For color changes, call `update_theme_draft` with the draft's current `revision`, the complete 29-color object, and the intended appearance. Background-only changes use the tools below and do not require a palette rewrite.
7. Always use the revision returned by the last successful mutation. On `STALE_REVISION`, read the theme again and reconcile the current state; do not blindly retry writes.
8. For drafts, tell the user the draft name and direct them to CodexStyle Live Preview to review and save it. For saved-background replacement, report the actual save and live-apply results from the tool.

Only call `select_theme` when the user explicitly asks to select an already saved theme. General commit, delete, import, export, arbitrary file access, and Codex-launch actions are unavailable. The named saved-background action below is the sole direct-save exception.

## Replace and save existing backgrounds

Requires plugin 0.1.3 or later and CodexStyle 1.3.35 or later. The user must authorize updating the existing saved theme; honor authorization already given in the conversation without asking again. Do not route a background replacement request into a duplicate theme.

1. Resolve the existing `ready` theme with `list_themes` and `get_theme`; use its current `libraryId` and `revision`. A draft or theme with unsaved edits is not eligible for this operation.
2. Call `replace_and_save_theme_backgrounds` with `libraryId`, `expectedRevision`, and `images`. `images` must contain at least one of `normal`, `low`, `medium`, `high`, `xhigh`, `max`, or `ultra`; each value is an absolute path to a local PNG, JPEG or WebP image. Use only images covered by the user's request. Do not send URLs, base64, network paths, file contents, or a background-mode parameter.
3. The desktop main process performs restricted image reads and validation, replaces the supplied slots together, and saves once. The plugin does not read the image files. Omitted slots, theme identity, colors, background mode, and all non-background settings remain unchanged. Compatibility slots `none`, `minimal`, and `persistent` are outside this action.
4. Inspect the returned sanitized `theme`, `replacedImages` slot-to-`{ sha256, bytes }` map, and `liveApply`. Report saving and live application separately: saving can succeed even when no owned Codex session can be updated. This action neither starts Codex nor changes the next-launch selection.
5. After `STALE_REVISION`, cancellation, timeout, or an uncertain connection result, read the theme again before deciding whether another write is needed. Do not blindly retry. Cancellation before the commit point discards the pending replacement; do not assume that a cancellation arriving after commit reverses a completed save.

The HTTP operation has a 120-second budget within the plugin's 150-second tool timeout. If an older desktop rejects the new action, report the required update; do not bypass the boundary by opening or editing managed storage.

## Draft backgrounds

These draft tools require plugin 0.1.2 or later and CodexStyle 1.3.33 or later. Update CodexStyle first, then use its **Install / update** button and open a new Codex task to load the updated plugin. An older desktop can reject the new tools as `INVALID_REQUEST`; report that it needs updating rather than retrying or editing storage directly.

- Read `backgroundMode` and `reasoningBackgrounds` from `get_theme`. Each effort has `hasImage` and `editable` metadata; no image bytes, paths, or URLs are exposed.
- Call `set_background_mode` with `mode: normal | reasoning`. Switching modes preserves every existing image and does not save or select the theme.
- To choose an image, first tell the user that a native file picker will open in CodexStyle, then call `choose_reasoning_background` with `reasoningEffort: low | medium | high | xhigh | max | ultra`. The user chooses the file locally. Never send image bytes, a URL, or a filesystem path to the tool.
- Call `clear_reasoning_background` only for the effort the user wants cleared. The compatibility efforts `none`, `minimal`, and `persistent` are readable but cannot be changed through MCP.
- All three mutations require a draft and its current `expectedRevision`. Run mutations one at a time, using the revision returned by the previous result. Create a separate derived draft before editing a saved theme. Each tool changes only the requested setting; choosing an image does not switch the mode.
- On cancellation, timeout, or disconnect, pending image selection is discarded. If the native picker remains open, ask the user to close it before another write; do not automatically retry. Read the theme again before resuming. `UNSAFE_IMAGE` means the existing image validation rejected the file; let the user choose a supported PNG, JPEG, or WebP.
- Finish by directing the user to Studio Live Preview to review and save the draft. These draft edits do not directly update a running Codex session; the separate saved-background action reports its live-apply result.

## Default aesthetic

If the user has not explicitly specified colors or a visual direction, use this direction while still respecting the selected background image and accessibility checks:

> 现代奢华美学，浓郁而克制的配色，深色基调搭配少量高亮点缀，宝石色调，高级材质，丝绒、漆面、玻璃与金属细节，精致光影，强烈但优雅的明暗对比，高端品牌广告质感，简洁构图，大量留白，华丽但不俗艳。

Explicit user colors, references, or style choices always take precedence over this default.
