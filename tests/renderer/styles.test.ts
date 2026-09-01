import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styleFile = fileURLToPath(
  new URL("../../src/renderer/styles/global.css", import.meta.url),
);

describe("renderer styles", () => {
  it("keeps keyboard focus visible and adapts the studio to narrow windows", async () => {
    const css = await readFile(styleFile, "utf8");

    expect(css).toContain("button:focus-visible");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(
      ".mock-home-composer-wrap,\n.mock-conversation-composer-wrap {\n  width: min(69%, 450px);\n  align-self: center;",
    );
    expect(css).toContain("var(--preview-assistant-message-text");
    expect(css).toContain('data-preview-color-target="assistantMessageText"');
    expect(css).toContain("--preview-change-card-background");
    expect(css).toContain("--preview-change-card-text");
    expect(css).toContain("--preview-sidebar-surface");
    expect(css).toContain('data-sidebar-surface-transparent="true"');
    expect(css).not.toContain("--preview-sidebar-opacity");
    expect(css).not.toContain("rgb(\n    from var(--preview-panel");
    expect(css).toContain('data-preview-color-target="changeCardBackground"');
    expect(css).toContain('data-preview-color-target="changeCardText"');
    expect(css).toContain('data-preview-color-target="accentText"');
    expect(css).toContain('data-preview-color-target="selectionText"');
    expect(css).toContain("var(--preview-selection-text");
    expect(css).toContain(".mock-change-review {");
    expect(css).toContain("var(--preview-accent-text, #17120a)");
    expect(css).toContain(
      ".mock-composer-placeholder {\n  color: var(--preview-muted, #6f7d98);",
    );
    expect(css).toContain(
      ".mock-composer-input-text {\n  color: var(--preview-composer-text",
    );
    expect(css).toContain('data-preview-color-target="composerText"');
    expect(css).not.toContain(
      ".mock-composer-placeholder {\n  color: color-mix(in srgb, var(--preview-muted) 70%, transparent);",
    );
    expect(css).toContain('.color-value > input[aria-invalid="true"]');
    expect(css).toContain(".theme-search-control:focus-within");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("content-visibility: auto");
    expect(css).toContain("contain-intrinsic-size: auto 56px");
    expect(css).toContain("height: calc(100dvh - 64px)");
  });
});
