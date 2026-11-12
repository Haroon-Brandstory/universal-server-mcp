import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthContext } from "../types.js";

const storage = new AsyncLocalStorage<AuthContext>();

export function runWithAuth<T>(ctx: AuthContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestAuth(): AuthContext | undefined {
  return storage.getStore();
}
