"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePasskeySetup } from "@/components/wallet/passkey-setup-sheet";
import type { OwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { base64ToBytes } from "@/lib/crypto/base64";
import { queryKeys } from "@/lib/queries";
import {
  backupOwnerWalletBlob,
  fetchOwnerWalletBlob,
  issueOwnerWalletPutChallenge,
} from "@/lib/wallet/owner-wallet-blob";
import {
  clearOwnerSession,
  fetchOwnerSession,
} from "@/lib/wallet/owner-session";
import {
  getSecureSignerClient,
  SecureSignerError,
} from "@/lib/wallet/secure-signer-client";
import { createSecureSignerSigner } from "@/lib/wallet/secure-signer-signer";

/**
 * `OwnerWallet` backed by the secure-signer iframe (see `secure-signer/`).
 *
 * Login: httpOnly `revibase_owner_session` via GET /owner-session.
 * Signing ciphertext lives only in the signer's origin localStorage; D1 is the
 * durable backup used during AUTH restore (`BLOB_NEEDED`).
 */

function isLoginCancelled(err: unknown): boolean {
  if (err instanceof SecureSignerError && err.code === "USER_CANCELLED") {
    return true;
  }
  if (
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "AbortError")
  ) {
    return true;
  }
  return (
    err instanceof Error && /passkey creation was cancelled/i.test(err.message)
  );
}

export function useSecureSignerWallet(): OwnerWallet {
  const { promptSetup, promptLostPasskey } = usePasskeySetup();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: queryKeys.ownerSession.all(),
    queryFn: fetchOwnerSession,
    staleTime: 30_000,
  });

  const publicKey = sessionQuery.data?.publicKey ?? null;
  const status: OwnerWallet["status"] = sessionQuery.isPending
    ? "loading"
    : publicKey
      ? "authenticated"
      : "unauthenticated";

  useEffect(() => {
    try {
      getSecureSignerClient().preload();
    } catch {
      /* ignore */
    }
  }, []);

  const finishAuth = useCallback(
    async (result: {
      publicKey: string;
      encryptedWalletBlob: string;
      putSignature: string;
      challengeId: string;
    }) => {
      const { expiresAt } = await backupOwnerWalletBlob({
        encryptedWalletBlob: result.encryptedWalletBlob,
        publicKey: result.publicKey,
        challengeId: result.challengeId,
        signature: result.putSignature,
      });
      queryClient.setQueryData(queryKeys.ownerSession.all(), {
        publicKey: result.publicKey,
        expiresAt,
      });
    },
    [queryClient],
  );

  const login = useCallback(async () => {
    try {
      const client = getSecureSignerClient();
      const putChallengePromise = issueOwnerWalletPutChallenge();

      // Returning device: signer-origin localStorage already has ciphertext.
      let hasLocal = false;
      try {
        hasLocal = (await client.probeLocal()) !== null;
      } catch {
        /* iframe not ready — fall through to setup sheet */
      }

      if (!hasLocal) {
        const choice = await promptSetup();
        if (choice.mode === "cancel") return;
        const putChallenge = await putChallengePromise;
        if (choice.mode === "create") {
          const result = await client.authenticate({
            authMode: "create",
            credentialId: choice.credentialId,
            putChallenge: putChallenge.challenge,
          });
          await finishAuth({
            ...result,
            challengeId: putChallenge.challengeId,
          });
          return;
        }
      }

      const putChallenge = await putChallengePromise;
      try {
        const result = await client.authenticate({
          authMode: "unlock",
          putChallenge: putChallenge.challenge,
          resolveBlob: (credentialId) => fetchOwnerWalletBlob(credentialId),
        });
        await finishAuth({ ...result, challengeId: putChallenge.challengeId });
      } catch (err) {
        if (isLoginCancelled(err)) return;
        // Unlock failed after WebAuthn (e.g. passkey deleted) — offer create.
        if (
          !(err instanceof SecureSignerError) ||
          err.code !== "AUTHENTICATION_FAILED"
        ) {
          throw err;
        }
        const recovery = await promptLostPasskey();
        if (recovery.mode === "cancel") return;
        const createChallenge = await issueOwnerWalletPutChallenge();
        const result = await client.authenticate({
          authMode: "create",
          credentialId: recovery.credentialId,
          putChallenge: createChallenge.challenge,
        });
        await finishAuth({
          ...result,
          challengeId: createChallenge.challengeId,
        });
      }
    } catch (err) {
      if (isLoginCancelled(err)) return;
      throw err;
    }
  }, [finishAuth, promptLostPasskey, promptSetup]);

  const logout = useCallback(async () => {
    await clearOwnerSession();
    await queryClient.invalidateQueries({
      queryKey: queryKeys.ownerSession.all(),
    });
  }, [queryClient]);

  const signer = useMemo(
    () =>
      publicKey
        ? createSecureSignerSigner({
            address: publicKey,
            signRaw: async (tx) => {
              const { signature } =
                await getSecureSignerClient().signTransaction(tx);
              return base64ToBytes(signature);
            },
          })
        : null,
    [publicKey],
  );

  const exportWallet = useCallback(async () => {
    await getSecureSignerClient().exportPrivateKey();
  }, []);

  return {
    address: publicKey,
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    login,
    logout,
    exportWallet,
    signer,
  };
}
