import { AsyncLocalStorage } from "node:async_hooks";

export type RequestStore = {
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
};

const als = new AsyncLocalStorage<RequestStore>();

/** Run a Hono request with env / waitUntil available to deep libs. */
export function runWithRequestStore<T>(store: RequestStore, fn: () => T): T {
  return als.run(store, fn);
}

export function getRequestStore(): RequestStore {
  const store = als.getStore();
  if (!store) {
    throw new Error("Request context is not configured");
  }
  return store;
}

export function getEnv(): Env {
  return getRequestStore().env;
}

export function scheduleBackgroundWork(work: Promise<void>): void {
  try {
    getRequestStore().waitUntil(work);
  } catch {
    void work;
  }
}
