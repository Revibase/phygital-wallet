"use client";

import { address } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMaybeAuthority,
  findAuthorityAccountPda,
} from "phygital-wallet-sdk";

import { queryKeys } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";

export type SpendCapView = {
  /** Raw base units (lamports for the SOL cap). */
  cap: bigint;
  remaining: bigint;
  /** 0 = lifetime budget; >0 = recurring window in seconds. */
  windowSeconds: bigint;
};

export type WalletPolicyView = {
  /** True when a policy is present (any cap configured). */
  hasPolicy: boolean;
  /** Unified SOL/WSOL cap, or null when unset. */
  solCap: SpendCapView | null;
  mintCaps: (SpendCapView & { mint: string })[];
};

/** Read the on-chain spend policy inline in the Authority account. */
export function useWalletPolicy(phygitalToken: string | null) {
  return useQuery<WalletPolicyView>({
    queryKey: queryKeys.walletPolicy.byToken(phygitalToken),
    enabled: Boolean(phygitalToken),
    queryFn: async () => {
      const rpc = getSolanaRpc();
      const [authorityPda] = await findAuthorityAccountPda({
        phygitalToken: address(phygitalToken!),
      });
      const account = await fetchMaybeAuthority(rpc, authorityPda);
      if (!account.exists) {
        return { hasPolicy: false, solCap: null, mintCaps: [] };
      }

      const { solCap, mintCaps } = account.data;
      const solActive = solCap.cap !== 0n;
      const activeMintCaps = mintCaps
        .filter((m) => m.cap.cap !== 0n)
        .map((m) => ({
          mint: String(m.mint),
          cap: m.cap.cap,
          remaining: m.cap.remaining,
          windowSeconds: m.cap.windowSeconds,
        }));

      return {
        hasPolicy: solActive || activeMintCaps.length > 0,
        solCap: solActive
          ? {
              cap: solCap.cap,
              remaining: solCap.remaining,
              windowSeconds: solCap.windowSeconds,
            }
          : null,
        mintCaps: activeMintCaps,
      };
    },
  });
}
