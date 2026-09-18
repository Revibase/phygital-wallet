"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { TransactionPartialSigner } from "@solana/kit";

import { useSecureSignerWallet } from "@/hooks/wallet/use-secure-signer-wallet";

/**
 * App-facing owner-wallet seam. All app code goes through this hook, never a
 * concrete backend, so the backend stays swappable behind one interface.
 *
 * The "owner" is the identity that claims an accessory (on-chain `set_authority`)
 * and gates owner-only routes. It is backed by the self-hosted secure-signer
 * iframe (see `secure-signer/`), which holds the owner ed25519 key non-custodially.
 * Passkeys are registered on the app (shared RP ID); PRF + key wrap stay in the signer.
 */
export type OwnerWallet = {
  address: string | null;
  signer: TransactionPartialSigner | null;
  status: "loading" | "unauthenticated" | "authenticated";
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** Reveal / export this wallet's private key (in a controlled ceremony). */
  exportWallet: () => Promise<void>;
};

const OwnerWalletContext = createContext<OwnerWallet | null>(null);

/**
 * Single shared owner-wallet session for the whole app.
 *
 * Every consumer must see the same auth state — otherwise signing in on the
 * token gate never flips `useTokenOwner().isSignedIn`, and the claim CTA never
 * appears after passkey create.
 */
export function OwnerWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useSecureSignerWallet();
  return (
    <OwnerWalletContext.Provider value={wallet}>
      {children}
    </OwnerWalletContext.Provider>
  );
}

export function useOwnerWallet(): OwnerWallet {
  const ctx = useContext(OwnerWalletContext);
  if (!ctx) {
    throw new Error("useOwnerWallet requires OwnerWalletProvider");
  }
  return ctx;
}
