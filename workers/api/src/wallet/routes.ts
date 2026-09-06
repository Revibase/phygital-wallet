import { Hono } from "hono";

import { getRpcUrl } from "@/shared/solana/cluster";
import { json } from "@/shared/http";
import { tryParseAddress } from "@/shared/solana/address";
import { getErrorMessage } from "@/shared/utils";

/**
 * Helius Wallet API — GET /v1/wallet/{address}/history
 * @see https://www.helius.dev/docs/wallet-api/history
 */
type WalletHistoryBalanceChange = {
  mint?: string;
  /** Human-readable (already divided by decimals); signed. */
  amount?: number;
  decimals?: number;
};

type WalletHistoryTx = {
  signature?: string;
  timestamp?: number | null;
  slot?: number;
  fee?: number;
  feePayer?: string;
  error?: unknown;
  balanceChanges?: WalletHistoryBalanceChange[];
};

type WalletHistoryResponse = {
  data?: WalletHistoryTx[];
  pagination?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  };
};

const NATIVE_SOL_MINT =
  "So11111111111111111111111111111111111111112" as const;

function normalizeMint(mint: string | undefined): string | null {
  const raw = mint?.trim();
  if (!raw) return null;
  if (raw === "SOL" || raw === NATIVE_SOL_MINT) return NATIVE_SOL_MINT;
  return raw;
}

function formatUiAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  const abs = Math.abs(amount);
  return abs.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function mapHistoryTx(walletAddress: string, tx: WalletHistoryTx) {
  const signature = tx.signature?.trim();
  if (!signature) return null;

  const balanceDeltas: Array<{
    mint: string;
    direction: "in" | "out";
    amountUi: string;
  }> = [];

  let hasIn = false;
  let hasOut = false;

  for (const change of tx.balanceChanges ?? []) {
    const mint = normalizeMint(change.mint);
    const amount = typeof change.amount === "number" ? change.amount : NaN;
    if (!mint || !Number.isFinite(amount) || amount === 0) continue;
    const direction = amount > 0 ? "in" : "out";
    if (direction === "in") hasIn = true;
    else hasOut = true;
    balanceDeltas.push({
      mint,
      direction,
      amountUi: formatUiAmount(amount),
    });
  }

  const failed = tx.error != null && tx.error !== false;
  const kind: "failed" | "sent" | "received" | "other" = failed
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

  const title = failed
    ? "Failed"
    : kind === "sent"
      ? "Sent"
      : kind === "received"
        ? "Received"
        : "Transaction";

  return {
    id: signature,
    walletAddress,
    kind,
    title,
    subtitle: null as string | null,
    amountLabel,
    statusLabel: failed ? "Failed" : null,
    timestamp: typeof tx.timestamp === "number" ? tx.timestamp : null,
    signature,
    mint: primary?.mint ?? null,
    balanceDeltas,
    source: "helius" as const,
  };
}

async function fetchWalletHistory(args: {
  wallet: string;
  limit: number;
  before?: string;
}): Promise<WalletHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(args.limit),
    tokenAccounts: "balanceChanged",
  });
  if (args.before) params.set("before", args.before);

  const res = await fetch(
    `${getRpcUrl()}/v1/wallet/${args.wallet}/history?${params.toString()}`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(`Helius wallet history failed (${res.status})`);
  }
  return (await res.json()) as WalletHistoryResponse;
}

export const walletRoutes = new Hono();

/**
 * GET /wallet/activity — proxies Helius Wallet API history (100 credits/req).
 * Query: wallet (required), limit (1–50), before (signature cursor).
 */
walletRoutes.get("/wallet/activity", async (c) => {
  const walletRaw = c.req.query("wallet")?.trim() ?? "";
  const wallet = tryParseAddress(walletRaw);
  if (!wallet) {
    return json(
      { error: "Query param wallet must be a valid Solana address" },
      { status: 400 },
    );
  }

  const before = c.req.query("before")?.trim() || undefined;
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));

  try {
    const response = await fetchWalletHistory({
      wallet: String(wallet),
      limit,
      before,
    });

    const items = (response.data ?? [])
      .map((tx) => mapHistoryTx(String(wallet), tx))
      .filter((item): item is NonNullable<typeof item> => item != null);

    const nextCursor =
      response.pagination?.hasMore && response.pagination.nextCursor
        ? response.pagination.nextCursor
        : null;

    return json({ items, nextCursor });
  } catch (error) {
    return json(
      { error: getErrorMessage(error, "Failed to load wallet activity") },
      { status: 502 },
    );
  }
});
