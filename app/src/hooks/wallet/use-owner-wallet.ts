"use client";

import { useHeliusWallet } from "helius-wallet-kit";

/**
 * App-facing owner-wallet seam over Helius WaaS (`helius-wallet-kit`).
 *
 * The "owner" is the signed-in Helius embedded wallet — the identity that
 * claims an accessory (on-chain `set_authority`) and gates owner-only routes.
 * All app code goes through this hook, never `useHeliusWallet` directly, so the
 * WaaS provider stays swappable behind one interface.
 */
export type OwnerWallet = {
  /** Base58 Solana address of the embedded wallet, or null when signed out. */
  address: string | null;
  status: "loading" | "unauthenticated" | "authenticated";
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Open the WaaS auth modal (passkey / email / wallet, per dashboard config). */
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Sign a serialized transaction as this wallet (no send). Used to co-sign
   * owner/authority instructions (e.g. `clear_authority`) that the paymaster
   * fee-pays. See `createHeliusSigner`.
   */
  signTransaction: (transaction: Uint8Array) => Promise<Uint8Array>;
};

export function useOwnerWallet(): OwnerWallet {
  const wallet = useHeliusWallet();
  return {
    address: wallet.address,
    status: wallet.status,
    isAuthenticated: wallet.status === "authenticated",
    isLoading: wallet.status === "loading",
    login: wallet.login,
    logout: wallet.logout,
    signTransaction: async (transaction) =>
      new Uint8Array(await wallet.signTransaction(transaction)),
  };
}
