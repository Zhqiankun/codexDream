import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

export interface ManagedRootFixture {
  localAppData: string;
  root: string;
  cleanup(): Promise<void>;
}

export async function createManagedRoot(): Promise<ManagedRootFixture> {
  const localAppData = await mkdtemp(
    join(process.cwd(), ".codexstyle-localappdata-"),
  );
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = localAppData;
  let cleaned = false;

  return {
    localAppData,
    root: join(localAppData, "CodexStyle"),
    async cleanup(): Promise<void> {
      if (cleaned) return;
      cleaned = true;
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocalAppData;
      await rm(localAppData, { recursive: true, force: true });
    },
  };
}
