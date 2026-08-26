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
  });
});
