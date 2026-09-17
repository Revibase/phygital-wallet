/**
 * Register an owner passkey on the **app** origin (top-level).
 *
 * Uses the shared RP ID (`revibase.com` / `localhost`) so the signer iframe can
 * later `get()` + PRF. This module must NEVER use PRF output or derive keys —
 * parent XSS must not see wrapping material (secure-signer threat model).
 *
 * Returns attestationObject so the API can extract+store the COSE public key
 * for gated blob restore (same ceremony unlocks PRF + authorizes fetch).
 */

import { bytesToBase64Url } from "@/lib/crypto/base64";
import { resolveWebAuthnRpId } from "@/lib/wallet/webauthn-rp-id";

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

const buf = (b: Uint8Array): BufferSource => b as unknown as BufferSource;

export function webauthnRpId(): string {
  const host =
    typeof window !== "undefined" ? window.location.hostname : "localhost";
  return resolveWebAuthnRpId(
    host,
    process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID,
  );
}

/**
 * Create a discoverable passkey. Returns credential id + attestationObject
 * (base64url). Any PRF extension output is discarded immediately.
 *
 * Must be called from a user gesture (button click) — never from an effect,
 * timeout, or after an unrelated await that consumes activation.
 */
export async function registerOwnerPasskey(userName: string): Promise<{
  credentialId: string;
  attestationObject: string;
}> {
  const rpId = webauthnRpId();
  const userId = randomBytes(16);
  const challenge = randomBytes(32);

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: buf(challenge),
      rp: { id: rpId, name: "Revibase" },
      user: {
        id: buf(userId),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 120_000,
      // Enable PRF on the credential for the signer; do not read results here.
      extensions: {
        prf: {},
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Passkey creation was cancelled");

  // Scrub any create-time PRF the platform may have returned (never use in app).
  try {
    const ext = cred.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    };
    const first = ext.prf?.results?.first;
    if (first) new Uint8Array(first).fill(0);
  } catch {
    /* ignore */
  }

  const attestation = cred.response as AuthenticatorAttestationResponse;
  if (!attestation.attestationObject) {
    throw new Error("Passkey registration missing attestationObject");
  }

  return {
    credentialId: bytesToBase64Url(new Uint8Array(cred.rawId)),
    attestationObject: bytesToBase64Url(
      new Uint8Array(attestation.attestationObject),
    ),
  };
}
