"use client";

import type { ReactNode } from "react";

import { OwnerGate } from "@/components/wallet/owner-gate";
import { useWalletSession } from "@/components/wallet/wallet-route-shell";

/**
 * Spend-policy settings are the only owner-gated route: editing caps mutates
 * the on-chain authority state, so it must be the current owner. `OwnerGate`
 * enforces this on the frontend (`useTokenOwner`); the on-chain instruction is
 * authority-signed regardless. This is the designated mount point for the
 * policy editor UI.
 */
export default function WalletPolicyLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { tokenAddress } = useWalletSession();
  return <OwnerGate phygitalTokenPda={tokenAddress}>{children}</OwnerGate>;
}
