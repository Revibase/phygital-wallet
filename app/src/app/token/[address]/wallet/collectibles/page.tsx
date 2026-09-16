"use client";

import { CollectiblesAllPanel } from "@/components/wallet/collectibles-all-panel";
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
    <CollectiblesAllPanel
      collectibles={portfolio.data?.collectibles ?? []}
      linkedMint={mint}
      onBack={backHome}
      onSelect={(c) => go("collectibles", c.mint)}
    />
  );
}
