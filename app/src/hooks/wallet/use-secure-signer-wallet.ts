"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePasskeySetup } from "@/components/wallet/passkey-setup-sheet";
import type { OwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import {
  backupOwnerWalletBlob,
  fetchOwnerWalletBlob,
  issueOwnerWalletPutChallenge,
} from "@/lib/wallet/owner-wallet-blob";
import {
  clearOwnerSession,
  issueOwnerSessionChallenge,
  mintOwnerSession,
} from "@/lib/wallet/owner-session";
import {
  getSecureSignerClient,
  SecureSignerError,
} from "@/lib/wallet/secure-signer-client";
import { createSecureSignerSigner } from "@/lib/wallet/secure-signer-signer";

/**
 * `OwnerWallet` backed by the secure-signer iframe (see `secure-signer/`).
 *
 * Create: passkey is registered on the **app** (shared RP ID). The signer iframe
 * only runs get+PRF and wraps the ed25519 seed — parent never sees key material.
 * Unlock / sign: iframe only.
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

/** Backup / session challenges are best-effort — never block the signer ceremony. */
async function issueChallengeSoft(
  issue: () => Promise<{ challengeId: string; challenge: string }>,
  timeoutMs = 2_500,
): Promise<{ challengeId: string; challenge: string } | null> {
  try {
    return await Promise.race([
      issue(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  }
}

type Session = { address: string | null; status: OwnerWallet["status"] };

export function useSecureSignerWallet(): OwnerWallet {
  const { promptSetup } = usePasskeySetup();
  const [session, setSession] = useState<Session>({
    address: null,
    status: "loading",
  });
  const { address, status } = session;

  const finishAuth = useCallback(
    async (
      result: {
        publicKey: string;
        encryptedWalletBlob: string;
        putSignature?: string;
        sessionSignature?: string;
      },
      putChallengeId?: string | null,
      sessionChallengeId?: string | null,
    ) => {
      writeLS(BLOB_KEY, result.encryptedWalletBlob);
      writeLS(PUBKEY_KEY, result.publicKey);
      setSession({ address: result.publicKey, status: "authenticated" });
      if (putChallengeId && result.putSignature) {
        void backupOwnerWalletBlob({
          encryptedWalletBlob: result.encryptedWalletBlob,
          publicKey: result.publicKey,
          challengeId: putChallengeId,
          signature: result.putSignature,
        }).catch(() => {});
      }
      if (sessionChallengeId && result.sessionSignature) {
        try {
          await mintOwnerSession({
            publicKey: result.publicKey,
            challengeId: sessionChallengeId,
            signature: result.sessionSignature,
          });
        } catch {
          /* cookie mint failed — home open will re-login */
        }
      }
    },
    [],
  );

  useEffect(() => {
    const pk = readLS(PUBKEY_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession({
      address: pk,
      status: pk ? "authenticated" : "unauthenticated",
    });
    try {
      getSecureSignerClient().preload();
    } catch {
      /* ignore */
    }
  }, []);

  const login = useCallback(async () => {
    const client = getSecureSignerClient();
    const existing = readLS(BLOB_KEY);

    const unlock = async (blob: string | null) => {
      // Short wait only — never stall the unlock sheet on a slow API.
      const [putChallenge, sessionChallenge] = await Promise.all([
        issueChallengeSoft(() => issueOwnerWalletPutChallenge(), 400),
        issueChallengeSoft(() => issueOwnerSessionChallenge(), 400),
      ]);
      const result = await client.authenticate(blob, {
        authMode: "unlock",
        ...(putChallenge?.challenge
          ? { putChallenge: putChallenge.challenge }
          : {}),
        ...(sessionChallenge?.challenge
          ? { sessionChallenge: sessionChallenge.challenge }
          : {}),
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
      await finishAuth(
        result,
        putChallenge?.challengeId,
        sessionChallenge?.challengeId,
      );
    };

    if (existing) {
      await unlock(existing);
      return;
    }

    const choice = await promptSetup();
    if (choice.mode === "cancel") {
      throw new SecureSignerError("USER_CANCELLED");
    }
    if (choice.mode === "unlock") {
      await unlock(null);
      return;
    }

    // Create: passkey was already registered in the setup sheet click handler
    // (user gesture). Open the signer for get+PRF — that ceremony has its own tap.
    const [putChallenge, sessionChallenge] = await Promise.all([
      issueChallengeSoft(() => issueOwnerWalletPutChallenge()),
      issueChallengeSoft(() => issueOwnerSessionChallenge()),
    ]);
    const result = await client.authenticate(null, {
      authMode: "create",
      credentialId: choice.credentialId,
      ...(putChallenge?.challenge
        ? { putChallenge: putChallenge.challenge }
        : {}),
      ...(sessionChallenge?.challenge
        ? { sessionChallenge: sessionChallenge.challenge }
        : {}),
    });
    await finishAuth(
      result,
      putChallenge?.challengeId,
      sessionChallenge?.challengeId,
    );
  }, [finishAuth, promptSetup]);

  const logout = useCallback(async () => {
    writeLS(PUBKEY_KEY, null);
    setSession({ address: null, status: "unauthenticated" });
    void clearOwnerSession().catch(() => {});
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

  const loginWrapped = useCallback(async () => {
    try {
      await login();
    } catch (err) {
      if (err instanceof SecureSignerError && err.code === "USER_CANCELLED") {
        return;
      }
      // OS passkey create/get dismissed — not an app failure.
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "AbortError")
      ) {
        return;
      }
      if (
        err instanceof Error &&
        /passkey creation was cancelled/i.test(err.message)
      ) {
        return;
      }
      throw err;
    }
  }, [login]);

  return {
    address,
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    login: loginWrapped,
    logout,
    exportWallet,
    signer,
  };
}
