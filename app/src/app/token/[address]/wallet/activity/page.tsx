"use client";

import { ActivityAllSheet } from "@/components/wallet/activity-all-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function WalletActivityPage() {
  const { walletAddress, goHome } = useWalletRoute();
  return <ActivityAllSheet walletAddress={walletAddress} onBack={goHome} />;
}
