"use client";

import { ReceiveNearbySheet } from "@/components/wallet/receive-nearby-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function WalletReceiveNearbyPage() {
  const { walletAddress, go } = useWalletRoute();
  return (
    <ReceiveNearbySheet
      recipientWallet={walletAddress}
      onClose={() => go("receive")}
      onReceived={() => go("receive")}
    />
  );
}
