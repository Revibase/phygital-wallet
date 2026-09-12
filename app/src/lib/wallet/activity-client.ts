import {
  getDefaultRpcUrl,
  resolveActivityRpcUrl,
} from "@/lib/solana/rpc-preference";
import {
  mapGtfaTransaction,
  type GtfaFullTransaction,
} from "@/lib/wallet/activity-from-rpc";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";

type GtfaResult = {
  data?: GtfaFullTransaction[];
  paginationToken?: string | null;
};

type JsonRpcBody = {
  result?: GtfaResult;
  error?: { message?: string; code?: number };
};

/**
 * Load wallet activity via Helius `getTransactionsForAddress` (full txs).
 * Uses a Helius custom RPC when set; otherwise the app default RPC.
 */
export async function fetchWalletActivity(args: {
  walletAddress: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: WalletActivityItem[]; nextCursor: string | null }> {
  const limit = Math.min(50, Math.max(1, args.limit ?? 20));
  const rpcUrl = resolveActivityRpcUrl() || getDefaultRpcUrl();

  const config: Record<string, unknown> = {
    transactionDetails: "full",
    sortOrder: "desc",
    limit,
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0,
    filters: {
      tokenAccounts: "balanceChanged",
      status: "any",
    },
  };
  if (args.cursor) config.paginationToken = args.cursor;

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "wallet-activity",
      method: "getTransactionsForAddress",
      params: [args.walletAddress, config],
    }),
  });
  if (!res.ok) {
    throw new Error(`Wallet activity RPC failed (${res.status})`);
  }

  const body = (await res.json()) as JsonRpcBody;
  if (body.error?.message) {
    throw new Error(body.error.message);
  }

  const result = body.result;
  const items = (result?.data ?? [])
    .map((tx) => mapGtfaTransaction(args.walletAddress, tx))
    .filter((item): item is WalletActivityItem => item != null);

  const nextCursor =
    typeof result?.paginationToken === "string" &&
    result.paginationToken.length > 0
      ? result.paginationToken
      : null;

  return { items, nextCursor };
}
