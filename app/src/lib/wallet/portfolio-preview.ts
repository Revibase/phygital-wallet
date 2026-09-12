import {
  isNativeSolHolding,
  type PaymentTokenHolding,
} from "@/lib/tokens/payment-token";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";

export const HOME_TOKEN_PREVIEW = 5;
export const HOME_COLLECTIBLE_PREVIEW = 4;
export const ALL_LIST_SEARCH_THRESHOLD = 8;

export function sortHoldings(
  holdings: PaymentTokenHolding[]
): PaymentTokenHolding[] {
  const hasUsd = holdings.some(
    (h) => typeof h.valueUsd === "number" && Number.isFinite(h.valueUsd)
  );

  return [...holdings].sort((a, b) => {
    const aUsd = a.valueUsd;
    const bUsd = b.valueUsd;
    const aHasUsd = typeof aUsd === "number" && Number.isFinite(aUsd);
    const bHasUsd = typeof bUsd === "number" && Number.isFinite(bUsd);

    if (hasUsd && aHasUsd && bHasUsd && aUsd !== bUsd) return bUsd - aUsd;
    if (hasUsd && aHasUsd !== bHasUsd) return aHasUsd ? -1 : 1;

    const aSol = isNativeSolHolding(a);
    const bSol = isNativeSolHolding(b);
    if (aSol !== bSol) return aSol ? -1 : 1;

    const aBal = BigInt(a.balanceRaw || "0");
    const bBal = BigInt(b.balanceRaw || "0");
    if (aBal === bBal) return 0;
    return aBal > bBal ? -1 : 1;
  });
}

export function sortCollectibles(
  collectibles: WalletCollectible[],
  linkedMint?: string | null
): WalletCollectible[] {
  return [...collectibles].sort((a, b) => {
    if (linkedMint) {
      if (a.mint === linkedMint && b.mint !== linkedMint) return -1;
      if (b.mint === linkedMint && a.mint !== linkedMint) return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function previewHoldings(
  holdings: PaymentTokenHolding[]
): PaymentTokenHolding[] {
  return sortHoldings(holdings).slice(0, HOME_TOKEN_PREVIEW);
}

export function previewCollectibles(
  collectibles: WalletCollectible[],
  linkedMint?: string | null
): WalletCollectible[] {
  return sortCollectibles(collectibles, linkedMint).slice(
    0,
    HOME_COLLECTIBLE_PREVIEW
  );
}
