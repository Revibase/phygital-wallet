"use client";

import { ReceiveNearbySheet } from "@/components/wallet/receive-nearby-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { walletHref } from "@/lib/wallet/token-routes";

export default function WalletReceiveNearbyPage() {
  const { walletAddress, tokenAddress } = useWalletSession();
  const { backTo } = useWalletNav();
  const receiveHref = walletHref(tokenAddress, "receive");
  return (
    <ReceiveNearbySheet
      recipientWallet={walletAddress}
      onClose={() => backTo(receiveHref)}
      onReceived={() => backTo(receiveHref)}
    />
  );
}
