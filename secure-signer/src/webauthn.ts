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
 *
 * Discoverable unlock uses a **server-issued** challenge (fetchChallenge) so the
 * same ceremony both evaluates PRF and authorizes D1 blob fetch.
 */

import { PRF_INPUT_LABEL, RP_ID } from "./constants.js";
import { sha256 } from "./crypto.js";
import { bytesToBase64, utf8ToBytes } from "./encoding.js";
import type { PrfProvider, PrfResult } from "./wallet-service.js";

export class WebAuthnUnsupported extends Error {}

/**
 * AuthenticationResponseJSON-shaped assertion for the parent to POST to
 * `/owner-wallet/blob/restore` (base64url fields per WebAuthn Level 3 JSON).
 */
export type AuthenticationAssertionJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  authenticatorAttachment?: AuthenticatorAttachment;
};

export type DiscoverablePrfResult = PrfResult & {
  assertion: AuthenticationAssertionJSON;
};

/** Shared RP ID (app create + iframe get). Prefer `RP_ID` / `VITE_RP_ID`. */
export function currentRpId(): string {
  return RP_ID;
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
  const results = (
    cred.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    }
  ).prf;
  const first = results?.results?.first;
  if (!first) {
    // Authenticator/browser did not evaluate PRF -> unrecoverable material. Fail.
    throw new WebAuthnUnsupported("PRF not available for this credential");
  }
  return new Uint8Array(first);
}

/** Serialize a PublicKeyCredential assertion to WebAuthn JSON (base64url). */
export function assertionToJSON(
  cred: PublicKeyCredential,
): AuthenticationAssertionJSON {
  const response = cred.response as AuthenticatorAssertionResponse;
  const out: AuthenticationAssertionJSON = {
    id: cred.id,
    rawId: bytesToBase64(new Uint8Array(cred.rawId), "url"),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64(
        new Uint8Array(response.clientDataJSON),
        "url",
      ),
      authenticatorData: bytesToBase64(
        new Uint8Array(response.authenticatorData),
        "url",
      ),
      signature: bytesToBase64(new Uint8Array(response.signature), "url"),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
  if (response.userHandle) {
    out.response.userHandle = bytesToBase64(
      new Uint8Array(response.userHandle),
      "url",
    );
  }
  if (cred.authenticatorAttachment) {
    out.authenticatorAttachment =
      cred.authenticatorAttachment as AuthenticatorAttachment;
  }
  return out;
}

export class BrowserPrfProvider implements PrfProvider {
  /**
   * Enroll a new credential, then immediately evaluate PRF via get() (PRF is
   * only reliably returned at assertion time). Requires transient user activation
   * — call from a click handler inside the signer UI.
   */
  async create(rpId: string, opts: { userName: string }): Promise<PrfResult> {
    const salt = await prfSalt();
    // Opaque handle — not derived from the display name (names can be reused).
    const userId = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const userName = opts.userName;
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: buf(randomChallenge()),
        rp: { id: rpId, name: userName },
        user: {
          id: buf(userId),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        timeout: 120_000,
        extensions: {
          prf: { eval: { first: buf(salt) } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred)
      throw new WebAuthnUnsupported("credential creation returned null");

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
        extensions: {
          prf: { eval: { first: buf(salt) } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!assertion) throw new WebAuthnUnsupported("assertion returned null");
    return extractPrf(assertion);
  }

  /**
   * Discoverable assertion (empty allowCredentials) for "Sign in" on a device
   * with no local/parent blob.
   *
   * `challenge` MUST be the server fetch-challenge bytes so the same ceremony
   * unlocks PRF and authorizes D1 blob fetch (parent posts `assertion`).
   */
  async getDiscoverable(
    rpId: string,
    challenge: Uint8Array,
  ): Promise<DiscoverablePrfResult> {
    const salt = await prfSalt();
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: buf(challenge),
        rpId,
        userVerification: "required",
        timeout: 120_000,
        extensions: {
          prf: { eval: { first: buf(salt) } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!assertion) throw new WebAuthnUnsupported("assertion returned null");
    return {
      credentialId: new Uint8Array(assertion.rawId),
      prfOutput: extractPrf(assertion),
      assertion: assertionToJSON(assertion),
    };
  }
}
