"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePasskeySetup } from "@/components/wallet/passkey-setup-sheet";
import type { OwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { base64ToBytes } from "@/lib/crypto/base64";
import { queryKeys } from "@/lib/queries";
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
 * Secure-signer backed owner wallet.
 * Challenges + ciphertext stay in the signer; parent only drives UX + session cache.
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
    (result: { publicKey: string; expiresAt: number }) => {
      queryClient.setQueryData(queryKeys.ownerSession.all(), {
        publicKey: result.publicKey,
        expiresAt: result.expiresAt,
      });
    },
    [queryClient],
  );

  const login = useCallback(async () => {
    try {
      const client = getSecureSignerClient();
      const choice = await promptSetup();
      if (choice.mode === "cancel") return;

      if (choice.mode === "create") {
        finishAuth(
          await client.authenticate({
            authMode: "create",
            credentialId: choice.credentialId,
            webauthnAttestationObject: choice.attestationObject,
          }),
        );
        return;
      }

      try {
        finishAuth(await client.authenticate({ authMode: "unlock" }));
      } catch (err) {
        if (isLoginCancelled(err)) return;
        if (
          !(err instanceof SecureSignerError) ||
          err.code !== "AUTHENTICATION_FAILED"
        ) {
          throw err;
        }
        const recovery = await promptLostPasskey();
        if (recovery.mode === "cancel") return;
        finishAuth(
          await client.authenticate({
            authMode: "create",
            credentialId: recovery.credentialId,
            webauthnAttestationObject: recovery.attestationObject,
          }),
        );
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
