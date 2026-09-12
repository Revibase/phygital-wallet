/**
 * Parse a Helius `transactionSubscribe` result into readable wallet-activity
 * rows — one per wallet the transaction touches.
 *
 * This is the worker-side twin of the app's `activity-from-rpc.ts`
 * (`mapGtfaTransaction`). The app derives the same rows on demand from Helius
 * `getTransactionsForAddress`; here we derive them once, at ingest, and index
 * them in D1 so the app can stop calling Helius for activity.
 *
 * Shape note: `getTransactionsForAddress` returns the full tx at the top level
 * (`tx.meta`, `tx.transaction.message`). `transactionSubscribe` nests it one
 * level deeper under `result.transaction`, so the confirmed-tx object we map is
 * `result.transaction` — with `.meta` and `.transaction.message.accountKeys`.
 */

/** So11111111111111111111111111111111111111112 — wrapped-SOL / native sentinel. */
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export type WalletActivityKind =
  | "sent"
  | "received"
  | "approved"
  | "topUp"
  | "failed"
  | "other";

export type WalletActivityDeltaDirection = "in" | "out";

/** One mint's balance change inside a tx, relative to the wallet. */
export type WalletActivityDelta = {
  mint: string;
  direction: WalletActivityDeltaDirection;
  /** UI amount without sign, e.g. "12.34". */
  amountUi: string;
};

/**
 * Bump whenever the parser starts extracting materially richer `detail`. Rows
 * carry the version they were written at, so a future backfill can find rows
 * below the current version and re-parse them in place — no reingest needed.
 */
export const WALLET_ACTIVITY_PARSER_VERSION = 1;

/**
 * Coarse transaction category. Balance-change parsing can only tell direction
 * (see {@link WalletActivityKind}); a richer instruction-level parser fills
 * this in later. Left `undefined` today.
 */
export type WalletActivityType =
  | "transfer"
  | "swap"
  | "nft_sale"
  | "nft_mint"
  | "nft_transfer"
  | "stake"
  | "unstake"
  | "burn"
  | "program_interaction"
  | "unknown";

/**
 * Structured, per-tx detail beyond the summary columns. This is the forward-
 * compatibility escape hatch: it is stored as JSON (`detail_json`), so new
 * parsers add fields here without a schema migration. Every field is optional
 * and readers MUST tolerate any of them being absent (older rows won't have
 * them until re-parsed — see {@link WALLET_ACTIVITY_PARSER_VERSION}).
 *
 * When you add a field, extend this type — that is the only change required;
 * old rows simply return it as `undefined`. Promote a field to a first-class
 * column only once you need to filter or sort on it (cf. `audit_log`).
 */
export type WalletActivityDetail = {
  /** Transaction category once instruction parsing can classify it. */
  type?: WalletActivityType;
  /** Human-readable one-line description, e.g. "Swapped 10 USDC for 0.05 SOL". */
  description?: string | null;
  /** Other wallets involved (senders / recipients / authorities). */
  counterparties?: string[];
  /** Program ids invoked by the transaction. */
  programIds?: string[];
  /** Network fee in lamports — set on the fee payer's row. */
  feeLamports?: number | null;
};

/** A fully-parsed activity row for one wallet, ready to persist. */
export type WalletActivityRow = {
  walletAddress: string;
  signature: string;
  slot: number | null;
  /** Unix seconds; block time when known, else the webhook receivedAt. */
  blockTime: number;
  kind: WalletActivityKind;
  title: string;
  amountLabel: string | null;
  statusLabel: string | null;
  mint: string | null;
  balanceDeltas: WalletActivityDelta[];
  failed: boolean;
  /** Extensible structured detail; `null` when the parser had nothing to add. */
  detail: WalletActivityDetail | null;
  /** Parser version that produced this row ({@link WALLET_ACTIVITY_PARSER_VERSION}). */
  parserVersion: number;
};

type TokenBalanceEntry = {
  accountIndex?: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: {
    uiAmount?: number | null;
    uiAmountString?: string;
    decimals?: number;
    amount?: string;
  };
};

type FullTxMeta = {
  err?: unknown;
  fee?: number;
  preBalances?: number[];
  postBalances?: number[];
  preTokenBalances?: TokenBalanceEntry[];
  postTokenBalances?: TokenBalanceEntry[];
};

type AccountKey = string | { pubkey?: string };

/** `result.transaction` — the confirmed tx inside a subscribe notification. */
type ConfirmedTransaction = {
  meta?: FullTxMeta | null;
  transaction?: {
    signatures?: string[];
    message?: { accountKeys?: AccountKey[] };
  };
};

/** `data.params.result` — the full webhook `result` payload. */
export type SubscribeTxResult = {
  signature?: string;
  slot?: number | null;
  blockTime?: number | null;
  transaction?: ConfirmedTransaction | null;
};

function accountPubkey(key: AccountKey | undefined): string | null {
  if (typeof key === "string") return key;
  if (key && typeof key.pubkey === "string") return key.pubkey;
  return null;
}

function formatUiAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  const abs = Math.abs(amount);
  return abs.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function symbolForMint(mint: string): string {
  if (mint === NATIVE_SOL_MINT) return "SOL";
  if (mint.length <= 8) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function uiAmountFromToken(entry: TokenBalanceEntry): number {
  const ui = entry.uiTokenAmount?.uiAmount;
  if (typeof ui === "number" && Number.isFinite(ui)) return ui;
  const raw = entry.uiTokenAmount?.uiAmountString;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const amount = entry.uiTokenAmount?.amount;
  const decimals = entry.uiTokenAmount?.decimals;
  if (amount && typeof decimals === "number") {
    const n = Number(amount) / 10 ** decimals;
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function tokenAmountsByMint(
  entries: TokenBalanceEntry[] | undefined,
  walletAddress: string
): Map<string, number> {
  const byMint = new Map<string, number>();
  for (const entry of entries ?? []) {
    if (entry.owner !== walletAddress || !entry.mint) continue;
    const mint = entry.mint;
    byMint.set(mint, (byMint.get(mint) ?? 0) + uiAmountFromToken(entry));
  }
  return byMint;
}

function pushDelta(
  deltas: WalletActivityDelta[],
  mint: string,
  signedUi: number
): void {
  if (!Number.isFinite(signedUi) || signedUi === 0) return;
  deltas.push({
    mint,
    direction: signedUi > 0 ? "in" : "out",
    amountUi: formatUiAmount(signedUi),
  });
}

/** Wallets the tx affects: token-balance owners + SOL-balance-changed keys. */
function affectedWallets(confirmed: ConfirmedTransaction): Set<string> {
  const wallets = new Set<string>();
  const meta = confirmed.meta;

  for (const entry of meta?.preTokenBalances ?? []) {
    if (entry.owner) wallets.add(entry.owner);
  }
  for (const entry of meta?.postTokenBalances ?? []) {
    if (entry.owner) wallets.add(entry.owner);
  }

  const accountKeys = confirmed.transaction?.message?.accountKeys ?? [];
  const pre = meta?.preBalances ?? [];
  const post = meta?.postBalances ?? [];
  for (let i = 0; i < accountKeys.length; i++) {
    if (pre[i] !== post[i]) {
      const key = accountPubkey(accountKeys[i]);
      if (key) wallets.add(key);
    }
  }
  return wallets;
}

/** Derive a single wallet's activity row from a confirmed tx, or null. */
function mapWalletActivity(
  walletAddress: string,
  confirmed: ConfirmedTransaction,
  signature: string,
  slot: number | null,
  blockTime: number
): WalletActivityRow | null {
  const meta = confirmed.meta;
  const accountKeys = confirmed.transaction?.message?.accountKeys ?? [];
  const walletIndex = accountKeys.findIndex(
    (k) => accountPubkey(k) === walletAddress
  );

  const balanceDeltas: WalletActivityDelta[] = [];

  // Token deltas for ATAs owned by the wallet (covers receives that never
  // list the owner as an account key).
  const preTokens = tokenAmountsByMint(meta?.preTokenBalances, walletAddress);
  const postTokens = tokenAmountsByMint(meta?.postTokenBalances, walletAddress);
  const mints = new Set([...preTokens.keys(), ...postTokens.keys()]);
  for (const mint of mints) {
    pushDelta(
      balanceDeltas,
      mint,
      (postTokens.get(mint) ?? 0) - (preTokens.get(mint) ?? 0)
    );
  }

  const feePayer = accountPubkey(accountKeys[0]);

  // SOL delta for the wallet account; strip the fee when this wallet paid it.
  if (walletIndex >= 0) {
    const pre = meta?.preBalances?.[walletIndex];
    const post = meta?.postBalances?.[walletIndex];
    if (typeof pre === "number" && typeof post === "number") {
      let lamports = post - pre;
      const fee = typeof meta?.fee === "number" ? meta.fee : 0;
      if (feePayer === walletAddress && fee > 0) {
        lamports += fee;
      }
      if (lamports !== 0) {
        pushDelta(balanceDeltas, NATIVE_SOL_MINT, lamports / 1e9);
      }
    }
  }

  const failed = meta?.err != null && meta.err !== false;

  // Skip wallets this tx did not meaningfully affect: no balance change and not
  // the fee payer of a failed tx (which still belongs in the payer's history).
  if (balanceDeltas.length === 0 && !(failed && feePayer === walletAddress)) {
    return null;
  }

  let hasIn = false;
  let hasOut = false;
  for (const d of balanceDeltas) {
    if (d.direction === "in") hasIn = true;
    else hasOut = true;
  }

  const kind: WalletActivityKind = failed
    ? "failed"
    : hasOut && !hasIn
    ? "sent"
    : hasIn && !hasOut
    ? "received"
    : "other";

  const primary = balanceDeltas[0] ?? null;
  const amountLabel = primary
    ? `${primary.direction === "in" ? "+" : "-"}${primary.amountUi}`
    : null;
  const asset = primary ? symbolForMint(primary.mint) : null;
  const title = failed
    ? "Failed"
    : kind === "sent"
    ? asset
      ? `Sent ${asset}`
      : "Sent"
    : kind === "received"
    ? asset
      ? `Received ${asset}`
      : "Received"
    : "Transaction";

  // Structured detail. Today we only surface what balance-change parsing can
  // know for free (the fee, on the payer's row); richer parsers extend this.
  const detail: WalletActivityDetail = {};
  const fee = typeof meta?.fee === "number" ? meta.fee : null;
  if (fee != null && feePayer === walletAddress) {
    detail.feeLamports = fee;
  }

  return {
    walletAddress,
    signature,
    slot,
    blockTime,
    kind,
    title,
    amountLabel,
    statusLabel: failed ? "Failed" : null,
    mint: primary?.mint ?? null,
    balanceDeltas,
    failed,
    detail: Object.keys(detail).length > 0 ? detail : null,
    parserVersion: WALLET_ACTIVITY_PARSER_VERSION,
  };
}

/**
 * Parse a webhook `result` into one activity row per affected wallet.
 *
 * `receivedAt` (unix seconds from the webhook envelope) is the fallback block
 * time when the subscribe notification omits `blockTime`, so every row is
 * sortable and paginable.
 */
export function activityRowsFromResult(
  result: SubscribeTxResult,
  receivedAt: number
): WalletActivityRow[] {
  const confirmed = result.transaction;
  if (!confirmed || typeof confirmed !== "object") return [];

  const signature =
    result.signature?.trim() ||
    confirmed.transaction?.signatures?.[0]?.trim() ||
    "";
  if (!signature) return [];

  const slot = typeof result.slot === "number" ? result.slot : null;
  const blockTime =
    typeof result.blockTime === "number" && Number.isFinite(result.blockTime)
      ? result.blockTime
      : Math.floor(receivedAt);

  const rows: WalletActivityRow[] = [];
  for (const wallet of affectedWallets(confirmed)) {
    const row = mapWalletActivity(
      wallet,
      confirmed,
      signature,
      slot,
      blockTime
    );
    if (row) rows.push(row);
  }
  return rows;
}
