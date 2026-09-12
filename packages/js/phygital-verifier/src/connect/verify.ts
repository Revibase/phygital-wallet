/**
 * `verifyConnectProof` — the portable WebAuthn connect check a verifier runs on
 * `POST /connect`. This is the whole of what a third-party verifier needs.
 *
 * The accessory signs a recent **blockhash**, so the submitted blockhash *is* the
 * expected challenge. Freshness is an injected `isBlockhashValid` check (the last
 * ~300 blockhashes, ~2 minutes), so a client cannot mint its own challenge. It is
 * injected — not an RPC this function owns — so the caller can run it wherever it
 * scales best (e.g. a stateless worker tier, in parallel with other work) rather
 * than inside a per-token actor. The token PDA is always derived from the
 * verified response, never trusted from the request.
 *
 * A blockhash — not a SlotHashes entry — because this proof is checked by the
 * verifier's off-chain connect endpoint.
 * The on-chain `execute` challenge still binds a slot hash; that is a separate
 * proof with a separate purpose.
 *
 * Freshness and replay are two different jobs, and both are needed:
 * `isBlockhashValid` bounds how old a proof may be, while the assertion's
 * `signCount` makes each proof single-use *within* that window.
 *
 * The dynamic-URL tap is deliberately NOT handled here — see
 * `verifyDynamicConnectProof`.
 */
import {
  findPhygitalTokenPda,
  verifyResponse,
  type VerifyResponseOptions,
} from "phygital-token-sdk";
import type { Address } from "@solana/kit";

import { ConnectProofError } from "./proof-error.js";
import { extractSignCount } from "./sign-count.js";

/**
 * Advance this verifier's per-accessory WebAuthn signature counter.
 * Return `true` when `signCount` is strictly newer than what is stored (and the
 * store has been advanced), `false` to reject as a replay.
 *
 * Stateful, so the verifier supplies it — and it must be the accessory's
 * *WebAuthn* counter, kept separately from the dynamic tap's chip counter.
 */
export type ConsumeSignCount = (args: {
  /** Compressed secp256r1 key identifying the accessory. */
  identifier: string;
  signCount: number;
  phygitalToken: Address;
}) => Promise<boolean> | boolean;

/**
 * Is this blockhash still recent enough to accept? Injected so the caller runs
 * the check (typically `rpc.isBlockhashValid`) where it scales best. Stateless,
 * so it can run in parallel with other connect work.
 */
export type IsBlockhashValid = (
  blockhash: string,
) => Promise<boolean> | boolean;

export type WebAuthnConnectProof = {
  /** Recent blockhash (base58) — also the signed WebAuthn challenge. */
  blockhash: string;
  /** The WebAuthn/NFC assertion from the accessory. */
  response: VerifyResponseOptions["response"];
};

/**
 * Verify a WebAuthn-over-blockhash connect proof.
 * Throws {@link ConnectProofError} on any failure; returns the derived token.
 */
export async function verifyConnectProof(
  proof: WebAuthnConnectProof,
  opts: {
    isBlockhashValid: IsBlockhashValid;
    consumeSignCount: ConsumeSignCount;
  },
): Promise<{
  phygitalToken: Address;
  secp256r1PublicKey: string;
  signCount: number;
}> {
  const blockhash = proof?.blockhash?.trim();
  if (!blockhash || !proof?.response) {
    throw new ConnectProofError(
      "invalid_proof",
      "blockhash and response are required",
    );
  }

  // Possession: the accessory signed exactly this blockhash. Pure, so it runs
  // before the network check — a forged proof costs no RPC.
  let verified: ReturnType<typeof verifyResponse>;
  try {
    verified = verifyResponse({
      expectedMessage: blockhash,
      response: proof.response,
    });
  } catch (err) {
    throw new ConnectProofError(
      "passkey_invalid",
      err instanceof Error ? err.message : "Passkey verification failed",
    );
  }
  if (!verified.isVerified || !verified.secp256r1PublicKey) {
    throw new ConnectProofError(
      "passkey_invalid",
      "Couldn’t verify this accessory",
    );
  }

  // The counter rides inside the signed authenticatorData, so it is only
  // trustworthy once the signature above has verified.
  const signCount = extractSignCount(proof.response.response.authenticatorData);
  if (signCount === null) {
    throw new ConnectProofError(
      "invalid_proof",
      "Assertion is missing a signature counter",
    );
  }

  // Freshness: delegated to the caller's check.
  if (!(await opts.isBlockhashValid(blockhash))) {
    throw new ConnectProofError(
      "stale_blockhash",
      "This check expired — tap again",
    );
  }

  const phygitalToken = await findPhygitalTokenPda(verified.secp256r1PublicKey);

  // Single use: a replayed proof carries a counter we have already accepted.
  const fresher = await opts.consumeSignCount({
    identifier: verified.secp256r1PublicKey,
    signCount,
    phygitalToken,
  });
  if (!fresher) {
    throw new ConnectProofError(
      "assertion_replay",
      "This check was already used — tap again",
    );
  }

  return {
    phygitalToken,
    secp256r1PublicKey: verified.secp256r1PublicKey,
    signCount,
  };
}
