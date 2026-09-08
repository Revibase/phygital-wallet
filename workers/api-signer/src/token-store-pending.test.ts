import { describe, expect, it } from "vitest";

import { initTokenSchema, TokenStore } from "@/token-store";

/**
 * Minimal in-memory SqlStorage for pending_approvals coverage.
 * Only implements the statements TokenStore pending helpers use.
 */
function pendingSql() {
  type Row = Record<string, unknown>;
  const tables = new Map<string, Row[]>();

  const exec = (query: string, ...params: unknown[]) => {
    const q = query.replace(/\s+/g, " ").trim();

    if (q.startsWith("CREATE TABLE") || q.startsWith("CREATE INDEX")) {
      if (q.includes("pending_approvals") && !tables.has("pending_approvals")) {
        tables.set("pending_approvals", []);
      }
      if (q.includes("meta") && !tables.has("meta")) tables.set("meta", []);
      if (q.includes("fee_balance") && !tables.has("fee_balance")) {
        tables.set("fee_balance", []);
      }
      return { toArray: () => [] };
    }

    if (q.includes("INSERT INTO meta")) {
      const rows = tables.get("meta") ?? [];
      rows.push({ key: params[0], value: params[1] });
      tables.set("meta", rows);
      return { toArray: () => [] };
    }

    if (q.includes("SELECT value FROM meta")) {
      const rows = tables.get("meta") ?? [];
      const hit = rows.find((r) => r.key === "phygital_token");
      return { toArray: () => (hit ? [{ value: hit.value }] : []) };
    }

    if (q.includes("INSERT INTO fee_balance")) {
      tables.set("fee_balance", [
        {
          id: 1,
          balance_lamports: params[0],
          updated_at: params[1],
        },
      ]);
      return { toArray: () => [] };
    }

    if (
      q.includes("UPDATE pending_approvals") &&
      q.includes("SET resolved_at = ?") &&
      q.includes("resolution = 'expired'")
    ) {
      const now = params[0] as number;
      const rows = tables.get("pending_approvals") ?? [];
      for (const r of rows) {
        if (r.resolved_at == null && (r.expires_at as number) < now) {
          r.resolved_at = now;
          r.resolution = "expired";
        }
      }
      return { toArray: () => [] };
    }

    if (q.startsWith("DELETE FROM pending_approvals")) {
      throw new Error("pending approvals must not be deleted");
    }

    if (
      q.includes("SELECT id FROM pending_approvals") &&
      q.includes("intent_hash = ?") &&
      q.includes("resolved_at IS NULL") &&
      q.includes("expires_at > ?")
    ) {
      const intent = params[0];
      const now = params[1] as number;
      const rows = tables.get("pending_approvals") ?? [];
      const hit = rows.find(
        (r) =>
          r.intent_hash === intent &&
          r.resolved_at == null &&
          (r.expires_at as number) > now,
      );
      return { toArray: () => (hit ? [{ id: hit.id }] : []) };
    }

    if (
      q.includes("UPDATE pending_approvals") &&
      q.includes("SET code = ?") &&
      q.includes("WHERE id = ?")
    ) {
      const rows = tables.get("pending_approvals") ?? [];
      const id = params[4];
      const row = rows.find((r) => r.id === id);
      if (row) {
        row.code = params[0];
        row.error = params[1];
        row.details_json = params[2];
        row.expires_at = params[3];
      }
      return { toArray: () => [] };
    }

    if (
      q.includes("SELECT id FROM pending_approvals") &&
      q.includes("ORDER BY created_at ASC")
    ) {
      const now = params[0] as number;
      const rows = (tables.get("pending_approvals") ?? [])
        .filter(
          (r) => r.resolved_at == null && (r.expires_at as number) > now,
        )
        .sort((a, b) => (a.created_at as number) - (b.created_at as number))
        .map((r) => ({ id: r.id }));
      return { toArray: () => rows };
    }

    if (
      q.includes("UPDATE pending_approvals") &&
      q.includes("SET resolved_at = ?") &&
      q.includes("WHERE id = ?")
    ) {
      const rows = tables.get("pending_approvals") ?? [];
      const row = rows.find((r) => r.id === params[2] && r.resolved_at == null);
      if (row) {
        row.resolved_at = params[0];
        row.resolution = params[1];
      }
      return { toArray: () => [] };
    }

    if (q.includes("INSERT INTO pending_approvals")) {
      const rows = tables.get("pending_approvals") ?? [];
      rows.push({
        id: params[0],
        intent_hash: params[1],
        code: params[2],
        error: params[3],
        details_json: params[4],
        expires_at: params[5],
        resolved_at: null,
        resolution: null,
        created_at: params[6],
      });
      tables.set("pending_approvals", rows);
      return { toArray: () => [] };
    }

    if (
      q.includes("FROM pending_approvals") &&
      q.includes("ORDER BY created_at DESC") &&
      q.includes("LIMIT ?") &&
      q.includes("resolved_at IS NULL")
    ) {
      const now = params[0] as number;
      const limit = params[1] as number;
      const rows = (tables.get("pending_approvals") ?? [])
        .filter(
          (r) => r.resolved_at == null && (r.expires_at as number) > now,
        )
        .sort((a, b) => (b.created_at as number) - (a.created_at as number))
        .slice(0, limit)
        .map((r) => ({
          intent_hash: r.intent_hash,
          code: r.code,
          error: r.error,
          details_json: r.details_json,
        }));
      return { toArray: () => rows };
    }

    if (
      q.includes("SELECT id FROM pending_approvals") &&
      q.includes("intent_hash = ?") &&
      q.includes("resolved_at IS NULL") &&
      !q.includes("expires_at")
    ) {
      const intent = params[0];
      const rows = tables.get("pending_approvals") ?? [];
      const hit = rows.find(
        (r) => r.intent_hash === intent && r.resolved_at == null,
      );
      return { toArray: () => (hit ? [{ id: hit.id }] : []) };
    }

    if (
      q.includes("SELECT expires_at, resolved_at, resolution") &&
      q.includes("WHERE intent_hash = ?")
    ) {
      const intent = params[0];
      const rows = tables.get("pending_approvals") ?? [];
      const hits = rows
        .filter((r) => r.intent_hash === intent)
        .sort((a, b) => (b.created_at as number) - (a.created_at as number));
      const hit = hits[0];
      return {
        toArray: () =>
          hit
            ? [
                {
                  expires_at: hit.expires_at,
                  resolved_at: hit.resolved_at,
                  resolution: hit.resolution,
                },
              ]
            : [],
      };
    }

    throw new Error(`pendingSql unhandled: ${q}`);
  };

  return { exec: exec as DurableObjectStorage["sql"]["exec"] } as DurableObjectStorage["sql"];
}

describe("TokenStore pending approvals", () => {
  it("upserts, lists, resolves, and reports watch status", () => {
    const sql = pendingSql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Tok");
    store.ensureToken("Tok");

    store.upsertPendingApproval({
      intentHash: "h1",
      code: "over_limit",
      error: "too much",
      details: { amount: 1 },
    });

    const open = store.listOpenApprovals();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      intentHash: "h1",
      code: "over_limit",
    });
    expect(open[0]).not.toHaveProperty("phygitalToken");

    expect(store.resolvePendingApproval("h1", "granted")).toBe(true);
    expect(store.listOpenApprovals()).toHaveLength(0);
    expect(store.resolvePendingApproval("h1", "denied")).toBe(false);
  });

  it("caps open inbox", () => {
    const sql = pendingSql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Tok");
    store.ensureToken("Tok");

    for (let i = 0; i < 6; i++) {
      store.upsertPendingApproval({
        intentHash: `h${i}`,
        code: "over_limit",
        error: "x",
      });
    }
    expect(store.listOpenApprovals()).toHaveLength(5);
  });

  it("slims details before write", () => {
    const sql = pendingSql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Tok");
    store.ensureToken("Tok");

    store.upsertPendingApproval({
      intentHash: "h1",
      code: "over_limit",
      error: "x",
      details: {
        amountUi: "1.5",
        symbol: "USDC",
        destination: "Dest111",
        noise: "drop-me",
        nested: { a: 1 },
      },
    });

    expect(store.listOpenApprovals()[0]!.details).toEqual({
      amountUi: "1.5",
      symbol: "USDC",
      destination: "Dest111",
    });
  });

  it("keeps resolved rows and details for audit", () => {
    const sql = pendingSql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Tok");
    store.ensureToken("Tok");

    store.upsertPendingApproval({
      intentHash: "h1",
      code: "over_limit",
      error: "x",
      details: { amountUi: "2", symbol: "SOL", destination: "Recv" },
    });
    expect(store.resolvePendingApproval("h1", "granted")).toBe(true);
    expect(store.listOpenApprovals()).toHaveLength(0);

    // Upsert/GC must not delete the resolved audit row.
    store.upsertPendingApproval({
      intentHash: "h2",
      code: "over_limit",
      error: "y",
    });
    expect(store.listOpenApprovals()).toHaveLength(1);
    expect(store.listOpenApprovals()[0]!.intentHash).toBe("h2");
  });
});
