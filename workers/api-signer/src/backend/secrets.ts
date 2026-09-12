import { ed25519 } from "@noble/curves/ed25519.js";
import { getBase58Decoder, getBase58Encoder } from "@solana/kit";

import { bytesToBase64 } from "@/shared/crypto/base64";

import { MAX_VERIFIER_KEYS, type VerifierSignerBackend } from "./types.js";

const base58Encoder = getBase58Encoder();
const base58Decoder = getBase58Decoder();

function parseSeed(raw: string): Uint8Array {
  let secretKey: Uint8Array;
  if (raw.trim().startsWith("[")) {
    secretKey = Uint8Array.from(JSON.parse(raw) as number[]);
  } else {
    secretKey = new Uint8Array(base58Encoder.encode(raw.trim()));
  }
  const seed = secretKey.length >= 64 ? secretKey.slice(0, 32) : secretKey;
  if (seed.length !== 32) {
    throw Object.assign(
      new Error("Verifier secret must be 32-byte seed or 64-byte keypair"),
      { code: "signer_misconfigured" }
    );
  }
  return seed;
}

/**
 * Pubkeys from `VERIFIER_SECRET_KEYS` JSON map keys (no seed validation).
 * Used as the Config-equivalent default verifier / paymaster set.
 */
export function parseVerifierSecretKeyPubkeys(
  secretKeysJson: string | undefined
): Set<string> {
  if (!secretKeysJson?.trim()) {
    throw Object.assign(new Error("VERIFIER_SECRET_KEYS is not configured"), {
      code: "signer_misconfigured",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretKeysJson);
  } catch {
    throw Object.assign(new Error("VERIFIER_SECRET_KEYS must be valid JSON"), {
      code: "signer_misconfigured",
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw Object.assign(
      new Error("VERIFIER_SECRET_KEYS must be a JSON object map"),
      { code: "signer_misconfigured" }
    );
  }
  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length === 0) {
    throw Object.assign(
      new Error("VERIFIER_SECRET_KEYS must include at least one key"),
      { code: "signer_misconfigured" }
    );
  }
  if (keys.length > MAX_VERIFIER_KEYS) {
    throw Object.assign(
      new Error(
        `VERIFIER_SECRET_KEYS supports at most ${MAX_VERIFIER_KEYS} keys`
      ),
      { code: "signer_misconfigured" }
    );
  }
  return new Set(keys);
}

/**
 * In-process ed25519 signing from `VERIFIER_SECRET_KEYS` JSON map
 * `{ "<base58Pubkey>": "<seed|keypair>" }` (max {@link MAX_VERIFIER_KEYS}).
 */
export class SecretsVerifierBackend implements VerifierSignerBackend {
  private readonly byPubkey: Map<string, Uint8Array>;

  constructor(secretKeysJson: string | undefined) {
    if (!secretKeysJson?.trim()) {
      throw Object.assign(new Error("VERIFIER_SECRET_KEYS is not configured"), {
        code: "signer_misconfigured",
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(secretKeysJson);
    } catch {
      throw Object.assign(
        new Error("VERIFIER_SECRET_KEYS must be valid JSON"),
        { code: "signer_misconfigured" }
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw Object.assign(
        new Error("VERIFIER_SECRET_KEYS must be a JSON object map"),
        { code: "signer_misconfigured" }
      );
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      throw Object.assign(
        new Error("VERIFIER_SECRET_KEYS must include at least one key"),
        { code: "signer_misconfigured" }
      );
    }
    if (entries.length > MAX_VERIFIER_KEYS) {
      throw Object.assign(
        new Error(
          `VERIFIER_SECRET_KEYS supports at most ${MAX_VERIFIER_KEYS} keys`
        ),
        { code: "signer_misconfigured" }
      );
    }

    this.byPubkey = new Map();
    for (const [pubkey, value] of entries) {
      if (typeof value !== "string" || !value.trim()) {
        throw Object.assign(
          new Error(
            `VERIFIER_SECRET_KEYS entry for ${pubkey} must be a string`
          ),
          { code: "signer_misconfigured" }
        );
      }
      const seed = parseSeed(value);
      const derived = base58Decoder.decode(ed25519.getPublicKey(seed));
      if (derived !== pubkey) {
        throw Object.assign(
          new Error(
            `VERIFIER_SECRET_KEYS pubkey mismatch: map key ${pubkey} != derived ${derived}`
          ),
          { code: "signer_misconfigured" }
        );
      }
      this.byPubkey.set(pubkey, seed);
    }
  }

  /** On-chain verifier pubkeys this Worker can co-sign for. */
  listPubkeys(): string[] {
    return [...this.byPubkey.keys()];
  }

  canSign(verifierPubkey: string): boolean {
    return this.byPubkey.has(verifierPubkey);
  }

  async sign(
    verifierPubkey: string,
    messageBytes: Uint8Array
  ): Promise<string> {
    const seed = this.byPubkey.get(verifierPubkey);
    if (!seed) {
      throw Object.assign(
        new Error("Transaction verifier does not match this signing service"),
        {
          code: "verifier_mismatch",
          details: {
            expected: [...this.byPubkey.keys()],
            got: verifierPubkey,
          },
        }
      );
    }
    const sig = ed25519.sign(messageBytes, seed);
    return bytesToBase64(sig);
  }
}
