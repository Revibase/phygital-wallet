"use client";

import { ClaimAccessoryPanel } from "@/components/wallet/claim-accessory-panel";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

/** Canonical claim / set_authority Hold ceremony. */
export default function WalletClaimPage() {
  const { tokenAddress } = useWalletSession();
  const { backHome } = useWalletNav();

  return (
    <ClaimAccessoryPanel
      phygitalTokenPda={tokenAddress}
      onBack={backHome}
    />
  );
}
