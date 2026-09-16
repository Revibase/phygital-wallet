"use client";

import { TokensAllPanel } from "@/components/wallet/tokens-all-panel";
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
    <TokensAllPanel
      holdings={portfolio.data?.holdings ?? []}
      onBack={backHome}
      onSelect={(asset) => goSend(asset)}
    />
  );
}
