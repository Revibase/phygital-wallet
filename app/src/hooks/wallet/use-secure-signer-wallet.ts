"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { OwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import {
  backupOwnerWalletBlob,
  fetchOwnerWalletBlob,
  issueOwnerWalletPutChallenge,
} from "@/lib/wallet/owner-wallet-blob";
import { getSecureSignerClient } from "@/lib/wallet/secure-signer-client";
import { createSecureSignerSigner } from "@/lib/wallet/secure-signer-signer";

/**
 * `OwnerWallet` backed by the secure-signer iframe (see `secure-signer/`).
 *
 * There is no persistent server session (per-op WebAuthn by design), so the
 * "session" is simply: we hold the encrypted blob (portable ciphertext) and the
 * verified public key. The blob is cached in localStorage and backed up to D1
 * after auth (PUT requires an ed25519 proof signed inside the signer).
 */
const BLOB_KEY = "revibase.owner.blob";
const PUBKEY_KEY = "revibase.owner.pubkey";

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage — non-fatal */
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function requireBlob(): string {
  const blob = readLS(BLOB_KEY);
  if (!blob)
    throw new Error("No wallet on this device — create or restore one first");
  return blob;
}

type Session = { address: string | null; status: OwnerWallet["status"] };

export function useSecureSignerWallet(): OwnerWallet {
  // Start "loading" on the server and first client render to avoid a hydration
  // mismatch, then resolve from localStorage after mount (external-system sync).
  const [session, setSession] = useState<Session>({
    address: null,
    status: "loading",
  });
  const { address, status } = session;

  useEffect(() => {
    const pk = readLS(PUBKEY_KEY);
    // SSR-safe: hydrate this session from device storage only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession({
      address: pk,
      status: pk ? "authenticated" : "unauthenticated",
    });
    // Warm the signer iframe so Sign in is not cold.
    try {
      getSecureSignerClient().preload();
    } catch {
      /* ignore */
    }
  }, []);

  const login = useCallback(async () => {
    const client = getSecureSignerClient();
    const existing = readLS(BLOB_KEY);

    let putChallenge: { challengeId: string; challenge: string } | null = null;
    try {
      putChallenge = await issueOwnerWalletPutChallenge();
    } catch {
      /* backup is best-effort — auth still proceeds */
    }

    const result = await client.authenticate(existing, {
      putChallenge: putChallenge?.challenge,
      resolveBlob: async (credentialId) => {
        const local = readLS(BLOB_KEY);
        if (local) return local;
        try {
          return await fetchOwnerWalletBlob(credentialId);
        } catch {
          return null;
        }
      },
    });
    writeLS(BLOB_KEY, result.encryptedWalletBlob);
    writeLS(PUBKEY_KEY, result.publicKey);
    setSession({ address: result.publicKey, status: "authenticated" });

    if (putChallenge && result.putSignature) {
      void backupOwnerWalletBlob({
        encryptedWalletBlob: result.encryptedWalletBlob,
        publicKey: result.publicKey,
        challengeId: putChallenge.challengeId,
        signature: result.putSignature,
      }).catch(() => {});
    }
  }, []);

  const logout = useCallback(async () => {
    // Clear the session (cached pubkey) but KEEP the blob — it is the wallet.
    writeLS(PUBKEY_KEY, null);
    setSession({ address: null, status: "unauthenticated" });
  }, []);

  const signer = useMemo(
    () =>
      address
        ? createSecureSignerSigner({
            address: address,
            signRaw: async (tx) => {
              const { signature } =
                await getSecureSignerClient().signTransaction(
                  requireBlob(),
                  tx,
                );
              return base64ToBytes(signature);
            },
          })
        : null,
    [address],
  );

  const exportWallet = useCallback(async () => {
    await getSecureSignerClient().exportPrivateKey(requireBlob());
  }, []);

  return {
    address,
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    login,
    logout,
    exportWallet,
    signer,
  };
}
