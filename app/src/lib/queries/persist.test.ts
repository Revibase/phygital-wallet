import { describe, expect, it } from "vitest";
import { type PersistedClient } from "@tanstack/react-query-persist-client";

import {
  deserializeQueryCache,
  isPersistedQueryKey,
  serializeQueryCache,
} from "./persist";

function roundTrip(value: unknown): unknown {
  const client = { payload: value } as unknown as PersistedClient;
  return (
    deserializeQueryCache(serializeQueryCache(client)) as unknown as {
      payload: unknown;
    }
  ).payload;
}

describe("serializeQueryCache / deserializeQueryCache", () => {
  it("round-trips bigint fields", () => {
    expect(roundTrip({ delegatedAmountRaw: 1_000_000n })).toEqual({
      delegatedAmountRaw: 1_000_000n,
    });
  });

  it("round-trips a Map of mint statuses with bigint amounts", () => {
    const status = {
      delegatedAmountRaw: 250_000n,
      balanceRaw: 1n,
    };
    const restored = roundTrip(new Map([["mint", status]]));
    expect(restored).toBeInstanceOf(Map);
    expect(restored).toEqual(new Map([["mint", status]]));
  });

  it("does not throw on bigint the way JSON.stringify does", () => {
    expect(() => JSON.stringify({ n: 1n })).toThrow(TypeError);
    expect(() =>
      serializeQueryCache({ n: 1n } as unknown as PersistedClient),
    ).not.toThrow();
  });
});

describe("isPersistedQueryKey", () => {
  it("allows instant-paint roots", () => {
    expect(isPersistedQueryKey(["phygitalTokens", "address", "token"])).toBe(
      true,
    );
    expect(isPersistedQueryKey(["dasCollectible", "mint"])).toBe(true);
    expect(isPersistedQueryKey(["mintedCollectibleView", "mint"])).toBe(true);
    expect(isPersistedQueryKey(["walletPortfolio", "owner"])).toBe(true);
    expect(isPersistedQueryKey(["feeBalance", "token"])).toBe(true);
    expect(isPersistedQueryKey(["verifiedTokens"])).toBe(true);
    expect(isPersistedQueryKey(["walletPolicy", "token"])).toBe(true);
  });

  it("skips growing or one-shot caches", () => {
    expect(isPersistedQueryKey(["tapVerify", "pk=1"])).toBe(false);
    expect(isPersistedQueryKey(["deviceAuth", "session"])).toBe(false);
  });
});
