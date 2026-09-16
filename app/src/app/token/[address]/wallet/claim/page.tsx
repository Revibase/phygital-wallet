"use client";

import { ClaimAccessoryPanel } from "@/components/wallet/claim-accessory-panel";
import { useWalletSession } from "@/components/wallet/wallet-route-shell";

export default function WalletClaimPage() {
  const { tokenAddress } = useWalletSession();
  return <ClaimAccessoryPanel phygitalTokenPda={tokenAddress} />;
}
