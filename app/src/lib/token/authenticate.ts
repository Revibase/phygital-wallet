import { startAuthentication, verifyResponse } from "phygital-token-sdk";

import { getSolanaRpc } from "@/lib/solana/rpc";
import { bindVerifiedPasskey } from "@/lib/token/bind-passkey";

/**
 * Live NFC check in the browser: random challenge → `startAuthentication` →
 * `verifyResponse`. Pass `expectedPublicKey` after a signed URL so the live tap
 * must be this chip.
 *
 * This is intentionally local-only. Session-bearing connections use the SDK's
 * `startPhygitalConnect` + `exchangeConnectProof`, which own the blockhash
 * challenge and the verifier proof exchange.
 */
export async function authenticateToken(args?: {
  expectedPublicKey?: string;
  onPasskeyComplete?: () => void;
}): Promise<{
  /** The signed local challenge. */
  challenge: string;
  secp256r1PublicKey: string;
  response: Awaited<ReturnType<typeof startAuthentication>>;
}> {
  const rpc = getSolanaRpc();
  const challenge = crypto.randomUUID();

  const response = await startAuthentication(challenge, rpc);

  const secp256r1PublicKey = bindVerifiedPasskey(
    verifyResponse({ expectedMessage: challenge, response }),
    args?.expectedPublicKey,
  );

  // Only signal success after crypto verify — not right after the OS prompt.
  args?.onPasskeyComplete?.();

  return { challenge, secp256r1PublicKey, response };
}
