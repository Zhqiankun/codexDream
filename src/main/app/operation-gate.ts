import { AsyncLocalStorage } from "node:async_hooks";

export class MainOperationBusyError extends Error {
  constructor() {
    super("OPERATION_BUSY");
    this.name = "MainOperationBusyError";
  }
}

/** Serializes root main-process commands without queueing unrelated work. */
export class MainOperationGate {
  private active?: symbol;
  private readonly context = new AsyncLocalStorage<symbol>();

  async run<T>(
    operation: (isRootOperation: boolean) => Promise<T> | T,
  ): Promise<T> {
    const current = this.context.getStore();
    if (current && current === this.active) return operation(false);
    if (this.active) throw new MainOperationBusyError();

    const token = Symbol("main-operation");
    this.active = token;
    try {
      return await this.context.run(token, () => operation(true));
    } finally {
      if (this.active === token) this.active = undefined;
    }
  }
}
