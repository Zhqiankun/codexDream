/** 原生输入区当前公开的思考档位；未知值必须回退普通背景。 */
export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
  "persistent",
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type BackgroundMode = "normal" | "reasoning";
export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === "string" &&
    (REASONING_EFFORTS as readonly string[]).includes(value)
  );
}
export function resolveReasoningBackground<T>(
  mode: BackgroundMode | undefined,
  normal: T,
  images: Partial<Record<ReasoningEffort, T>> | undefined,
  effort: unknown,
): T {
  return mode === "reasoning" && isReasoningEffort(effort)
    ? (images?.[effort] ?? normal)
    : normal;
}
