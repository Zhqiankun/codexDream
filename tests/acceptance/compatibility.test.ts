import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { LocalThemeStore } from "../../src/main/infra/local-store";
import { writeSimplifiedZip } from "../../src/main/infra/theme-zip";
import { createManagedRoot } from "../fixtures/managed-root";

const execFile = promisify(execFileCallback);
const cleanup: Array<() => Promise<void>> = [];
const legacyValidator = resolve(
  process.cwd(),
  "..",
  "old",
  "windows",
  "assets",
  "theme-package-validator.mjs",
);

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((operation) => operation()));
});

describe("simplified package compatibility", () => {
  it.skipIf(!existsSync(legacyValidator))(
    "is accepted by the optional legacy Windows package validator",
    async () => {
      const managed = await createManagedRoot();
      cleanup.push(managed.cleanup);
      const root = managed.localAppData;
      const store = new LocalThemeStore(managed.root);
      await store.init();
      const theme = store.listRecords()[0]!;
      const image = store.getBackground(theme.libraryId)!;
      const zipPath = join(root, "theme.zip");
      const source = join(root, "source");
      const stage = join(root, "stage");

      await writeSimplifiedZip(zipPath, theme, image);
      await Promise.all([mkdir(source), mkdir(stage)]);
      await unzip(zipPath, source);

      const { stdout } = await execFile(process.execPath, [
        legacyValidator,
        "--source",
        source,
        "--stage",
        stage,
        "--platform",
        "windows",
        "--client-version",
        "0.1.0",
      ]);

      expect(JSON.parse(stdout)).toMatchObject({
        format: "simple",
        image: "background.png",
        safeCssStatus: "validated",
        signatureIgnored: false,
      });
    },
  );
});

async function unzip(archivePath: string, destination: string): Promise<void> {
  const archive = await new Promise<yauzl.ZipFile>((resolveArchive, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, value) => {
      if (error || !value) reject(error ?? new Error("archive unavailable"));
      else resolveArchive(value);
    });
  });
  await new Promise<void>((resolveExtraction, reject) => {
    archive.once("error", reject);
    archive.once("end", resolveExtraction);
    archive.on("entry", (entry) => {
      archive.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error("entry stream unavailable"));
          return;
        }
        const target = createWriteStream(join(destination, entry.fileName), {
          flags: "wx",
        });
        stream.once("error", reject);
        target.once("error", reject);
        target.once("close", () => archive.readEntry());
        stream.pipe(target);
      });
    });
    archive.readEntry();
  });
}
