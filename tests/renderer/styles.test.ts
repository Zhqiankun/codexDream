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
    expect(css).toContain('data-preview-color-target="changeCardBackground"');
    expect(css).toContain('data-preview-color-target="changeCardText"');
  });
});
