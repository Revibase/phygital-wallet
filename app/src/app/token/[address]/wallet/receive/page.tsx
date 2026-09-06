"use client";

import { ReceiveHub } from "@/components/wallet/receive-hub";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function WalletReceivePage() {
  const { walletAddress, goHome, go } = useWalletRoute();
  return (
    <ReceiveHub
      walletAddress={walletAddress}
      onClose={goHome}
      onReceiveNearby={() => go("receive", "nearby")}
    />
  );
}
