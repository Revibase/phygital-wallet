import { getD1 } from "@/shared/db";

const PENDING_TTL_MS = 5 * 60 * 1000;
const MAX_OPEN_PER_TOKEN = 5;

export type PendingApproval = {
  id: string;
  phygitalToken: string;
  intentHash: string;
  code: string;
  error: string;
  details: Record<string, unknown> | null;
  expiresAt: number;
  createdAt: number;
};

function db() {
  return getD1();
}

/**
 * Soft-deny inbox upsert — at most two D1 round-trips (refresh, or cap+insert).
 */
export async function upsertPendingApproval(args: {
  phygitalToken: string;
  intentHash: string;
  code: string;
  error: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const now = Date.now();
  const expiresAt = now + PENDING_TTL_MS;
  const detailsJson =
    args.details != null ? JSON.stringify(args.details) : null;

  // Refresh TTL / copy when the same open intent already exists.
  const refreshed = await db()
    .prepare(
      `UPDATE pending_approvals
       SET code = ?, error = ?, details_json = ?, expires_at = ?
       WHERE phygital_token = ? AND intent_hash = ?
         AND resolved_at IS NULL AND expires_at > ?`,
    )
    .bind(
      args.code,
      args.error,
      detailsJson,
      expiresAt,
      args.phygitalToken,
      args.intentHash,
      now,
    )
    .run();

  if ((refreshed.meta.changes ?? 0) > 0) return;

  const id = crypto.randomUUID();
  // Cap open rows to newest MAX-1, then insert (one batch).
  await db().batch([
    db()
      .prepare(
        `UPDATE pending_approvals SET resolved_at = ?
         WHERE id IN (
           SELECT id FROM pending_approvals
           WHERE phygital_token = ? AND resolved_at IS NULL AND expires_at > ?
           ORDER BY created_at ASC
           LIMIT -1 OFFSET ?
         )`,
      )
      .bind(now, args.phygitalToken, now, MAX_OPEN_PER_TOKEN - 1),
    db()
      .prepare(
        `INSERT INTO pending_approvals
           (id, phygital_token, intent_hash, code, error, details_json,
            expires_at, resolved_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(
        id,
        args.phygitalToken,
        args.intentHash,
        args.code,
        args.error,
        detailsJson,
        expiresAt,
        now,
      ),
  ]);
}

export async function listOpenApprovals(
  phygitalToken: string,
  now = Date.now(),
): Promise<PendingApproval[]> {
  const rows = await db()
    .prepare(
      `SELECT id, phygital_token, intent_hash, code, error, details_json,
              expires_at, created_at
       FROM pending_approvals
       WHERE phygital_token = ? AND resolved_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(phygitalToken, now, MAX_OPEN_PER_TOKEN)
    .all<{
      id: string;
      phygital_token: string;
      intent_hash: string;
      code: string;
      error: string;
      details_json: string | null;
      expires_at: number;
      created_at: number;
    }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    phygitalToken: row.phygital_token,
    intentHash: row.intent_hash,
    code: row.code,
    error: row.error,
    details: row.details_json
      ? (JSON.parse(row.details_json) as Record<string, unknown>)
      : null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export async function resolvePendingApproval(
  phygitalToken: string,
  intentHash: string,
  now = Date.now(),
): Promise<boolean> {
  const result = await db()
    .prepare(
      `UPDATE pending_approvals
       SET resolved_at = ?
       WHERE phygital_token = ? AND intent_hash = ?
         AND resolved_at IS NULL`,
    )
    .bind(now, phygitalToken, intentHash)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Wipe inbox when policy is cleared / owner unlinks. */
export async function clearPendingApprovalsForToken(
  phygitalToken: string,
): Promise<void> {
  await db()
    .prepare(`DELETE FROM pending_approvals WHERE phygital_token = ?`)
    .bind(phygitalToken)
    .run();
}
