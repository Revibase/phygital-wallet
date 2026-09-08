import { ed25519 } from "@noble/curves/ed25519.js";
import { getBase58Decoder, getBase58Encoder } from "@solana/kit";

const base58Encoder = getBase58Encoder();
const base58Decoder = getBase58Decoder();

export type VerifierKey = {
  /** Base58 Solana pubkey. */
  publicKey: string;
  seed: Uint8Array;
};

function parseSecret(raw: string): Uint8Array {
  let secretKey: Uint8Array;
  if (raw.trim().startsWith("[")) {
    secretKey = Uint8Array.from(JSON.parse(raw) as number[]);
  } else {
    secretKey = new Uint8Array(base58Encoder.encode(raw.trim()));
  }
  const seed = secretKey.length >= 64 ? secretKey.slice(0, 32) : secretKey;
  if (seed.length !== 32) {
    throw new Error("VERIFIER_SECRET_KEY must be a 32-byte seed or 64-byte keypair");
  }
  return seed;
}

let cached: VerifierKey | null = null;

/** Load ed25519 seed from `VERIFIER_SECRET_KEY` (lazy, process-lifetime cache). */
export function loadVerifierKey(): VerifierKey {
  if (cached) return cached;

  const raw = process.env.VERIFIER_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error(
      "Set VERIFIER_SECRET_KEY (run `pnpm generate-keypair` to create one)",
    );
  }

  const seed = parseSecret(raw);
  const publicKey = base58Decoder.decode(ed25519.getPublicKey(seed));
  const expected = process.env.VERIFIER_PUBLIC_KEY?.trim();
  if (expected && expected !== publicKey) {
    throw new Error(
      `VERIFIER_PUBLIC_KEY mismatch: env=${expected} derived=${publicKey}`,
    );
  }

  cached = { publicKey, seed };
  return cached;
}

/** Sign Solana transaction message bytes; returns standard base64 (64 bytes). */
export function signMessage(messageBytes: Uint8Array): string {
  const { seed } = loadVerifierKey();
  const sig = ed25519.sign(messageBytes, seed);
  return Buffer.from(sig).toString("base64");
}

export function canSign(verifierPubkey: string): boolean {
  return loadVerifierKey().publicKey === verifierPubkey;
}
