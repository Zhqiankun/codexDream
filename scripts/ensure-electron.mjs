import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

if (typeof electronPath !== "string" || !existsSync(electronPath)) {
  console.error("Electron 43.3.0 binary is unavailable.");
  process.exit(1);
}

console.log(`Electron binary ready: ${electronPath}`);
