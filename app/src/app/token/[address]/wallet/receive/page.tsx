"use client";

import { ReceiveHub } from "@/components/wallet/receive-hub";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function WalletReceivePage() {
  const { walletAddress, backHome, go } = useWalletRoute();
  return (
    <ReceiveHub
      walletAddress={walletAddress}
      onClose={backHome}
      onReceiveNearby={() => go("receive", "nearby")}
    />
  );
}
