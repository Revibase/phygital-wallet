"use client";

import { useParams } from "next/navigation";

import { CollectibleDetailSheet } from "@/components/wallet/collectible-detail-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import { copy } from "@/lib/copy/phygital";
import { collectibleToSendAsset } from "@/lib/wallet/send-asset-ref";
import { tryParseAddress } from "@/lib/solana/address";
import { walletHref } from "@/lib/wallet/token-routes";

export default function WalletCollectibleDetailPage() {
  const params = useParams();
  const mintRaw =
    typeof params.mint === "string"
      ? params.mint
      : Array.isArray(params.mint)
        ? params.mint[0]
        : "";
  const mintAddr = tryParseAddress(mintRaw);
  const { walletAddress, tokenAddress, backTo, goSend } = useWalletRoute();
  const portfolio = useWalletPortfolio(walletAddress);

  const detail = portfolio.data?.collectibles.find(
    (c) => c.mint === (mintAddr ? String(mintAddr) : mintRaw),
  );

  if (!detail) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {copy.wallet.noMatchingCollectibles}
      </p>
    );
  }

  return (
    <CollectibleDetailSheet
      collectible={detail}
      onBack={() => backTo(walletHref(tokenAddress, "collectibles"))}
      onSend={(c) => goSend(collectibleToSendAsset(c))}
    />
  );
}
