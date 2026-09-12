import type { PaymentTokenHolding } from "@/lib/tokens/payment-token";

export type WalletCollectible = {
  mint: string;
  name: string;
  image: string | null;
  collectionName: string | null;
  interface: string;
  compressed: boolean;
  tokenProgram: string | null;
};

export type WalletPortfolio = {
  holdings: PaymentTokenHolding[];
  collectibles: WalletCollectible[];
};

export type WalletActivityKind =
  | "sent"
  | "received"
  | "approved"
  | "topUp"
  | "failed"
  | "other";

export type WalletActivityDeltaDirection = "in" | "out";

/**
 * A single mint balance change inside one transaction.
 * Direction is relative to the viewed wallet address.
 */
export type WalletActivityDelta = {
  mint: string;
  direction: WalletActivityDeltaDirection;
  /** UI amount without sign, e.g. "12.34" */
  amountUi: string;
};

/**
 * Coarse transaction category from the indexer's instruction parser. Mirrors
 * the API's `WalletActivityType`; `undefined` until the parser classifies a tx.
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
 * Extensible parsed detail from the API index (`detail_json`). Every field is
 * optional — older/indexed-but-unparsed rows omit them — so the UI must render
 * gracefully when any are absent. Mirrors the API's `WalletActivityDetail`.
 */
export type WalletActivityDetail = {
  type?: WalletActivityType;
  description?: string | null;
  counterparties?: string[];
  programIds?: string[];
  feeLamports?: number | null;
};

export type WalletActivityItem = {
  id: string;
  walletAddress: string;
  kind: WalletActivityKind;
  title: string;
  subtitle: string | null;
  amountLabel: string | null;
  balanceDeltas?: WalletActivityDelta[];
  statusLabel: string | null;
  timestamp: number | null;
  signature: string | null;
  mint: string | null;
  /** Rich parsed detail; `null`/absent until the API's parser fills it in. */
  detail?: WalletActivityDetail | null;
  pending?: boolean;
  source: "helius" | "local";
};
