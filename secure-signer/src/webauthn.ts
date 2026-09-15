/**
 * WebAuthn PRF provider (browser). Thin shell over navigator.credentials — the
 * key-protecting logic lives in wallet-service.ts, which is tested headlessly.
 *
 * PRF portability (§11, §36): synced passkeys (iCloud Keychain, Google Password
 * Manager) return the SAME PRF output for the same credential + salt across
 * devices, enabling recovery. Firefox has no PRF; device-bound/hardware keys do
 * not sync. If PRF is unavailable we THROW — never silently weaken encryption.
 *
 * The PRF salt is IMPLEMENTATION-FIXED (§35): the same constant for every wallet,
 * derived from PRF_INPUT_LABEL. It is never taken from the (attacker-controlled)
 * blob.
 */

import { PRF_INPUT_LABEL } from "./constants.js";
import { sha256 } from "./crypto.js";
import { utf8ToBytes } from "./encoding.js";
import type { PrfProvider, PrfResult } from "./wallet-service.js";

export class WebAuthnUnsupported extends Error {}

/** The registrable RP id for this signer origin. */
export function currentRpId(): string {
  return globalThis.location?.hostname ?? "localhost";
}

async function prfSalt(): Promise<Uint8Array> {
  // 32-byte fixed salt fed to the authenticator PRF; constant across all wallets.
  return sha256(utf8ToBytes(PRF_INPUT_LABEL));
}

function randomChallenge(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

// WebAuthn's DOM types want BufferSource backed by a plain ArrayBuffer; TS 5.9's
// stricter Uint8Array<ArrayBufferLike> trips the assignment. These byte fields
// are not security-sensitive to the cast.
const buf = (b: Uint8Array): BufferSource => b as unknown as BufferSource;

function extractPrf(cred: PublicKeyCredential): Uint8Array {
  const results = (cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf;
  const first = results?.results?.first;
  if (!first) {
    // Authenticator/browser did not evaluate PRF -> unrecoverable material. Fail.
    throw new WebAuthnUnsupported("PRF not available for this credential");
  }
  return new Uint8Array(first);
}

export class BrowserPrfProvider implements PrfProvider {
  /**
   * Enroll a new credential, then immediately evaluate PRF via get() (PRF is
   * only reliably returned at assertion time). Requires transient user activation
   * — call from a click handler inside the signer UI.
   */
  async create(rpId: string): Promise<PrfResult> {
    const salt = await prfSalt();
    const userId = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: buf(randomChallenge()),
        rp: { id: rpId, name: "Secure Signer" },
        user: { id: buf(userId), name: "secure-signer", displayName: "Secure Signer Wallet" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        timeout: 120_000,
        extensions: { prf: { eval: { first: buf(salt) } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new WebAuthnUnsupported("credential creation returned null");

    const credentialId = new Uint8Array(cred.rawId);
    // Some platforms return PRF at create time; if not, do a follow-up get().
    let prfOutput: Uint8Array;
    try {
      prfOutput = extractPrf(cred);
    } catch {
      prfOutput = await this.get(rpId, credentialId);
    }
    return { credentialId, prfOutput };
  }

  async get(rpId: string, credentialId: Uint8Array): Promise<Uint8Array> {
    const salt = await prfSalt();
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: buf(randomChallenge()),
        rpId,
        allowCredentials: [{ type: "public-key", id: buf(credentialId) }],
        userVerification: "required",
        timeout: 120_000,
        extensions: { prf: { eval: { first: buf(salt) } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!assertion) throw new WebAuthnUnsupported("assertion returned null");
    return extractPrf(assertion);
  }
}
