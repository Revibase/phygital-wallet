"use client";

import { CollectiblesAllSheet } from "@/components/wallet/collectibles-all-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";

export default function WalletCollectiblesPage() {
  const { walletAddress, mint } = useWalletSession();
  const { backHome, go } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);

  return (
    <CollectiblesAllSheet
      collectibles={portfolio.data?.collectibles ?? []}
      linkedMint={mint}
      onBack={backHome}
      onSelect={(c) => go("collectibles", c.mint)}
    />
  );
}
