"use client";

import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { WalletPolicyPanel } from "@/components/wallet/wallet-policy-panel";

/**
 * Spend-policy panel. Publicly viewable behind the browse-unlock cookie (the
 * wallet route floor); the editor within only appears for the on-chain owner.
 */
export default function WalletPolicyPage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <WalletPolicyPanel phygitalTokenPda={tokenAddress} onBack={backSettings} />
  );
}
