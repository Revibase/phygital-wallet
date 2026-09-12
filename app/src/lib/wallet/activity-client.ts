import { queryFetch, readJson } from "@/lib/queries/http";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";

type ActivityResponse = {
  items?: WalletActivityItem[];
  nextCursor?: string | null;
};

/**
 * Load wallet activity from the Revibase index (`GET /wallets/:address/activity`).
 *
 * The API worker ingests every transaction touching a watched wallet (streamed
 * from the helius-wallet-service) into its own D1 table and serves the parsed
 * `WalletActivityItem` rows directly — so the app no longer calls Helius
 * `getTransactionsForAddress`. Rows carry `detail` (see `WalletActivityDetail`)
 * as the indexer's parser enriches them.
 */
export async function fetchWalletActivity(args: {
  walletAddress: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: WalletActivityItem[]; nextCursor: string | null }> {
  const limit = Math.min(50, Math.max(1, args.limit ?? 20));
  const params = new URLSearchParams({ limit: String(limit) });
  if (args.cursor) params.set("cursor", args.cursor);

  const res = await queryFetch(
    `/wallets/${encodeURIComponent(args.walletAddress)}/activity?${params}`
  );
  const body = await readJson<ActivityResponse>(res, "Couldn’t load activity");

  const items = (body.items ?? []).map((item) => ({
    ...item,
    // Defend against older rows / partial payloads.
    balanceDeltas: item.balanceDeltas ?? [],
    detail: item.detail ?? null,
    source: "local" as const,
  }));

  const nextCursor =
    typeof body.nextCursor === "string" && body.nextCursor.length > 0
      ? body.nextCursor
      : null;

  return { items, nextCursor };
}
