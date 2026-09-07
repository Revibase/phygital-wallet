"use client";

import { ReceiveNearbySheet } from "@/components/wallet/receive-nearby-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";
import { walletHref } from "@/lib/wallet/token-routes";

export default function WalletReceiveNearbyPage() {
  const { walletAddress, tokenAddress, backTo } = useWalletRoute();
  const receiveHref = walletHref(tokenAddress, "receive");
  return (
    <ReceiveNearbySheet
      recipientWallet={walletAddress}
      onClose={() => backTo(receiveHref)}
      onReceived={() => backTo(receiveHref)}
    />
  );
}
