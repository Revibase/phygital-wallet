"use client";

import { TokensAllSheet } from "@/components/wallet/tokens-all-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";

export default function WalletTokensPage() {
  const { walletAddress } = useWalletSession();
  const { backHome, goSend } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);

  return (
    <TokensAllSheet
      holdings={portfolio.data?.holdings ?? []}
      onBack={backHome}
      onSelect={(asset) => goSend(asset)}
    />
  );
}
