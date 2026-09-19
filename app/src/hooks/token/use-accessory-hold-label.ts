"use client";

import { useWalletPda } from "@/hooks/wallet/use-wallet-pda";
import { copy } from "@/lib/copy/phygital";
import { shortAddress } from "@/lib/utils";

/** Display name for Hold / mismatch recovery (wallet address only). */
export function useAccessoryHoldLabel(phygitalTokenPda: string | null) {
  const { walletAddress, pending } = useWalletPda(phygitalTokenPda);

  const name = walletAddress
    ? shortAddress(walletAddress, 4)
    : copy.home.accessory;

  return {
    name,
    imageSrc: null as string | null,
    loading: Boolean(phygitalTokenPda) && pending,
  };
}
