import { isReasoningEffort, type ReasoningEffort } from "../../contracts";
import type { ThemeIndex, ThemeRecord } from "../domain/theme";
import { validateImage } from "./image";
import { managedThemeFile, type SecureManagedStore } from "./secure-store";

export type ReasoningImageBytes = Partial<Record<ReasoningEffort, Buffer>>;
export const MAX_BACKGROUND_SET_BYTES = 32 * 1024 * 1024;
const FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/u;

export function reasoningReferences(
  record: ThemeRecord,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record.reasoningBackgrounds ?? {}).map(([effort, image]) => [
      effort,
      image.file,
    ]),
  );
}

export function validReasoningImages(record: ThemeRecord): boolean {
  const map = record.reasoningBackgrounds;
  if (
    map !== undefined &&
    (!map || typeof map !== "object" || Array.isArray(map))
  )
    return false;
  let total = record.backgroundBytes ?? 0;
  for (const [effort, image] of Object.entries(map ?? {})) {
    if (
      !isReasoningEffort(effort) ||
      !image ||
      typeof image !== "object" ||
      Object.keys(image).sort().join() !== "bytes,file,mime,sha256" ||
      !FILE.test(image.file) ||
      !["image/png", "image/jpeg", "image/webp"].includes(image.mime) ||
      !/^[a-f0-9]{64}$/u.test(image.sha256) ||
      !Number.isSafeInteger(image.bytes) ||
      image.bytes < 1 ||
      image.bytes > 10 * 1024 * 1024
    )
      return false;
    total += image.bytes;
  }
  const refs = record.json.reasoningBackgrounds;
  if (
    refs !== undefined &&
    (!refs || typeof refs !== "object" || Array.isArray(refs))
  )
    return false;
  const expected = reasoningReferences(record);
  return (
    total <= MAX_BACKGROUND_SET_BYTES &&
    Object.keys(refs ?? {}).length === Object.keys(expected).length &&
    Object.entries(expected).every(
      ([effort, file]) => (refs as Record<string, unknown>)[effort] === file,
    ) &&
    (record.json.backgroundMode === undefined ||
      record.json.backgroundMode === "normal" ||
      record.json.backgroundMode === "reasoning")
  );
}

/** 档位图片参与主题现有索引事务：独立 UUID、先写后引用，失败恢复旧字节。 */
export class ReasoningImages {
  private cache = new Map<string, Buffer>();
  constructor(
    private readonly store: SecureManagedStore,
    private readonly allocate: (extension: string) => string,
  ) {}
  snapshot(): Map<string, Buffer> {
    return new Map(this.cache);
  }
  restore(snapshot: Map<string, Buffer>): void {
    for (const [file, bytes] of snapshot) {
      const current = this.store.readFile(managedThemeFile(file));
      if (!current?.equals(bytes))
        this.store.writeFileAtomic(managedThemeFile(file), bytes);
    }
    // 先恢复旧字节，待索引也回到旧版本后再清理新文件，避免回滚中断产生悬空引用。
    for (const [file, bytes] of snapshot) this.cache.set(file, bytes);
  }
  get(record: ThemeRecord): ReasoningImageBytes {
    return Object.fromEntries(
      Object.entries(record.reasoningBackgrounds ?? {}).map(
        ([effort, image]) => [effort, this.cache.get(image.file)],
      ),
    );
  }
  async validate(record: ThemeRecord): Promise<void> {
    if (!validReasoningImages(record))
      throw new Error("UNSAFE_IMAGE:reasoning-metadata-or-total-size");
    for (const image of Object.values(record.reasoningBackgrounds ?? {})) {
      const bytes = this.store.readFile(managedThemeFile(image.file));
      if (!bytes) throw new Error("STORE_TAMPERED:reasoning-file");
      const info = await validateImage(bytes, image.file);
      if (
        info.mime !== image.mime ||
        info.sha256 !== image.sha256 ||
        info.bytes !== image.bytes
      )
        throw new Error("UNSAFE_IMAGE:reasoning-fingerprint");
      const cached = this.cache.get(image.file);
      if (cached && !cached.equals(bytes))
        throw new Error("UNSAFE_IMAGE:reasoning-changed");
      this.cache.set(image.file, bytes);
    }
  }
  async stage(record: ThemeRecord, images: ReasoningImageBytes): Promise<void> {
    if (!record.reasoningBackgrounds && !Object.keys(images).length) return;
    const next: NonNullable<ThemeRecord["reasoningBackgrounds"]> = {};
    let total = record.backgroundBytes ?? 0;
    for (const [effort, bytes] of Object.entries(images)) {
      if (!isReasoningEffort(effort) || !bytes)
        throw new Error("UNSAFE_IMAGE:reasoning-effort");
      const source = record.reasoningBackgrounds?.[effort];
      if (!source) throw new Error("UNSAFE_IMAGE:reasoning-reference");
      const info = await validateImage(bytes, source.file);
      if (
        info.sha256 !== source.sha256 ||
        info.mime !== source.mime ||
        info.bytes !== source.bytes
      )
        throw new Error("UNSAFE_IMAGE:reasoning-fingerprint");
      total += info.bytes;
      if (total > MAX_BACKGROUND_SET_BYTES)
        throw new Error("UNSAFE_IMAGE:background-set-too-large");
      // 新导入或派生记录尚未进入索引，分配器还看不到它的 ID 和普通背景。
      const excluded = new Set([
        record.libraryId,
        record.backgroundFile?.slice(0, 36),
      ]);
      let file: string | undefined;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = this.allocate(info.extension);
        if (!excluded.has(candidate.slice(0, 36))) {
          file = candidate;
          break;
        }
      }
      if (!file) throw new Error("STORE_TAMPERED:reasoning-file-conflict");
      this.cache.set(file, Buffer.from(bytes));
      this.store.writeFileAtomic(managedThemeFile(file), bytes);
      if (!this.store.readFile(managedThemeFile(file))?.equals(bytes))
        throw new Error("STORE_TAMPERED:reasoning-write");
      next[effort] = {
        file,
        mime: info.mime,
        sha256: info.sha256,
        bytes: info.bytes,
      };
    }
    if (
      Object.keys(next).length !==
      Object.keys(record.reasoningBackgrounds ?? {}).length
    )
      throw new Error("UNSAFE_IMAGE:reasoning-missing");
    record.reasoningBackgrounds = next;
    record.json = {
      ...record.json,
      reasoningBackgrounds: reasoningReferences(record),
    };
  }
  async copy(record: ThemeRecord): Promise<void> {
    if (!Object.keys(record.reasoningBackgrounds ?? {}).length) return;
    await this.validate(record);
    await this.stage(record, this.get(record));
  }
  /** 索引已提交后才删除不再被活动主题或 checkpoint 引用的旧图。 */
  cleanup(index: ThemeIndex): void {
    const referenced = new Set(
      records(index).flatMap((record) =>
        Object.values(record.reasoningBackgrounds ?? {}).map(
          (image) => image.file,
        ),
      ),
    );
    for (const file of this.cache.keys())
      if (!referenced.has(file)) {
        this.remove(file);
        this.cache.delete(file);
      }
  }
  private remove(file: string): void {
    if (this.store.readFile(managedThemeFile(file)) === undefined) return;
    this.store.removeFile(managedThemeFile(file));
    if (this.store.readFile(managedThemeFile(file)) !== undefined)
      throw new Error("STORE_TAMPERED:reasoning-cleanup");
  }
}
export function records(index: ThemeIndex): ThemeRecord[] {
  return [...index.themes, ...index.checkpoints.map((item) => item.record)];
}
