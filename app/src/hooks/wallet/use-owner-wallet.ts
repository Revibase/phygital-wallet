"use client";

import { useSecureSignerWallet } from "@/hooks/wallet/use-secure-signer-wallet";
import { TransactionPartialSigner, TransactionSigner } from "@solana/kit";

/**
 * App-facing owner-wallet seam. All app code goes through this hook, never a
 * concrete backend, so the backend stays swappable behind one interface.
 *
 * The "owner" is the identity that claims an accessory (on-chain `set_authority`)
 * and gates owner-only routes. It is backed by the self-hosted secure-signer
 * iframe (see `secure-signer/`), which holds the owner ed25519 key non-custodially.
 */
export type OwnerWallet = {
  /** Base58 Solana address of the wallet, or null when signed out. */
  address: string | null;
  signer: TransactionPartialSigner | null;
  status: "loading" | "unauthenticated" | "authenticated";
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Sign in (WaaS modal, or create/restore in the secure signer). */
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** Reveal / export this wallet's private key (in a controlled ceremony). */
  exportWallet: () => Promise<void>;
};

export function useOwnerWallet(): OwnerWallet {
  return useSecureSignerWallet();
}
