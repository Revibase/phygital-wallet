"use client";

import { ReceiveNearbyPanel } from "@/components/wallet/receive-nearby-panel";
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
    <ReceiveNearbyPanel
      recipientWallet={walletAddress}
      onClose={() => backTo(receiveHref)}
      onReceived={() => backTo(receiveHref)}
    />
  );
}
