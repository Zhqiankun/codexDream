import { createHash } from "node:crypto";
import { open, realpath, stat, type FileHandle } from "node:fs/promises";
import { extname, win32 } from "node:path";
import sharp from "sharp";

export interface ImageInfo {
  mime: string;
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

const mimeByExtension = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function readImageFileBounded(filePath: string): Promise<Buffer> {
  return readBoundedImage(filePath);
}

/** MCP 的路径只用于本次图片读取；受管数据始终只能经 secure-store 访问。 */
export async function readAssistantImageFileBounded(
  filePath: string,
  managedRoot: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  try {
    if (signal?.aborted) throw new Error("CANCELLED");
    if (
      !/^[a-z]:[\\/]/iu.test(filePath) ||
      !mimeByExtension.has(extname(filePath).toLowerCase())
    )
      throw new Error("UNSAFE_IMAGE:image-path");
    const outside = (candidate: string, root: string) => {
      const relative = win32.relative(
        root.toLowerCase(),
        candidate.toLowerCase(),
      );
      if (
        !relative ||
        (!relative.startsWith(`..${win32.sep}`) &&
          relative !== ".." &&
          !win32.isAbsolute(relative))
      )
        throw new Error("UNSAFE_IMAGE:managed-image-path");
    };
    outside(filePath, managedRoot);
    const actualRoot = await realpath(managedRoot);
    const actualPath = await realpath(filePath);
    if (!/^[a-z]:[\\/]/iu.test(actualPath))
      throw new Error("UNSAFE_IMAGE:image-path");
    outside(actualPath, managedRoot);
    outside(actualPath, actualRoot);
    const verify = async (file: FileHandle) => {
      if (signal?.aborted) throw new Error("CANCELLED");
      const resolved = await realpath(actualPath);
      outside(resolved, managedRoot);
      outside(resolved, actualRoot);
      if (
        win32.normalize(resolved).toLowerCase() !==
        win32.normalize(actualPath).toLowerCase()
      )
        throw new Error("UNSAFE_IMAGE:image-changed");
      const [opened, current] = await Promise.all([
        file.stat(),
        stat(resolved),
      ]);
      // realpath 与 open 之间被替换的路径不能指向另一个文件；硬链接也不能绕过受管域。
      if (
        opened.dev !== current.dev ||
        opened.ino !== current.ino ||
        opened.nlink !== 1
      )
        throw new Error("UNSAFE_IMAGE:image-changed");
    };
    return await readBoundedImage(actualPath, verify);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "CANCELLED" ||
        error.message.startsWith("UNSAFE_IMAGE"))
    )
      throw error;
    throw new Error("UNSAFE_IMAGE:image-read");
  }
}

async function readBoundedImage(
  filePath: string,
  verify?: (file: FileHandle) => Promise<void>,
): Promise<Buffer> {
  let file;
  try {
    file = await open(filePath, "r");
    await verify?.(file);
    const before = await file.stat();
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size < 1 ||
      before.size > MAX_IMAGE_BYTES
    )
      throw new Error("UNSAFE_IMAGE:image-size");

    const data = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < data.byteLength) {
      const { bytesRead } = await file.read(
        data,
        offset,
        data.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) throw new Error("UNSAFE_IMAGE:image-changed");
      offset += bytesRead;
    }
    const extra = Buffer.allocUnsafe(1);
    const trailing = await file.read(extra, 0, 1, data.byteLength);
    const after = await file.stat();
    if (trailing.bytesRead !== 0 || after.size !== before.size)
      throw new Error("UNSAFE_IMAGE:image-changed");
    await verify?.(file);
    return data;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("UNSAFE_IMAGE") ||
        error.message === "CANCELLED")
    )
      throw error;
    throw new Error("UNSAFE_IMAGE:image-read");
  } finally {
    await file?.close().catch(() => undefined);
  }
}

export async function validateImage(
  buffer: Buffer,
  fileName = "background.png",
): Promise<ImageInfo> {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES)
    throw new Error("UNSAFE_IMAGE:image-size");
  const extension = extname(fileName).toLowerCase();
  const mime = mimeByExtension.get(extension);
  if (!mime) throw new Error("UNSAFE_IMAGE:image-extension");
  if (detectMime(buffer) !== mime) throw new Error("UNSAFE_IMAGE:image-magic");
  const decoder = sharp(buffer, {
    failOn: "error",
    limitInputPixels: 50_000_000,
    animated: false,
  });
  const metadata = await decoder.metadata().catch(() => {
    throw new Error("UNSAFE_IMAGE:image-decode");
  });
  if (
    metadata.format !==
    (extension === ".jpg" || extension === ".jpeg"
      ? "jpeg"
      : extension.slice(1))
  ) {
    throw new Error("UNSAFE_IMAGE:image-format");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    !width ||
    !height ||
    width > 16384 ||
    height > 16384 ||
    width * height > 50_000_000
  ) {
    throw new Error("UNSAFE_IMAGE:image-dimensions");
  }
  if ((metadata.pages ?? 1) !== 1) throw new Error("UNSAFE_IMAGE:image-pages");
  // Metadata alone does not prove that every pixel stream can be decoded.
  await decoder
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer()
    .catch(() => {
      throw new Error("UNSAFE_IMAGE:image-decode");
    });
  return {
    mime,
    extension:
      extension === ".jpg" || extension === ".jpeg"
        ? "jpg"
        : (extension.slice(1) as "png" | "webp"),
    width,
    height,
    bytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function detectMime(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, pngMagic.length).equals(pngMagic)) return "image/png";
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return "image/jpeg";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return undefined;
}
