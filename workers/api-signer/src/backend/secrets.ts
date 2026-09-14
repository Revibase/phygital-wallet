import { ed25519 } from "@noble/curves/ed25519.js";
import {
  getBase58Decoder,
  getBase58Encoder,
  getBase64Decoder,
} from "@solana/kit";

import { coded } from "@/shared/errors";

const MAX_FEE_PAYER_KEYS = 8;

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
    throw coded(
      "Fee-payer secret must be a 32-byte seed or 64-byte keypair",
      "signer_misconfigured",
    );
  }
  return seed;
}

/**
 * In-process fee-payer signing from the existing `VERIFIER_SECRET_KEYS` secret
 * map. The environment name is retained for deployment compatibility.
 */
export class FeePayerSigner {
  private readonly byPubkey: Map<string, Uint8Array>;

  constructor(secretKeysJson: string | undefined) {
    if (!secretKeysJson?.trim()) {
      throw coded("VERIFIER_SECRET_KEYS is not configured", "signer_misconfigured");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(secretKeysJson);
    } catch {
      throw coded("VERIFIER_SECRET_KEYS must be valid JSON", "signer_misconfigured");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw coded(
        "VERIFIER_SECRET_KEYS must be a JSON object map",
        "signer_misconfigured",
      );
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      throw coded(
        "VERIFIER_SECRET_KEYS must include at least one key",
        "signer_misconfigured",
      );
    }
    if (entries.length > MAX_FEE_PAYER_KEYS) {
      throw coded(
        `VERIFIER_SECRET_KEYS supports at most ${MAX_FEE_PAYER_KEYS} keys`,
        "signer_misconfigured",
      );
    }

    this.byPubkey = new Map();
    for (const [pubkey, value] of entries) {
      if (typeof value !== "string" || !value.trim()) {
        throw coded(
          `VERIFIER_SECRET_KEYS entry for ${pubkey} must be a string`,
          "signer_misconfigured",
        );
      }
      const seed = parseSeed(value);
      const derived = base58Decoder.decode(ed25519.getPublicKey(seed));
      if (derived !== pubkey) {
        throw coded(
          `VERIFIER_SECRET_KEYS pubkey mismatch: map key ${pubkey} != derived ${derived}`,
          "signer_misconfigured",
        );
      }
      this.byPubkey.set(pubkey, seed);
    }
  }

  canSign(feePayer: string): boolean {
    return this.byPubkey.has(feePayer);
  }

  async sign(feePayer: string, messageBytes: Uint8Array): Promise<string> {
    const seed = this.byPubkey.get(feePayer);
    if (!seed) {
      throw coded(
        "Transaction fee payer does not match this signing service",
        "fee_payer_mismatch",
        { details: { expected: [...this.byPubkey.keys()], got: feePayer } },
      );
    }
    const sig = ed25519.sign(messageBytes, seed);
    return getBase64Decoder().decode(sig);
  }
}
