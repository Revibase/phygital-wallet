/**
 * D1 persistence for the self-indexed wallet activity (`wallet_activity`).
 *
 * Writes come from the queue consumer (idempotent upserts). Reads back the
 * `{ items, nextCursor }` shape the app already renders (`WalletActivityItem`),
 * so `GET /wallets/:address/activity` is a drop-in for the Helius activity API.
 */
import { D1_BATCH_CHUNK, getD1 } from "@/shared/db";

import type {
  WalletActivityDelta,
  WalletActivityDetail,
  WalletActivityKind,
  WalletActivityRow,
} from "@/webhooks/wallet-activity";

/** Row served to the app — mirrors the app's `WalletActivityItem`. */
export type WalletActivityItem = {
  id: string;
  walletAddress: string;
  kind: WalletActivityKind;
  title: string;
  subtitle: string | null;
  amountLabel: string | null;
  balanceDeltas: WalletActivityDelta[];
  statusLabel: string | null;
  timestamp: number | null;
  signature: string | null;
  mint: string | null;
  /** Extensible parsed detail; `null` until a richer parser fills it in. */
  detail: WalletActivityDetail | null;
  source: "local";
};

const INSERT_SQL = `INSERT OR IGNORE INTO wallet_activity
    (wallet_address, signature, slot, block_time, kind, title,
     amount_label, status_label, mint, deltas_json, failed,
     detail_json, parser_version, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Idempotently upsert activity rows. Duplicate (wallet, signature) pairs are
 * ignored, so redelivered queue messages and service retries are safe.
 */
export async function storeWalletActivities(
  rows: WalletActivityRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const db = getD1();
  const now = Date.now();
  const insert = db.prepare(INSERT_SQL);
  const statements = rows.map((r) =>
    insert.bind(
      r.walletAddress,
      r.signature,
      r.slot,
      r.blockTime,
      r.kind,
      r.title,
      r.amountLabel,
      r.statusLabel,
      r.mint,
      JSON.stringify(r.balanceDeltas),
      r.failed ? 1 : 0,
      r.detail ? JSON.stringify(r.detail) : null,
      r.parserVersion,
      now
    )
  );

  for (let i = 0; i < statements.length; i += D1_BATCH_CHUNK) {
    await db.batch(statements.slice(i, i + D1_BATCH_CHUNK));
  }
}

type ActivityDbRow = {
  id: number;
  wallet_address: string;
  signature: string;
  block_time: number;
  kind: string;
  title: string;
  amount_label: string | null;
  status_label: string | null;
  mint: string | null;
  deltas_json: string | null;
  detail_json: string | null;
};

/** Opaque keyset cursor: `${block_time}:${id}`, newest-first. */
function encodeCursor(row: ActivityDbRow): string {
  return `${row.block_time}:${row.id}`;
}

function decodeCursor(
  cursor: string | null | undefined
): { blockTime: number; id: number } | null {
  if (!cursor) return null;
  const [t, id] = cursor.split(":");
  const blockTime = Number(t);
  const rowId = Number(id);
  if (!Number.isFinite(blockTime) || !Number.isFinite(rowId)) return null;
  return { blockTime, id: rowId };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt row — serve the fallback rather than failing the whole page.
    return fallback;
  }
}

function toItem(row: ActivityDbRow): WalletActivityItem {
  const parsedDeltas = parseJson<WalletActivityDelta[]>(row.deltas_json, []);
  const balanceDeltas = Array.isArray(parsedDeltas) ? parsedDeltas : [];
  const detail = parseJson<WalletActivityDetail | null>(row.detail_json, null);
  return {
    id: row.signature,
    walletAddress: row.wallet_address,
    kind: row.kind as WalletActivityKind,
    title: row.title,
    subtitle: null,
    amountLabel: row.amount_label,
    balanceDeltas,
    statusLabel: row.status_label,
    timestamp: row.block_time,
    signature: row.signature,
    mint: row.mint,
    detail,
    source: "local",
  };
}

const SELECT_COLUMNS = `id, wallet_address, signature, block_time, kind, title,
    amount_label, status_label, mint, deltas_json, detail_json`;

/**
 * Read a wallet's activity newest-first with keyset pagination.
 * Returns one extra row beyond `limit` internally to compute `nextCursor`.
 */
export async function readWalletActivity(args: {
  walletAddress: string;
  limit: number;
  cursor?: string | null;
}): Promise<{ items: WalletActivityItem[]; nextCursor: string | null }> {
  const limit = Math.min(50, Math.max(1, args.limit));
  const db = getD1();
  const after = decodeCursor(args.cursor);

  const stmt = after
    ? db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM wallet_activity
             WHERE wallet_address = ?
               AND (block_time < ? OR (block_time = ? AND id < ?))
             ORDER BY block_time DESC, id DESC
             LIMIT ?`
        )
        .bind(
          args.walletAddress,
          after.blockTime,
          after.blockTime,
          after.id,
          limit + 1
        )
    : db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM wallet_activity
             WHERE wallet_address = ?
             ORDER BY block_time DESC, id DESC
             LIMIT ?`
        )
        .bind(args.walletAddress, limit + 1);

  const { results } = await stmt.all<ActivityDbRow>();
  const rows = results ?? [];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;

  return { items: page.map(toItem), nextCursor };
}
