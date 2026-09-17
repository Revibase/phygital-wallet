/**
 * Verify a WebAuthn authentication assertion against a stored COSE public key.
 *
 * One ceremony unlocks PRF (in the signer) and authorizes blob fetch here —
 * the fetch challenge bytes are the WebAuthn challenge. Replay protection is
 * the short-TTL single-use challenge (no signature counter).
 *
 * RP ID heuristics mirror app `resolveWebAuthnRpId` / signer `resolveRpId`.
 */
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  decodeAttestationObject,
  isoBase64URL,
  parseAuthenticatorData,
} from "@simplewebauthn/server/helpers";

import { isAppBrowserOrigin } from "@/shared/cors";

/** Mirror app `resolveWebAuthnRpId` — hostname heuristics for RP ID. */
export function resolveWebAuthnRpId(hostname: string): string {
  if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost";
  if (hostname === "revibase.com" || hostname.endsWith(".revibase.com")) {
    return "revibase.com";
  }
  return hostname;
}

export type AttestationCredential = {
  /** COSE credential public key (SimpleWebAuthn `credential.publicKey`). */
  publicKey: Uint8Array;
  /** Raw credential ID from attestedCredentialData — must match blob header. */
  credentialId: Uint8Array;
};

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as BufferSource),
  );
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Extract COSE public key + credential ID from a registration attestationObject
 * (base64url). PUT binds `credentialId` to the wallet blob header so a seed
 * holder cannot poison restore with a mismatched passkey.
 *
 * Also checks authData rpIdHash against the expected RP ID and requires UP+AT.
 * fmt:none attestations are still forgeable by a seed holder; this blocks
 * careless / mismatched RP forgeries.
 */
export async function extractCredentialFromAttestationObject(
  attestationObjectB64url: string,
  expectedRpId: string,
): Promise<AttestationCredential> {
  const bytes = isoBase64URL.toBuffer(attestationObjectB64url);
  const decoded = decodeAttestationObject(bytes);
  const authData = parseAuthenticatorData(decoded.get("authData"));
  if (!authData.credentialPublicKey) {
    throw new Error("attestationObject missing credentialPublicKey");
  }
  if (!authData.credentialID || authData.credentialID.length === 0) {
    throw new Error("attestationObject missing credentialID");
  }
  const expectedHash = await sha256(new TextEncoder().encode(expectedRpId));
  if (!bytesEqual(authData.rpIdHash, expectedHash)) {
    throw new Error("attestationObject rpIdHash mismatch");
  }
  if (!authData.flags.up || !authData.flags.at) {
    throw new Error("attestationObject missing UP or AT flags");
  }
  return {
    publicKey: authData.credentialPublicKey,
    credentialId: authData.credentialID,
  };
}

export type VerifyAssertionResult =
  | { ok: true }
  | { ok: false; error: string; code: string; status: number };

/**
 * Verify AuthenticationResponseJSON against the stored COSE key.
 * Origin must be an app browser origin; RP ID from env or hostname.
 * Counter is not tracked — challenge TTL is the replay control.
 */
export async function verifyOwnerWalletAssertion(opts: {
  assertion: AuthenticationResponseJSON;
  expectedChallenge: string;
  origin: string;
  storedPublicKeyBytes: Uint8Array;
}): Promise<VerifyAssertionResult> {
  if (!opts.origin || !isAppBrowserOrigin(opts.origin)) {
    return {
      ok: false,
      error: "App origin required",
      code: "origin_required",
      status: 403,
    };
  }

  let hostname: string;
  try {
    hostname = new URL(opts.origin).hostname;
  } catch {
    return {
      ok: false,
      error: "App origin required",
      code: "origin_required",
      status: 403,
    };
  }

  const expectedRPID = resolveWebAuthnRpId(hostname);

  try {
    const verification = await verifyAuthenticationResponse({
      response: opts.assertion,
      expectedChallenge: opts.expectedChallenge,
      expectedOrigin: opts.origin,
      expectedRPID,
      credential: {
        id: opts.assertion.id,
        publicKey: new Uint8Array(
          opts.storedPublicKeyBytes,
        ) as Uint8Array<ArrayBuffer>,
        counter: 0,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return {
        ok: false,
        error: "WebAuthn assertion verification failed",
        code: "webauthn_invalid",
        status: 401,
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "WebAuthn assertion verification failed",
      code: "webauthn_invalid",
      status: 401,
    };
  }
}
