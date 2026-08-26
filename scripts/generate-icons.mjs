import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const resources = resolve(root, "resources");
const sourcePath = resolve(resources, "icon-source.png");
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const traySvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="2" width="28" height="28" rx="7" fill="#f5b94c"/>
    <path d="M21.5 8.5A9 9 0 1 0 21.5 23.5" fill="none" stroke="#0b1020" stroke-width="5" stroke-linecap="round"/>
    <path d="M23 11.4c.45 2.55 1.65 3.75 4.2 4.2-2.55.45-3.75 1.65-4.2 4.2-.45-2.55-1.65-3.75-4.2-4.2 2.55-.45 3.75-1.65 4.2-4.2Z" fill="#0b1020"/>
  </svg>`,
  "utf8",
);

await mkdir(resources, { recursive: true });
await readFile(sourcePath);

const appPng = await renderAppIcon(256);
const icoFrames = await Promise.all(icoSizes.map(renderAppIcon));
const tray1x = await sharp(traySvg).resize(16, 16).png().toBuffer();
const tray2x = await sharp(traySvg).resize(32, 32).png().toBuffer();

await Promise.all([
  writeFile(resolve(resources, "icon.png"), appPng),
  writeFile(resolve(resources, "icon.ico"), encodeIco(icoFrames, icoSizes)),
  writeFile(resolve(resources, "tray-icon.png"), tray1x),
  writeFile(resolve(resources, "tray-icon@2x.png"), tray2x),
]);
console.log(
  "Generated Windows app, window, installer, and high-DPI tray icons.",
);

async function renderAppIcon(size) {
  return sharp(sourcePath)
    .resize(size, size, { fit: "contain", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

function encodeIco(frames, sizes) {
  const directorySize = 6 + frames.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let imageOffset = directorySize;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    const size = sizes[index];
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.byteLength, entry + 8);
    header.writeUInt32LE(imageOffset, entry + 12);
    imageOffset += frame.byteLength;
  });

  return Buffer.concat([header, ...frames]);
}
