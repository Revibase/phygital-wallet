import { describe, expect, it } from "vitest";

import {
  MIN_ATTEMPT_FEE_LAMPORTS,
  STARTER_FEE_BALANCE_LAMPORTS,
} from "@/fees/constants";
import { TokenStore } from "@/token-store";

function memorySql() {
  let token: string | null = null;
  let balance: number | null = null;
  const signatures = new Set<string>();
  const reserves = new Map<
    string,
    { lamports: number; created_at: number; expires_at: number }
  >();

  return {
    exec(query: string, ...params: unknown[]) {
      const q = query.replace(/\s+/g, " ").trim();
      if (q.includes("SELECT value FROM meta")) {
        return { toArray: () => (token ? [{ value: token }] : []) };
      }
      if (q.includes("INSERT INTO meta")) token = String(params[0]);
      if (q.includes("SELECT balance_lamports FROM fee_balance")) {
        return {
          toArray: () =>
            balance == null ? [] : [{ balance_lamports: balance }],
        };
      }
      if (q.includes("SELECT signature FROM fee_events")) {
        return {
          toArray: () =>
            signatures.has(String(params[0]))
              ? [{ signature: params[0] }]
              : [],
        };
      }
      if (q.includes("INSERT INTO fee_events")) signatures.add(String(params[0]));
      if (q.includes("INSERT INTO fee_balance")) balance = Number(params[0]);
      if (q.includes("COALESCE(SUM(lamports)")) {
        const now = Number(params[0]);
        let total = 0;
        for (const r of reserves.values()) {
          if (r.expires_at > now) total += r.lamports;
        }
        return { toArray: () => [{ total }] };
      }
      if (q.includes("SELECT id, expires_at FROM fee_reserves")) {
        const row = reserves.get(String(params[0]));
        return {
          toArray: () =>
            row
              ? [{ id: params[0], expires_at: row.expires_at }]
              : [],
        };
      }
      if (
        q.includes("SELECT id, lamports, created_at, expires_at FROM fee_reserves")
      ) {
        const row = reserves.get(String(params[0]));
        return {
          toArray: () =>
            row
              ? [
                  {
                    id: params[0],
                    lamports: row.lamports,
                    created_at: row.created_at,
                    expires_at: row.expires_at,
                  },
                ]
              : [],
        };
      }
      if (
        q.includes("SELECT id FROM fee_reserves") &&
        q.includes("expires_at >") &&
        q.includes("ORDER BY created_at")
      ) {
        const now = Number(params[0]);
        const rows = [...reserves.entries()]
          .filter(([, r]) => r.expires_at > now)
          .sort((a, b) => a[1].created_at - b[1].created_at)
          .slice(0, 1)
          .map(([id]) => ({ id }));
        return { toArray: () => rows };
      }
      if (q.includes("SELECT id FROM fee_reserves WHERE id")) {
        const id = String(params[0]);
        const now = params.length > 1 ? Number(params[1]) : null;
        const row = reserves.get(id);
        if (!row) return { toArray: () => [] };
        if (now != null && row.expires_at <= now) return { toArray: () => [] };
        return { toArray: () => [{ id }] };
      }
      if (q.includes("SELECT id, lamports FROM fee_reserves")) {
        const now = Number(params[0]);
        const rows = [...reserves.entries()]
          .filter(([, r]) => r.expires_at > now)
          .sort((a, b) => a[1].created_at - b[1].created_at)
          .map(([id, r]) => ({ id, lamports: r.lamports }));
        return { toArray: () => rows };
      }
      if (q.includes("INSERT INTO fee_reserves")) {
        reserves.set(String(params[0]), {
          lamports: Number(params[1]),
          created_at: Number(params[2]),
          expires_at: Number(params[3]),
        });
      }
      if (q.includes("DELETE FROM fee_reserves WHERE id")) {
        const had = reserves.has(String(params[0]));
        reserves.delete(String(params[0]));
        return { toArray: () => [], rowsWritten: had ? 1 : 0 };
      }
      if (q.includes("DELETE FROM fee_reserves WHERE expires_at")) {
        const now = Number(params[0]);
        let n = 0;
        for (const [id, r] of [...reserves.entries()]) {
          if (r.expires_at <= now) {
            reserves.delete(id);
            n += 1;
          }
        }
        return { toArray: () => [], rowsWritten: n };
      }
      if (q.includes("SELECT expires_at FROM fee_reserves")) {
        const now = Number(params[0]);
        const next = [...reserves.values()]
          .filter((r) => r.expires_at > now)
          .sort((a, b) => a.expires_at - b.expires_at)[0];
        return {
          toArray: () => (next ? [{ expires_at: next.expires_at }] : []),
        };
      }
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
    expect(
      store.applyFeeEvent({
        signature: "credit-1",
        kind: "credit",
        lamports: 500,
      }),
    ).toBe(true);
    expect(
      store.applyFeeEvent({
        signature: "credit-1",
        kind: "credit",
        lamports: 500,
      }),
    ).toBe(false);
    expect(
      store.applyFeeEvent({
        signature: "debit-1",
        kind: "debit",
        lamports: 200,
      }),
    ).toBe(true);
    expect(store.getFeeBalanceLamports()).toBe(
      STARTER_FEE_BALANCE_LAMPORTS + 300,
    );
  });

  it("never debits below zero", () => {
    const store = new TokenStore(memorySql(), "TokenA");
    store.ensureToken("TokenA");
    store.applyFeeEvent({
      signature: "debit-all",
      kind: "debit",
      lamports: STARTER_FEE_BALANCE_LAMPORTS + 1,
    });
    expect(store.getFeeBalanceLamports()).toBe(0);
  });

  it("reserves reduce available balance until release or settle", () => {
    const store = new TokenStore(memorySql(), "TokenA");
    store.ensureToken("TokenA");
    expect(store.reserve("msg-1")).toBe(true);
    expect(store.getAvailableLamports()).toBe(
      STARTER_FEE_BALANCE_LAMPORTS - MIN_ATTEMPT_FEE_LAMPORTS,
    );
    // Exhaust available with enough attempt-floor reserves.
    const maxReserves = Math.floor(
      STARTER_FEE_BALANCE_LAMPORTS / MIN_ATTEMPT_FEE_LAMPORTS,
    );
    for (let i = 2; i <= maxReserves; i++) {
      expect(store.reserve(`msg-${i}`)).toBe(true);
    }
    expect(store.getAvailableLamports()).toBe(
      STARTER_FEE_BALANCE_LAMPORTS - maxReserves * MIN_ATTEMPT_FEE_LAMPORTS,
    );
    expect(store.reserve("msg-overflow")).toBe(false);

    expect(
      store.settleDebit({
        signature: "sig:debit",
        kind: "debit",
        lamports: 50_000,
      }),
    ).toBe(true);
    expect(store.getFeeBalanceLamports()).toBe(
      STARTER_FEE_BALANCE_LAMPORTS - 50_000,
    );
    // FIFO fallback releases one reserve when signature is unbound.
    expect(store.getReservedLamports()).toBe(
      (maxReserves - 1) * MIN_ATTEMPT_FEE_LAMPORTS,
    );
  });

  it("settleDebit releases the reserve rebound to the tx signature", () => {
    const store = new TokenStore(memorySql(), "TokenA");
    store.ensureToken("TokenA");
    expect(store.reserve("msg-hash")).toBe(true);
    expect(store.rebindReserve("msg-hash", "tx-sig")).toBe(true);
    expect(store.getReservedLamports()).toBe(MIN_ATTEMPT_FEE_LAMPORTS);
    expect(
      store.settleDebit({
        signature: "tx-sig:debit",
        kind: "debit",
        lamports: 40_000,
      }),
    ).toBe(true);
    expect(store.getReservedLamports()).toBe(0);
    expect(store.getFeeBalanceLamports()).toBe(
      STARTER_FEE_BALANCE_LAMPORTS - 40_000,
    );
  });
});
