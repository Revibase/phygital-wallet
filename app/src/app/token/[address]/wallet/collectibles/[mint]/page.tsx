"use client";

import { useParams } from "next/navigation";

import { CollectibleDetailPanel } from "@/components/wallet/collectible-detail-panel";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import { copy } from "@/lib/copy/phygital";
import { collectibleToSendAsset } from "@/lib/wallet/send-asset-ref";
import { tryParseRouteAddress } from "@/lib/solana/address";
import { walletHref } from "@/lib/wallet/token-routes";

export default function WalletCollectibleDetailPage() {
  const params = useParams();
  const mintAddr = tryParseRouteAddress(params, "mint");
  const { walletAddress, tokenAddress } = useWalletSession();
  const { backTo, goSend } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);

  if (!mintAddr) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {copy.wallet.noMatchingCollectibles}
      </p>
    );
  }

  const detail = portfolio.data?.collectibles.find(
    (c) => c.mint === String(mintAddr),
  );

  if (!detail) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {copy.wallet.noMatchingCollectibles}
      </p>
    );
  }

  return (
    <CollectibleDetailPanel
      collectible={detail}
      onBack={() => backTo(walletHref(tokenAddress, "collectibles"))}
      onSend={(c) => goSend(collectibleToSendAsset(c))}
    />
  );
}
