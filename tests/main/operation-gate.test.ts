import { describe, expect, it } from "vitest";
import {
  MainOperationBusyError,
  MainOperationGate,
} from "../../src/main/app/operation-gate";

describe("MainOperationGate", () => {
  it("rejects a concurrent root operation without queueing it", async () => {
    const gate = new MainOperationGate();
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondStarted = false;

    const first = gate.run(async () => {
      await firstStarted;
    });
    await Promise.resolve();

    await expect(
      gate.run(async () => {
        secondStarted = true;
      }),
    ).rejects.toBeInstanceOf(MainOperationBusyError);
    expect(secondStarted).toBe(false);

    releaseFirst();
    await first;
  });

  it("allows a controlled nested operation in its current async context", async () => {
    const gate = new MainOperationGate();
    const calls: string[] = [];

    await gate.run(async (isRoot) => {
      calls.push(`outer:${isRoot}`);
      await gate.run(async (nestedIsRoot) => {
        calls.push(`inner:${nestedIsRoot}`);
      });
    });

    expect(calls).toEqual(["outer:true", "inner:false"]);
  });
});
