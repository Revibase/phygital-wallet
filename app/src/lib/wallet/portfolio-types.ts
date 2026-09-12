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
  pending?: boolean;
  source: "helius" | "local";
};
