import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { consumePendingReturn, setPendingReturn } from "./claim-return";

// A real base58 Solana address so parseTokenWalletPath accepts the path.
const TOKEN = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CLAIM_PATH = `/token/${TOKEN}/wallet/claim`;

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  Object.defineProperty(globalThis, "sessionStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });
}

describe("claim-return", () => {
  beforeEach(installMemorySessionStorage);
  afterEach(() => {
    Reflect.deleteProperty(globalThis as object, "sessionStorage");
  });

  it("stores and consumes a valid token path once", () => {
    setPendingReturn(CLAIM_PATH);
    expect(consumePendingReturn()).toBe(CLAIM_PATH);
    // Single-use: cleared after consume.
    expect(consumePendingReturn()).toBeNull();
  });

  it("ignores an unsafe / non-token path", () => {
    setPendingReturn("https://evil.example/token/x");
    expect(consumePendingReturn()).toBeNull();
  });

  it("returns null when nothing is pending", () => {
    expect(consumePendingReturn()).toBeNull();
  });
});
