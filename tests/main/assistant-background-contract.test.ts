import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS,
  CODEX_ASSISTANT_PROTOCOL_VERSION,
  CodexAssistantChooseReasoningBackgroundParamsSchema,
  CodexAssistantClearReasoningBackgroundParamsSchema,
  CodexAssistantRequestSchema,
  CodexAssistantReplaceAndSaveBackgroundsParamsSchema,
  CodexAssistantSetBackgroundModeParamsSchema,
} from "../../src/contracts";

const target = { libraryId: randomUUID(), expectedRevision: 4 };
const editableEfforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
const backgroundRequests = [
  {
    method: "set_background_mode",
    schema: CodexAssistantSetBackgroundModeParamsSchema,
    params: { ...target, mode: "reasoning" },
  },
  {
    method: "choose_reasoning_background",
    schema: CodexAssistantChooseReasoningBackgroundParamsSchema,
    params: { ...target, reasoningEffort: "high" },
  },
  {
    method: "clear_reasoning_background",
    schema: CodexAssistantClearReasoningBackgroundParamsSchema,
    params: { ...target, reasoningEffort: "high" },
  },
];

describe("Codex assistant background contract", () => {
  it("accepts one or seven local image slots only through the explicit save tool", () => {
    const images = Object.fromEntries(
      ["normal", ...editableEfforts].map((slot) => [
        slot,
        `E:\\wallpapers\\${slot}.png`,
      ]),
    );
    for (const replacement of [{ low: "E:/壁纸/小龙.webp" }, images]) {
      expect(
        CodexAssistantRequestSchema.safeParse({
          v: CODEX_ASSISTANT_PROTOCOL_VERSION,
          id: randomUUID(),
          method: "replace_and_save_theme_backgrounds",
          params: { ...target, images: replacement },
        }).success,
      ).toBe(true);
    }
    for (const invalidImages of [
      {},
      { low: null },
      { persistent: "E:/wallpapers/old.png" },
      { normal: "E:/wallpapers/new.png", other: "E:/wallpapers/new.png" },
    ]) {
      expect(
        CodexAssistantReplaceAndSaveBackgroundsParamsSchema.safeParse({
          ...target,
          images: invalidImages,
        }).success,
      ).toBe(false);
    }
    for (const extra of [
      { mode: "normal" },
      { css: "private" },
      { save: false },
    ]) {
      expect(
        CodexAssistantReplaceAndSaveBackgroundsParamsSchema.safeParse({
          ...target,
          images,
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it.each([
    "image.png",
    "C:image.png",
    "C:/../private/image.png",
    "C:/folder/./image.png",
    "https://example.test/image.png",
    "file:///C:/image.png",
    "\\\\server\\share\\image.png",
    "\\\\?\\C:\\image.png",
    "\\\\.\\pipe\\image.png",
    "C:/image.png:stream.png",
    "C:/folder/NUL.png",
    "C:/COM1/file.png",
    "C:/folder /image.png",
    "C:/image.png.",
    "C:/image.svg",
    "C:/bad\u0000.png",
  ])("rejects non-local, ambiguous or non-image input %s", (filePath) => {
    expect(
      CodexAssistantReplaceAndSaveBackgroundsParamsSchema.safeParse({
        ...target,
        images: { normal: filePath },
      }).success,
    ).toBe(false);
  });

  it("exposes exactly the six editable reasoning efforts", () => {
    expect(CODEX_ASSISTANT_EDITABLE_REASONING_EFFORTS).toEqual(editableEfforts);
    for (const schema of [
      CodexAssistantChooseReasoningBackgroundParamsSchema,
      CodexAssistantClearReasoningBackgroundParamsSchema,
    ]) {
      for (const reasoningEffort of editableEfforts) {
        expect(schema.safeParse({ ...target, reasoningEffort }).success).toBe(
          true,
        );
      }
      for (const reasoningEffort of [
        "none",
        "minimal",
        "persistent",
        "unknown",
      ]) {
        expect(schema.safeParse({ ...target, reasoningEffort }).success).toBe(
          false,
        );
      }
    }
  });

  it("accepts only normal and reasoning background modes", () => {
    for (const mode of ["normal", "reasoning"]) {
      expect(
        CodexAssistantSetBackgroundModeParamsSchema.safeParse({
          ...target,
          mode,
        }).success,
      ).toBe(true);
    }
    expect(
      CodexAssistantSetBackgroundModeParamsSchema.safeParse({
        ...target,
        mode: "automatic",
      }).success,
    ).toBe(false);
  });

  it.each(backgroundRequests)(
    "$method accepts only a revision-bound target and its declared option",
    ({ method, schema, params }) => {
      const request = {
        v: CODEX_ASSISTANT_PROTOCOL_VERSION,
        id: randomUUID(),
        method,
        params,
      };
      expect(schema.safeParse(params).success).toBe(true);
      expect(CodexAssistantRequestSchema.safeParse(request).success).toBe(true);
      for (const invalidTarget of [
        { libraryId: "not-a-uuid" },
        { expectedRevision: -1 },
        { expectedRevision: 1.5 },
        { expectedRevision: "4" },
        { expectedRevision: undefined },
      ]) {
        expect(schema.safeParse({ ...params, ...invalidTarget }).success).toBe(
          false,
        );
      }
      for (const extra of [
        { path: "C:\\private\\background.png" },
        { filePath: "C:\\private\\background.png" },
        { bytes: [137, 80, 78, 71] },
        { imageDataUrl: "data:image/png;base64,cHJpdmF0ZQ==" },
      ]) {
        expect(schema.safeParse({ ...params, ...extra }).success).toBe(false);
        expect(
          CodexAssistantRequestSchema.safeParse({
            ...request,
            params: { ...params, ...extra },
          }).success,
        ).toBe(false);
      }
      expect(
        CodexAssistantRequestSchema.safeParse({ ...request, path: "image.png" })
          .success,
      ).toBe(false);
    },
  );

  it.each(["commit_theme", "commit_theme_draft", "delete_theme"])(
    "does not expose %s through the assistant protocol",
    (method) => {
      expect(
        CodexAssistantRequestSchema.safeParse({
          v: CODEX_ASSISTANT_PROTOCOL_VERSION,
          id: randomUUID(),
          method,
          params: target,
        }).success,
      ).toBe(false);
    },
  );
});
