"use client";

import { address } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMaybeAuthority,
  findAuthorityAccountPda,
  type ProgramAccess,
} from "phygital-wallet-sdk";

import { queryKeys } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";

export type SpendCapView = {
  /** Raw base units (lamports for the SOL cap). */
  cap: bigint;
  remaining: bigint;
  /** Unix seconds the current window was anchored; reset = lastReset + window. */
  lastReset: bigint;
  /** 0 = lifetime budget; >0 = recurring window in seconds. */
  windowSeconds: bigint;
};

/** Simplified access for the editor; `custom` = a Restricted per-instruction rule set. */
export type ProgramAccessKind = "allow" | "deny" | "custom";

export type ProgramPermissionView = {
  programId: string;
  kind: ProgramAccessKind;
  /** Raw decoded access, preserved verbatim on round-trip (esp. custom rules). */
  access: ProgramAccess;
};

export type WalletPolicyView = {
  /** True when a policy is present (any cap or program override configured). */
  hasPolicy: boolean;
  /** Unified SOL/WSOL cap, or null when unset. */
  solCap: SpendCapView | null;
  mintCaps: (SpendCapView & { mint: string })[];
  /** Per-program overrides of the fixed baseline. */
  programPermissions: ProgramPermissionView[];
};

function accessKind(access: ProgramAccess): ProgramAccessKind {
  switch (access.__kind) {
    case "AllInstructions":
      return "allow";
    case "Denied":
      return "deny";
    default:
      return "custom";
  }
}

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
        return {
          hasPolicy: false,
          solCap: null,
          mintCaps: [],
          programPermissions: [],
        };
      }

      const { solCap, mintCaps, programPermissions } = account.data;
      const solActive = solCap.cap !== 0n;
      const activeMintCaps = mintCaps
        .filter((m) => m.cap.cap !== 0n)
        .map((m) => ({
          mint: String(m.mint),
          cap: m.cap.cap,
          remaining: m.cap.remaining,
          lastReset: m.cap.lastReset,
          windowSeconds: m.cap.windowSeconds,
        }));
      const permissions = programPermissions.map((p) => ({
        programId: String(p.programId),
        kind: accessKind(p.access),
        access: p.access,
      }));

      return {
        hasPolicy:
          solActive || activeMintCaps.length > 0 || permissions.length > 0,
        solCap: solActive
          ? {
              cap: solCap.cap,
              remaining: solCap.remaining,
              lastReset: solCap.lastReset,
              windowSeconds: solCap.windowSeconds,
            }
          : null,
        mintCaps: activeMintCaps,
        programPermissions: permissions,
      };
    },
  });
}
