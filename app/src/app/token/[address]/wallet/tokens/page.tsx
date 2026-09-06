"use client";

import { TokensAllSheet } from "@/components/wallet/tokens-all-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";

export default function WalletTokensPage() {
  const { walletAddress, goHome, goSend } = useWalletRoute();
  const portfolio = useWalletPortfolio(walletAddress);

  return (
    <TokensAllSheet
      holdings={portfolio.data?.holdings ?? []}
      onBack={goHome}
      onSelect={(asset) => goSend(asset)}
    />
  );
}
