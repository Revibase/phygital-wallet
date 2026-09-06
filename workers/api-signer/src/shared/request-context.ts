import { AsyncLocalStorage } from "node:async_hooks";

import type { TokenStore } from "@/token-store";

export type RequestStore = {
  env: Env;
  /** Present when running inside TokenSigner DO authorize/sign. */
  tokenStore?: TokenStore;
};

const als = new AsyncLocalStorage<RequestStore>();

export function runWithRequestStore<T>(
  store: RequestStore,
  fn: () => T,
): T {
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

export function getTokenStore(): TokenStore {
  const store = getRequestStore().tokenStore;
  if (!store) {
    throw new Error("TokenStore is not configured");
  }
  return store;
}
