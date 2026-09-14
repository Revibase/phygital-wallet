/**
 * Per-token SQLite store for TokenSigner Durable Object.
 * One DO instance = one phygitalToken; tables omit the token column.
 *
 * Stores only prepaid fee balances and idempotent fee events.
 */
import { STARTER_FEE_BALANCE_LAMPORTS } from "@/fees/constants";
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
  `);
}

export class TokenStore {
  constructor(
    private readonly sql: Sql,
    private readonly phygitalToken: string
  ) {}

  ensureToken(token: string): void {
    const existing = this.sql
      .exec<{ value: string }>(
        `SELECT value FROM meta WHERE key = 'phygital_token'`
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
      token
    );
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO fee_balance (id, balance_lamports, updated_at) VALUES (1, ?, ?)`,
      STARTER_FEE_BALANCE_LAMPORTS,
      now
    );
  }

  // --- fees ---

  getFeeBalanceLamports(): number {
    const row = this.sql
      .exec<{ balance_lamports: number }>(
        `SELECT balance_lamports FROM fee_balance WHERE id = 1`
      )
      .toArray()[0];
    return row?.balance_lamports ?? 0;
  }

  applyFeeEvent(event: FeeEvent): boolean {
    if (event.lamports <= 0) return false;
    const existing = this.sql
      .exec<{ signature: string }>(
        `SELECT signature FROM fee_events WHERE signature = ?`,
        event.signature
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
      now
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
      now
    );
    return true;
  }
}
