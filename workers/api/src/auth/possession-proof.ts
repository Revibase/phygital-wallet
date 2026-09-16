/**
 * Shared ed25519 possession proof over a consumed server challenge.
 */
import { ed25519 } from "@noble/curves/ed25519.js";

import { base64UrlToBytes } from "@/shared/crypto/base64";

export type PossessionProofFailure = {
  ok: false;
  status: 400 | 403 | 409;
  error: string;
  code: "challenge_invalid" | "invalid_proof";
};

export type PossessionProofSuccess = { ok: true };

/**
 * Consume a single-use challenge and verify ed25519(sig, message(challenge), pubkey).
 * Caller supplies domain-separated `buildMessage` and already-decoded pubkey bytes.
 */
export async function verifyConsumedChallengeProof(args: {
  challengeId: string;
  signatureB64: string;
  publicKeyBytes: Uint8Array;
  consume: (challengeId: string) => Promise<string | null>;
  buildMessage: (challengeBytes: Uint8Array) => Uint8Array;
  expiredError?: string;
}): Promise<PossessionProofSuccess | PossessionProofFailure> {
  const expectedChallenge = await args.consume(args.challengeId);
  if (!expectedChallenge) {
    return {
      ok: false,
      status: 409,
      error: args.expiredError ?? "This request expired. Try again.",
      code: "challenge_invalid",
    };
  }

  let challengeBytes: Uint8Array;
  let signature: Uint8Array;
  try {
    challengeBytes = base64UrlToBytes(expectedChallenge);
    signature = base64UrlToBytes(args.signatureB64);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid proof",
      code: "invalid_proof",
    };
  }

  if (signature.length !== 64 || args.publicKeyBytes.length !== 32) {
    return {
      ok: false,
      status: 400,
      error: "Invalid signature",
      code: "invalid_proof",
    };
  }

  const message = args.buildMessage(challengeBytes);
  let ok = false;
  try {
    ok = ed25519.verify(signature, message, args.publicKeyBytes);
  } catch {
    ok = false;
  }
  if (!ok) {
    return {
      ok: false,
      status: 403,
      error: "Wallet proof failed",
      code: "invalid_proof",
    };
  }
  return { ok: true };
}
