"use client";

import { useCallback, useState } from "react";

import { authenticateToken } from "@/lib/token/authenticate";

/**
 * Hold to Check — live WebAuthn against a Solana slot-hash challenge.
 */
export function useAuthenticateToken() {
  const [pending, setPending] = useState(false);

  const authenticate = useCallback(
    async (args?: {
      expectedPublicKey?: string;
      onPasskeyComplete?: () => void;
    }) => {
      setPending(true);
      try {
        return await authenticateToken({
          expectedPublicKey: args?.expectedPublicKey,
          onPasskeyComplete: () => {
            try {
              navigator.vibrate?.(30);
            } catch {
              /* ignore */
            }
            args?.onPasskeyComplete?.();
          },
        });
      } finally {
        setPending(false);
      }
    },
    []
  );

  return { authenticate, pending };
}
