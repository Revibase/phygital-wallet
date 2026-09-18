/**
 * D1 `audit_log` — fire-and-forget via `waitUntil`.
 * Optional `sessionId` / `intentHash` for correlation.
 */
import type { Context } from "hono";

import { D1_BATCH_CHUNK, getD1 } from "@/shared/db";
import { createLogger } from "@/shared/log";
import { getEnv, scheduleBackgroundWork } from "@/shared/request-context";

export type AuditEvent =
  | "sign"
  | "fee_credit"
  | "fee_debit"
  | "accessory_unlock"
  | "owner_browse"
  | "webhook_reject"
  | "blob_get"
  | "owner_policy";

/**
 * Who performed the action.
 * `accessory` = chip / passkey path; `owner` = owner-browse path; `system` = server.
 */
export type AuditActor = "accessory" | "owner" | "system";

export type AuditEntry = {
  event: AuditEvent;
  // --- first-class columns (common to nearly every event) ---
  phygitalToken?: string | null;
  actor?: AuditActor | null;
  ok?: boolean | null;
  /** Optional session cookie jti for correlation. */
  sessionId?: string | null;
  intentHash?: string | null;
  /** Defaults to Date.now() at record time. */
  ts?: number;
  // --- everything below is folded into detail_json ---
  code?: string | null;
  feePayer?: string | null;
  origin?: string | null;
  ms?: number | null;
  requestId?: string | null;
  /** Extra event-specific fields; merged into detail_json. */
  detail?: Record<string, unknown> | null;
};

const INSERT_SQL = `INSERT INTO audit_log
    (ts, event, phygital_token, actor, ok, session_id, intent_hash, detail_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

function buildDetail(e: AuditEntry): string | null {
  const detail: Record<string, unknown> = { ...(e.detail ?? {}) };
  if (e.code != null) detail.code = e.code;
  if (e.feePayer != null) detail.feePayer = e.feePayer;
  if (e.origin != null) detail.origin = e.origin;
  if (e.ms != null) detail.ms = e.ms;
  if (e.requestId != null) detail.requestId = e.requestId;
  return Object.keys(detail).length > 0 ? JSON.stringify(detail) : null;
}

function bind(stmt: D1PreparedStatement, e: AuditEntry): D1PreparedStatement {
  const ok = e.ok == null ? null : e.ok ? 1 : 0;
  return stmt.bind(
    e.ts ?? Date.now(),
    e.event,
    e.phygitalToken ?? null,
    e.actor ?? null,
    ok,
    e.sessionId ?? null,
    e.intentHash ?? null,
    buildDetail(e)
  );
}

/** Fire-and-forget audit write; never throws into the caller. */
export function recordAudit(input: AuditEntry | AuditEntry[]): void {
  const entries = Array.isArray(input) ? input : [input];
  if (entries.length === 0) return;

  let db: D1Database;
  let env: Env;
  try {
    db = getD1();
    env = getEnv();
  } catch {
    // No request context or D1 binding — drop silently (logging is best-effort).
    return;
  }

  const stmt = db.prepare(INSERT_SQL);
  const statements = entries.map((e) => bind(stmt, e));

  scheduleBackgroundWork(
    (async () => {
      try {
        if (statements.length === 1) {
          await statements[0].run();
          return;
        }
        for (let i = 0; i < statements.length; i += D1_BATCH_CHUNK) {
          await db.batch(statements.slice(i, i + D1_BATCH_CHUNK));
        }
      } catch (err) {
        createLogger("api", env).warn("audit.write_failed", {
          events: entries.map((e) => e.event).join(","),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })()
  );
}

export function auditMeta(c: Context): {
  requestId: string | null;
  origin: string | null;
} {
  return {
    requestId: c.req.header("cf-ray") ?? c.req.header("x-request-id") ?? null,
    origin: c.req.header("Origin") ?? null,
  };
}
