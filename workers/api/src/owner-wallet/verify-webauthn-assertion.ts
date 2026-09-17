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

/** Mirror app `resolveWebAuthnRpId` — env override, else hostname heuristics. */
export function resolveWebAuthnRpId(
  hostname: string,
  envRpId?: string,
): string {
  const fromEnv = envRpId?.trim();
  if (fromEnv) return fromEnv;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost";
  if (hostname === "revibase.com" || hostname.endsWith(".revibase.com")) {
    return "revibase.com";
  }
  return hostname;
}

/**
 * Extract COSE credential public key from a registration attestationObject
 * (base64url). Prefer this on first PUT so the server stores what SimpleWebAuthn
 * expects for `credential.publicKey`.
 */
export function extractCosePublicKeyFromAttestationObject(
  attestationObjectB64url: string,
): Uint8Array {
  const bytes = isoBase64URL.toBuffer(attestationObjectB64url);
  const decoded = decodeAttestationObject(bytes);
  const authData = parseAuthenticatorData(decoded.get("authData"));
  if (!authData.credentialPublicKey) {
    throw new Error("attestationObject missing credentialPublicKey");
  }
  return authData.credentialPublicKey;
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
  envRpId?: string;
  /** COSE public key bytes (from D1 webauthn_public_key). */
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

  const expectedRPID = resolveWebAuthnRpId(hostname, opts.envRpId);

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
        // Not used for replay (fresh challenge + TTL). Kept at 0 so the library
        // only rejects if an authenticator reports a non-increasing counter
        // against a prior stored value — we never store one.
        counter: 0,
        transports: undefined,
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
