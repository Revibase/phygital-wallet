/**
 * Map Helius `getTransactionsForAddress` full txs → {@link WalletActivityItem}.
 * Balance deltas come from meta pre/post SOL + token balances for the viewed wallet.
 */

import { NATIVE_SOL_MINT } from "@/lib/tokens/payment-token";
import type {
  WalletActivityDelta,
  WalletActivityItem,
  WalletActivityKind,
} from "@/lib/wallet/portfolio-types";

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

export type GtfaFullTransaction = {
  slot?: number;
  blockTime?: number | null;
  transaction?: {
    signatures?: string[];
    message?: {
      accountKeys?: AccountKey[];
    };
  };
  meta?: FullTxMeta | null;
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

/** Derive Phantom-style activity row from a full GTFA transaction. */
export function mapGtfaTransaction(
  walletAddress: string,
  tx: GtfaFullTransaction
): WalletActivityItem | null {
  const signature = tx.transaction?.signatures?.[0]?.trim();
  if (!signature) return null;

  const meta = tx.meta;
  const accountKeys = tx.transaction?.message?.accountKeys ?? [];
  const walletIndex = accountKeys.findIndex(
    (k) => accountPubkey(k) === walletAddress
  );

  const balanceDeltas: WalletActivityDelta[] = [];

  // Token deltas for ATAs owned by the wallet (covers receives that never list the owner key).
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

  // SOL delta for the wallet account; strip fee when this wallet paid it.
  if (walletIndex >= 0) {
    const pre = meta?.preBalances?.[walletIndex];
    const post = meta?.postBalances?.[walletIndex];
    if (typeof pre === "number" && typeof post === "number") {
      let lamports = post - pre;
      const feePayer = accountPubkey(accountKeys[0]);
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

  return {
    id: signature,
    walletAddress,
    kind,
    title,
    subtitle: null,
    amountLabel,
    statusLabel: failed ? "Failed" : null,
    timestamp: typeof tx.blockTime === "number" ? tx.blockTime : null,
    signature,
    mint: primary?.mint ?? null,
    balanceDeltas,
    source: "helius",
  };
}
