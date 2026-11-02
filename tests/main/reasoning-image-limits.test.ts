import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { ThemeRecord } from "../../src/main/domain/theme";
import {
  ReasoningImages,
  validReasoningImages,
} from "../../src/main/infra/reasoning-images";
import { validateImage } from "../../src/main/infra/image";

describe("reasoning image metadata bounds", () => {
  it("excludes a not-yet-indexed record ID and normal image UUID from allocation", async () => {
    const libraryId = "11111111-1111-4111-8111-111111111111";
    const backgroundId = "22222222-2222-4222-8222-222222222222";
    const slotId = "33333333-3333-4333-8333-333333333333";
    const image = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    const info = await validateImage(image, "source.png");
    const record = {
      libraryId,
      backgroundFile: `${backgroundId}.png`,
      backgroundBytes: 1,
      json: {},
      reasoningBackgrounds: {
        max: {
          file: `${slotId}.png`,
          mime: info.mime,
          sha256: info.sha256,
          bytes: info.bytes,
        },
      },
    } as unknown as ThemeRecord;
    const files = new Map<string, Buffer>();
    const store = {
      readFile: ({ fileName }: { fileName: string }) => files.get(fileName),
      writeFileAtomic: ({ fileName }: { fileName: string }, bytes: Buffer) =>
        files.set(fileName, bytes),
    };
    const candidates = [libraryId, backgroundId, slotId];
    const images = new ReasoningImages(
      store as never,
      () => `${candidates.shift()!}.png`,
    );
    await images.stage(record, { max: image });
    expect(record.reasoningBackgrounds!.max!.file).toBe(`${slotId}.png`);
    expect([...files.keys()]).toEqual([`${slotId}.png`]);
    expect(candidates).toEqual([]);
  });
  it("counts the normal image in the 32 MiB aggregate limit", () => {
    const unit = 1024 * 1024;
    const record = {
      backgroundBytes: 10 * unit,
      json: { backgroundMode: "reasoning", reasoningBackgrounds: {} },
      reasoningBackgrounds: {},
    } as unknown as ThemeRecord;
    const slots = ["low", "medium", "high"] as const;
    for (const [index, slot] of slots.entries()) {
      const file = `11111111-1111-4111-8111-11111111111${index}.png`;
      record.reasoningBackgrounds![slot] = {
        file,
        bytes: (index === 2 ? 2 : 10) * unit,
        mime: "image/png",
        sha256: "a".repeat(64),
      };
      (record.json.reasoningBackgrounds as Record<string, string>)[slot] = file;
    }
    expect(validReasoningImages(record)).toBe(true);
    record.reasoningBackgrounds!.high!.bytes += 1;
    expect(validReasoningImages(record)).toBe(false);
  });
});
