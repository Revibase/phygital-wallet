import { describe, expect, it } from "vitest";

import { recordAudit } from "@/audit/audit-log";
import { runWithRequestStore } from "@/shared/request-context";

/** Fake D1 that captures single runs and batched statements. */
function fakeD1() {
  const runs: unknown[][] = [];
  const batches: unknown[][][] = [];
  const db = {
    prepare(_sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            _args: args,
            run: async () => {
              runs.push(args);
              return { success: true };
            },
          };
        },
      };
    },
    async batch(stmts: { _args: unknown[] }[]) {
      batches.push(stmts.map((s) => s._args));
      return [];
    },
  } as unknown as D1Database;
  return { db, runs, batches };
}

/** Run `fn` with a request store, awaiting any deferred audit writes. */
async function withStore(db: D1Database, fn: () => void): Promise<void> {
  const pending: Promise<unknown>[] = [];
  runWithRequestStore(
    {
      env: { phygital_token: db, LOG_LEVEL: "error" } as unknown as Env,
      waitUntil: (p) => pending.push(p),
    },
    fn
  );
  await Promise.all(pending);
}

// Column order of the INSERT the module builds.
const COLS = [
  "ts",
  "event",
  "phygital_token",
  "actor",
  "ok",
  "session_id",
  "intent_hash",
  "detail_json",
] as const;

function row(args: unknown[]): Record<string, unknown> {
  return Object.fromEntries(COLS.map((c, i) => [c, args[i]]));
}

function detail(args: unknown[]): Record<string, unknown> | null {
  const raw = row(args).detail_json;
  return raw == null
    ? null
    : (JSON.parse(raw as string) as Record<string, unknown>);
}

describe("recordAudit", () => {
  it("keeps core columns and folds the rest into detail_json", async () => {
    const { db, runs, batches } = fakeD1();
    await withStore(db, () =>
      recordAudit({
        event: "sign",
        phygitalToken: "Tok",
        actor: "accessory",
        ok: true,
        code: null,
        verifier: "Ver1",
        sessionId: "jti-1",
        intentHash: "h1",
        detail: { kind: "execute", signatureCount: 2 },
        origin: "https://app",
        ms: 12,
        requestId: "ray-1",
      })
    );

    expect(batches).toHaveLength(0);
    expect(runs).toHaveLength(1);
    const r = row(runs[0]);
    // Core columns.
    expect(r.event).toBe("sign");
    expect(r.phygital_token).toBe("Tok");
    expect(r.actor).toBe("accessory");
    expect(r.ok).toBe(1);
    expect(r.session_id).toBe("jti-1");
    expect(r.intent_hash).toBe("h1");
    expect(typeof r.ts).toBe("number");
    // Everything else folded into detail_json (null code is dropped).
    expect(detail(runs[0])).toEqual({
      kind: "execute",
      signatureCount: 2,
      verifier: "Ver1",
      origin: "https://app",
      ms: 12,
      requestId: "ray-1",
    });
  });

  it("maps ok:false to 0 and folds code into detail_json", async () => {
    const { db, runs } = fakeD1();
    await withStore(db, () =>
      recordAudit({ event: "connect", ok: false, code: "invalid_proof" })
    );
    const r = row(runs[0]);
    expect(r.ok).toBe(0);
    expect(detail(runs[0])).toEqual({ code: "invalid_proof" });
  });

  it("writes null detail_json when nothing event-specific is present", async () => {
    const { db, runs } = fakeD1();
    await withStore(db, () =>
      recordAudit({ event: "owner_unlink", phygitalToken: "Tok", ok: true })
    );
    expect(row(runs[0]).detail_json).toBeNull();
  });

  it("puts the visitor passkey in detail_json, not a column", async () => {
    const { db, runs } = fakeD1();
    await withStore(db, () =>
      recordAudit({
        event: "pending_approval",
        actor: "visitor_device",
        credentialId: "cred-visitor",
        intentHash: "h1",
        detail: { resolution: "created" },
      })
    );
    const r = row(runs[0]);
    expect(r.actor).toBe("visitor_device");
    expect(r.intent_hash).toBe("h1");
    expect(detail(runs[0])).toEqual({
      resolution: "created",
      credentialId: "cred-visitor",
    });
  });

  it("batches multiple entries in one call", async () => {
    const { db, runs, batches } = fakeD1();
    await withStore(db, () =>
      recordAudit([
        { event: "preview", ok: false, code: "over_limit", intentHash: "h1" },
        {
          event: "pending_approval",
          intentHash: "h1",
          detail: { resolution: "created" },
        },
      ])
    );
    expect(runs).toHaveLength(0);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(row(batches[0][0]).event).toBe("preview");
    expect(row(batches[0][1]).event).toBe("pending_approval");
  });

  it("no-ops on empty input", async () => {
    const { db, runs, batches } = fakeD1();
    await withStore(db, () => recordAudit([]));
    expect(runs).toHaveLength(0);
    expect(batches).toHaveLength(0);
  });

  it("never throws when there is no request context", () => {
    expect(() => recordAudit({ event: "sign", ok: true })).not.toThrow();
  });
});
