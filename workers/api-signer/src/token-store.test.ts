import { describe, expect, it } from "vitest";

import { STARTER_FEE_BALANCE_LAMPORTS } from "@/fees/constants";
import { TokenStore } from "@/token-store";

function memorySql() {
  let token: string | null = null;
  let balance: number | null = null;
  const signatures = new Set<string>();

  return {
    exec(query: string, ...params: unknown[]) {
      const q = query.replace(/\s+/g, " ").trim();
      if (q.includes("SELECT value FROM meta")) {
        return { toArray: () => token ? [{ value: token }] : [] };
      }
      if (q.includes("INSERT INTO meta")) token = String(params[0]);
      if (q.includes("SELECT balance_lamports FROM fee_balance")) {
        return { toArray: () => balance == null ? [] : [{ balance_lamports: balance }] };
      }
      if (q.includes("SELECT signature FROM fee_events")) {
        return { toArray: () => signatures.has(String(params[0])) ? [{ signature: params[0] }] : [] };
      }
      if (q.includes("INSERT INTO fee_events")) signatures.add(String(params[0]));
      if (q.includes("INSERT INTO fee_balance")) balance = Number(params[0]);
      return { toArray: () => [] };
    },
  } as unknown as DurableObjectStorage["sql"];
}

describe("TokenStore fee accounting", () => {
  it("creates a token ledger with the starter balance", () => {
    const store = new TokenStore(memorySql(), "TokenA");
    store.ensureToken("TokenA");
    expect(store.getFeeBalanceLamports()).toBe(STARTER_FEE_BALANCE_LAMPORTS);
  });

  it("applies each fee event once", () => {
    const store = new TokenStore(memorySql(), "TokenA");
    store.ensureToken("TokenA");
    expect(store.applyFeeEvent({ signature: "credit-1", kind: "credit", lamports: 500 })).toBe(true);
    expect(store.applyFeeEvent({ signature: "credit-1", kind: "credit", lamports: 500 })).toBe(false);
    expect(store.applyFeeEvent({ signature: "debit-1", kind: "debit", lamports: 200 })).toBe(true);
    expect(store.getFeeBalanceLamports()).toBe(STARTER_FEE_BALANCE_LAMPORTS + 300);
  });

  it("never debits below zero", () => {
    const store = new TokenStore(memorySql(), "TokenA");
    store.ensureToken("TokenA");
    store.applyFeeEvent({ signature: "debit-all", kind: "debit", lamports: STARTER_FEE_BALANCE_LAMPORTS + 1 });
    expect(store.getFeeBalanceLamports()).toBe(0);
  });
});
