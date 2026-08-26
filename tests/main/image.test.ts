import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  readImageFileBounded,
} from "../../src/main/infra/image";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
});

describe("bounded external image reads", () => {
  it("reads a stable regular file without changing its bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-image-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const path = join(root, "background.png");
    const source = Buffer.from([1, 2, 3, 4]);
    await writeFile(path, source);

    await expect(readImageFileBounded(path)).resolves.toEqual(source);
  });

  it("rejects an oversized file before allocating its full contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "codexstyle-image-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const path = join(root, "oversized.png");
    const file = await import("node:fs/promises").then(({ open }) =>
      open(path, "w"),
    );
    await file.truncate(MAX_IMAGE_BYTES + 1);
    await file.close();

    await expect(readImageFileBounded(path)).rejects.toThrow(
      "UNSAFE_IMAGE:image-size",
    );
  });
});
