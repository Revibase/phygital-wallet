/**
 * Centralized audit log (D1 `audit_log`).
 *
 * Every important verifier event is written here for a durable, cross-token
 * audit trail that doubles as a feature-analytics dataset. Writes are
 * **fire-and-forget**: `recordAudit` captures the row synchronously (while the
 * request context is live) and defers the D1 insert onto `waitUntil`, so it
 * never adds latency to the response and never throws into the caller.
 *
 * Correlation keys on every row:
 *   - `sessionId`  = verifier bearer jti — links connect -> preview -> sign.
 *   - `intentHash` = links preview / pending_approval / grant / sign.
 */
import type { Context } from "hono";

import { D1_BATCH_CHUNK, getD1 } from "@/shared/db";
import { createLogger } from "@/shared/log";
import { getEnv, scheduleBackgroundWork } from "@/shared/request-context";

export type AuditEvent =
  | "connect"
  | "connect_tap"
  | "preview"
  | "sign"
  | "pending_approval"
  | "fee_credit"
  | "fee_debit"
  | "policy_set"
  | "policy_clear"
  | "grant_create"
  | "token_verifier_change"
  | "recovery_wallet_set"
  | "owner_unlink";

/**
 * Who performed the action. `accessory` = the physical chip's own credential
 * (a `/connect` proof, a bearer-scoped preview/sign — the token is derived from
 * it, so no human passkey is involved). `owner_device` / `visitor_device` = a
 * person's phone passkey (see `credentialId`). `system` = server-side, e.g. a
 * fee event from the Helius webhook.
 */
export type AuditActor =
  "accessory" | "owner_device" | "visitor_device" | "system";

export type AuditEntry = {
  event: AuditEvent;
  // --- first-class columns (common to nearly every event) ---
  phygitalToken?: string | null;
  actor?: AuditActor | null;
  ok?: boolean | null;
  /** Bearer jti — connect/preview/sign correlation. */
  sessionId?: string | null;
  intentHash?: string | null;
  /** Defaults to Date.now() at record time. */
  ts?: number;
  // --- everything below is folded into detail_json ---
  code?: string | null;
  /** Device passkey of the actor — only for owner_device / visitor_device. */
  credentialId?: string | null;
  verifier?: string | null;
  origin?: string | null;
  ms?: number | null;
  requestId?: string | null;
  /** Extra event-specific fields; merged into detail_json. */
  detail?: Record<string, unknown> | null;
};

const INSERT_SQL = `INSERT INTO audit_log
    (ts, event, phygital_token, actor, ok, session_id, intent_hash, detail_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Fold the event-specific fields (and any explicit `detail`) into one object,
 * dropping null/undefined so rows stay compact. Returns null when empty.
 */
function buildDetail(e: AuditEntry): string | null {
  const detail: Record<string, unknown> = { ...(e.detail ?? {}) };
  if (e.code != null) detail.code = e.code;
  if (e.credentialId != null) detail.credentialId = e.credentialId;
  if (e.verifier != null) detail.verifier = e.verifier;
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
    buildDetail(e),
  );
}

/**
 * Record one or more audit events. Never throws; a failed audit write must not
 * affect the user response. Bind the rows now (request context is live), then
 * defer the actual insert to `waitUntil`.
 */
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
    })(),
  );
}

/** Request-scoped audit metadata shared by every handler. */
export function auditMeta(c: Context): {
  requestId: string | null;
  origin: string | null;
} {
  return {
    requestId: c.req.header("cf-ray") ?? c.req.header("x-request-id") ?? null,
    origin: c.req.header("Origin") ?? null,
  };
}
