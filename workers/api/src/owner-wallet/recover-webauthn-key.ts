/**
 * Recover WebAuthn ES256 COSE public key candidate(s) from an assertion,
 * then select the real key with a second assertion over a fresh challenge.
 *
 * WebAuthn DER signatures carry no recovery id, so ECDSA recovery yields up to
 * two keys that both verify the *same* assertion. A new challenge filters to
 * the authenticator's real key before D1 persistence.
 */
import { p256 } from "@noble/curves/nist.js";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

import { base64UrlToBytes } from "@/owner-wallet/blob-format";
import { verifyOwnerWalletAssertion } from "@/owner-wallet/verify-webauthn-assertion";

const MAX_ASSERTION_FIELD = 8_192;

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as BufferSource),
  );
}

/** Parse ASN.1 DER ECDSA signature → raw 64-byte r||s. */
export function derEcdsaToCompact(der: Uint8Array): Uint8Array {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("not a DER sequence");
  let seqLen = der[i++]!;
  if (seqLen & 0x80) {
    const n = seqLen & 0x7f;
    seqLen = 0;
    for (let j = 0; j < n; j++) seqLen = (seqLen << 8) | der[i++]!;
  }
  if (i + seqLen > der.length) throw new Error("truncated DER sequence");

  const readInt = (): Uint8Array => {
    if (der[i++] !== 0x02) throw new Error("expected INTEGER");
    const len = der[i++]!;
    if (len < 1 || i + len > der.length) throw new Error("bad INTEGER length");
    let v = der.subarray(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    if (v.length > 32) throw new Error("INTEGER too large");
    if (v.length === 32) return v;
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };

  const r = readInt();
  const s = readInt();
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

function encodeCoseEs256(uncompressed: Uint8Array): Uint8Array {
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error("expected uncompressed P-256 point");
  }
  const cose = new Map<number, number | Uint8Array>();
  cose.set(1, 2); // kty: EC2
  cose.set(3, -7); // alg: ES256
  cose.set(-1, 1); // crv: P-256
  cose.set(-2, uncompressed.subarray(1, 33));
  cose.set(-3, uncompressed.subarray(33, 65));
  return isoCBOR.encode(cose);
}

/**
 * Recover COSE key candidate(s) from a WebAuthn assertion (usually two).
 */
export async function recoverCosePublicKeysFromAssertion(
  assertion: AuthenticationResponseJSON,
): Promise<Uint8Array[]> {
  const authData = base64UrlToBytes(
    assertion.response.authenticatorData,
    MAX_ASSERTION_FIELD,
  );
  const clientDataJSON = base64UrlToBytes(
    assertion.response.clientDataJSON,
    MAX_ASSERTION_FIELD,
  );
  const sigDer = base64UrlToBytes(
    assertion.response.signature,
    MAX_ASSERTION_FIELD,
  );

  const clientHash = await sha256(clientDataJSON);
  const signed = new Uint8Array(authData.length + clientHash.length);
  signed.set(authData, 0);
  signed.set(clientHash, authData.length);
  const msgHash = await sha256(signed);

  const compact = derEcdsaToCompact(sigDer);
  const sigObj = p256.Signature.fromBytes(compact);

  const keys: Uint8Array[] = [];
  for (let recovery = 0; recovery < 2; recovery++) {
    try {
      const pub = sigObj
        .addRecoveryBit(recovery)
        .recoverPublicKey(msgHash)
        .toBytes(false);
      keys.push(encodeCoseEs256(pub));
    } catch {
      /* invalid recovery id for this (r,s) */
    }
  }
  if (keys.length === 0) throw new Error("ec_recover_failed");
  return keys;
}

/**
 * Recover candidates from `unlockAssertion`, then keep the key that verifies
 * `confirmAssertion` over `expectedConfirmChallenge`.
 */
export async function selectWebauthnPublicKeyB64url(opts: {
  unlockAssertion: AuthenticationResponseJSON;
  confirmAssertion: AuthenticationResponseJSON;
  expectedConfirmChallenge: string;
  origin: string;
}): Promise<string> {
  const candidates = await recoverCosePublicKeysFromAssertion(
    opts.unlockAssertion,
  );
  const winners: Uint8Array[] = [];
  for (const key of candidates) {
    const verified = await verifyOwnerWalletAssertion({
      assertion: opts.confirmAssertion,
      expectedChallenge: opts.expectedConfirmChallenge,
      origin: opts.origin,
      storedPublicKeyBytes: key,
    });
    if (verified.ok) winners.push(key);
  }
  if (winners.length !== 1) {
    throw new Error("ec_recover_confirm_failed");
  }
  return isoBase64URL.fromBuffer(new Uint8Array(winners[0]!));
}

/** Parse a stored `webauthn_public_key` into one or more COSE byte strings. */
export function parseStoredWebauthnPublicKeys(stored: string): Uint8Array[] {
  const trimmed = stored.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error("invalid_webauthn_key_list");
    }
    return arr.map((item) => {
      if (typeof item !== "string" || !item) {
        throw new Error("invalid_webauthn_key_list");
      }
      return base64UrlToBytes(item, 1024);
    });
  }
  return [base64UrlToBytes(trimmed, 1024)];
}
