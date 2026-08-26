import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const resources = resolve(root, "resources");
const svg = Buffer.from(
  `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="32" y1="20" x2="226" y2="238" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f8ca68"/>
      <stop offset="1" stop-color="#d88927"/>
    </linearGradient>
  </defs>
  <rect x="12" y="12" width="232" height="232" rx="58" fill="#0b1020"/>
  <rect x="24" y="24" width="208" height="208" rx="48" fill="url(#bg)"/>
  <path d="M65 181V75h32l31 43 31-43h32v106h-28v-62l-35 46-35-46v62H65Z" fill="#17120a"/>
</svg>`,
  "utf8",
);

await mkdir(resources, { recursive: true });
const png = await sharp(svg).resize(256, 256).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(0, 6);
header.writeUInt8(0, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.byteLength, 14);
header.writeUInt32LE(header.byteLength, 18);

await Promise.all([
  writeFile(resolve(resources, "icon.png"), png),
  writeFile(resolve(resources, "icon.ico"), Buffer.concat([header, png])),
]);
console.log("Generated resources/icon.png and resources/icon.ico.");
