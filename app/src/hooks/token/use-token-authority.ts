"use client";

import { address } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMaybeAuthority,
  findAuthorityAccountPda,
} from "phygital-wallet-sdk";

import { queryKeys, queryOptions } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";

export type TokenAuthority = {
  /** True once an on-chain Authority account exists (accessory claimed). */
  isClaimed: boolean;
  /** The owner (ed25519) pubkey set as authority, or null when unclaimed. */
  authority: string | null;
};

/** Read the on-chain Authority for a phygital token — the source of ownership. */
export function useTokenAuthority(phygitalToken: string | null) {
  return useQuery<TokenAuthority>({
    queryKey: queryKeys.tokenAuthority.byToken(phygitalToken),
    enabled: Boolean(phygitalToken),
    queryFn: async () => {
      const rpc = getSolanaRpc();
      const [authorityPda] = await findAuthorityAccountPda({
        phygitalToken: address(phygitalToken!),
      });
      const account = await fetchMaybeAuthority(rpc, authorityPda);
      if (!account.exists) return { isClaimed: false, authority: null };
      return {
        isClaimed: true,
        authority: String(account.data.header.authority),
      };
    },
    ...queryOptions.default,
  });
}
