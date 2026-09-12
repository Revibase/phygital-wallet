"use client";

import { useQuery } from "@tanstack/react-query";
import { address } from "@solana/kit";
import {
  fetchMaybeConfig,
  fetchMaybeTokenVerifier,
  findConfigPda,
  findTokenVerifierPda,
  isConfigDefaultVerifier,
} from "phygital-wallet-sdk";

import { queryKeys, queryOptions } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";

export type TokenVerifierStatus = {
  /** True when an on-chain TokenVerifier override PDA exists. */
  custom: boolean;
  verifier: string | null;
  endpoint: string | null;
  /** Rent payer of the override PDA (for clear). */
  payer: string | null;
  /** True when default-verifier fee balance / paymaster applies. */
  usesDefaultPaymaster: boolean;
};

/** On-chain token verifier override for a phygital token (signing settings). */
export function useTokenVerifier(phygitalToken: string | null) {
  return useQuery({
    queryKey: queryKeys.tokenVerifier.byToken(phygitalToken),
    queryFn: async (): Promise<TokenVerifierStatus> => {
      const rpc = getSolanaRpc();
      const token = address(phygitalToken!);
      const [[pda], [configPda]] = await Promise.all([
        findTokenVerifierPda({ phygitalToken: token }),
        findConfigPda(),
      ]);
      const [account, config] = await Promise.all([
        fetchMaybeTokenVerifier(rpc, pda),
        fetchMaybeConfig(rpc, configPda),
      ]);
      if (!account.exists) {
        return {
          custom: false,
          verifier: null,
          endpoint: null,
          payer: null,
          usesDefaultPaymaster: true,
        };
      }
      const verifier = String(account.data.verifier);
      return {
        custom: true,
        verifier,
        endpoint: account.data.endpoint || null,
        payer: String(account.data.payer),
        usesDefaultPaymaster: isConfigDefaultVerifier(
          config.exists ? config.data : null,
          verifier
        ),
      };
    },
    enabled: Boolean(phygitalToken),
    ...queryOptions.default,
  });
}
