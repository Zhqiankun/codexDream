import type { CodexStyleApi } from "../../contracts";

export const bridge: CodexStyleApi = new Proxy({} as CodexStyleApi, {
  get: (_target, property: keyof CodexStyleApi) => window.codexStyle[property],
});
