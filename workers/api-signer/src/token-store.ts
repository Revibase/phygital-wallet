/**
 * Per-token SQLite store for TokenSigner Durable Object.
 * One DO instance = one phygitalToken; tables omit the token column.
 *
 * Stores prepaid fee balances, idempotent fee events, and sign-time reserves.
 */
import {
  FEE_RESERVE_TTL_MS,
  MIN_ATTEMPT_FEE_LAMPORTS,
  STARTER_FEE_BALANCE_LAMPORTS,
} from "@/fees/constants";
import { coded } from "@/shared/errors";

type Sql = DurableObjectStorage["sql"];

export type FeeEvent = {
  signature: string;
  kind: "credit" | "debit";
  lamports: number;
};

export function initTokenSchema(sql: Sql): void {
  sql.exec(`
    DROP TABLE IF EXISTS owner;
    DROP TABLE IF EXISTS challenges;
    DROP TABLE IF EXISTS accessory_counter;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fee_balance (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance_lamports INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fee_events (
      signature TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      lamports INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fee_reserves (
      id TEXT PRIMARY KEY NOT NULL,
      lamports INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
}

export class TokenStore {
  constructor(
    private readonly sql: Sql,
    private readonly phygitalToken: string,
  ) {}

  ensureToken(token: string): void {
    const existing = this.sql
      .exec<{ value: string }>(
        `SELECT value FROM meta WHERE key = 'phygital_token'`,
      )
      .toArray()[0];
    if (existing) {
      if (existing.value !== token) {
        throw coded("TokenSigner DO token mismatch", "token_mismatch");
      }
      return;
    }
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('phygital_token', ?)`,
      token,
    );
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO fee_balance (id, balance_lamports, updated_at) VALUES (1, ?, ?)`,
      STARTER_FEE_BALANCE_LAMPORTS,
      now,
    );
  }

  // --- fees ---

  getFeeBalanceLamports(): number {
    const row = this.sql
      .exec<{ balance_lamports: number }>(
        `SELECT balance_lamports FROM fee_balance WHERE id = 1`,
      )
      .toArray()[0];
    return row?.balance_lamports ?? 0;
  }

  getReservedLamports(now = Date.now()): number {
    const row = this.sql
      .exec<{ total: number }>(
        `SELECT COALESCE(SUM(lamports), 0) AS total
         FROM fee_reserves WHERE expires_at > ?`,
        now,
      )
      .toArray()[0];
    return Number(row?.total ?? 0);
  }

  getAvailableLamports(now = Date.now()): number {
    return Math.max(
      0,
      this.getFeeBalanceLamports() - this.getReservedLamports(now),
    );
  }

  /**
   * Reserve attempt-floor lamports for a signed message.
   * Idempotent on `id` (same message hash reuses the existing row).
   */
  reserve(
    id: string,
    lamports: number = MIN_ATTEMPT_FEE_LAMPORTS,
    ttlMs: number = FEE_RESERVE_TTL_MS,
    now = Date.now(),
  ): boolean {
    if (lamports <= 0 || !id) return false;
    const existing = this.sql
      .exec<{ id: string; expires_at: number }>(
        `SELECT id, expires_at FROM fee_reserves WHERE id = ?`,
        id,
      )
      .toArray()[0];
    if (existing) {
      if (existing.expires_at > now) return true;
      this.sql.exec(`DELETE FROM fee_reserves WHERE id = ?`, id);
    }
    if (this.getAvailableLamports(now) < lamports) return false;
    this.sql.exec(
      `INSERT INTO fee_reserves (id, lamports, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
      id,
      lamports,
      now,
      now + ttlMs,
    );
    return true;
  }

  release(id: string): boolean {
    this.sql.exec(`DELETE FROM fee_reserves WHERE id = ?`, id);
    return true;
  }

  /** Drop expired reserves; returns how many rows removed. */
  expireReserves(now = Date.now()): number {
    const cursor = this.sql.exec(
      `DELETE FROM fee_reserves WHERE expires_at <= ?`,
      now,
    );
    return cursor.rowsWritten;
  }

  /** Soonest open reserve expiry, or null if none. */
  nextReserveExpiry(now = Date.now()): number | null {
    const row = this.sql
      .exec<{ expires_at: number }>(
        `SELECT expires_at FROM fee_reserves
         WHERE expires_at > ?
         ORDER BY expires_at ASC LIMIT 1`,
        now,
      )
      .toArray()[0];
    return row ? Number(row.expires_at) : null;
  }

  /**
   * On debit: release FIFO open reserves (covering the attempt floor), then
   * apply the actual lamport debit to the settled ledger.
   */
  settleDebit(event: FeeEvent, now = Date.now()): boolean {
    if (event.kind !== "debit") return this.applyFeeEvent(event);
    this.expireReserves(now);
    let remaining = MIN_ATTEMPT_FEE_LAMPORTS;
    const open = this.sql
      .exec<{ id: string; lamports: number }>(
        `SELECT id, lamports FROM fee_reserves
         WHERE expires_at > ?
         ORDER BY created_at ASC`,
        now,
      )
      .toArray();
    for (const row of open) {
      if (remaining <= 0) break;
      this.sql.exec(`DELETE FROM fee_reserves WHERE id = ?`, row.id);
      remaining -= Number(row.lamports);
    }
    return this.applyFeeEvent(event);
  }

  applyFeeEvent(event: FeeEvent): boolean {
    if (event.lamports <= 0) return false;
    const existing = this.sql
      .exec<{ signature: string }>(
        `SELECT signature FROM fee_events WHERE signature = ?`,
        event.signature,
      )
      .toArray()[0];
    if (existing) return false;

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO fee_events (signature, kind, lamports, created_at)
       VALUES (?, ?, ?, ?)`,
      event.signature,
      event.kind,
      event.lamports,
      now,
    );

    const current = this.getFeeBalanceLamports();
    const next =
      event.kind === "credit"
        ? current + event.lamports
        : Math.max(0, current - event.lamports);
    this.sql.exec(
      `INSERT INTO fee_balance (id, balance_lamports, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         balance_lamports = excluded.balance_lamports,
         updated_at = excluded.updated_at`,
      next,
      now,
    );
    return true;
  }
}
