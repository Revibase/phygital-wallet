/**
 * Wallet operations: the PRF -> HKDF -> AES-GCM -> blob pipeline (§4, §5, §10).
 *
 * The WebAuthn PRF is injected (`PrfProvider`) so this entire pipeline — the part
 * that actually protects the key — is unit-testable without a browser, and so the
 * DOM/WebAuthn code stays a thin, separately-audited shell.
 *
 * No PRF output, wrapping key, or plaintext seed is cached between operations
 * (§5, §24): every call takes a fresh PRF result and scrubs what it can (§30).
 */

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveWrappingKey,
  ed25519PublicKey,
  ed25519Sign,
  generateEd25519Seed,
  randomBytes,
  scrub,
} from "./crypto.js";
import { AES_GCM_IV_BYTES, KDF_SALT_BYTES } from "./constants.js";
import { bytesEqual } from "./encoding.js";
import {
  buildAad,
  decodeWalletBlob,
  encodeWalletBlob,
  type ParsedWalletBlob,
} from "./wallet-format.js";
import type { ErrorCode } from "./protocol.js";

export class ServiceError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}

/** A completed WebAuthn PRF ceremony. */
export interface PrfResult {
  credentialId: Uint8Array;
  prfOutput: Uint8Array; // 32 bytes from the authenticator's PRF
}

/**
 * WebAuthn PRF provider. `create` enrolls a new credential; `get` re-authenticates
 * an existing one. Both are triggered by an explicit in-signer user gesture (§10,
 * §24) and must fail closed if the authenticator lacks PRF (§11 — never weaken).
 */
export interface PrfCreateOptions {
  /** Password-manager visible account name (user.name / displayName). */
  userName: string;
}

export interface PrfProvider {
  create(rpId: string, opts: PrfCreateOptions): Promise<PrfResult>;
  get(rpId: string, credentialId: Uint8Array): Promise<Uint8Array>;
}

export interface CreatedWallet {
  publicKey: Uint8Array;
  blob: Uint8Array;
  /** Present when `messageToSign` was provided (D1 PUT / login proof). */
  signature?: Uint8Array;
}

/** Generate a fresh keypair inside the signer and wrap it into a portable blob. */
export async function createWallet(
  prf: PrfProvider,
  rpId: string,
  opts: { userName: string; messageToSign?: Uint8Array }
): Promise<CreatedWallet> {
  let prfOutput: Uint8Array | undefined;
  try {
    const enrolled = await prf.create(rpId, { userName: opts.userName });
    prfOutput = enrolled.prfOutput;
    return await wrapNewSeed(prfOutput, enrolled.credentialId, rpId, opts);
  } finally {
    scrub(prfOutput);
  }
}

/**
 * Parent already created the passkey (shared RP ID). Evaluate PRF via get() and
 * wrap a new seed — key material never touched the parent origin.
 */
export async function enrollExistingCredential(
  prf: PrfProvider,
  rpId: string,
  credentialId: Uint8Array,
  opts: {
    messageToSign?: Uint8Array;
  } = {}
): Promise<CreatedWallet> {
  let prfOutput: Uint8Array | undefined;
  try {
    prfOutput = await prf.get(rpId, credentialId);
    return await wrapNewSeed(prfOutput, credentialId, rpId, opts);
  } finally {
    scrub(prfOutput);
  }
}

async function wrapNewSeed(
  prfOutput: Uint8Array,
  credentialId: Uint8Array,
  rpId: string,
  opts: {
    messageToSign?: Uint8Array;
  }
): Promise<CreatedWallet> {
  let seed: Uint8Array | undefined;
  try {
    seed = generateEd25519Seed(); // CSPRNG; parent never supplies randomness (§10)
    const publicKey = ed25519PublicKey(seed);
    const kdfSalt = randomBytes(KDF_SALT_BYTES);
    const iv = randomBytes(AES_GCM_IV_BYTES);
    const key = await deriveWrappingKey(prfOutput, kdfSalt);
    const aad = buildAad({ publicKey, credentialId, kdfSalt }, rpId);
    const ciphertext = await aesGcmEncrypt(key, iv, seed, aad);
    const blob = encodeWalletBlob({
      publicKey,
      credentialId,
      kdfSalt,
      iv,
      ciphertext,
    });
    return {
      publicKey,
      blob,
      ...(opts.messageToSign
        ? { signature: ed25519Sign(opts.messageToSign, seed) }
        : {}),
    };
  } finally {
    scrub(seed);
  }
}

/** Structurally validate a blob and return the parsed header. Throws ServiceError. */
export function parseBlob(blob: Uint8Array): ParsedWalletBlob {
  try {
    return decodeWalletBlob(blob);
  } catch {
    throw new ServiceError("INVALID_WALLET_BLOB");
  }
}

/**
 * Decrypt a wallet: fresh PRF -> HKDF -> AES-GCM authenticate/decrypt -> derive
 * public key -> require it matches the authenticated blob (§7, §34). Returns the
 * 32-byte seed; the CALLER must scrub it after use.
 */
export async function decryptWallet(
  prf: PrfProvider,
  rpId: string,
  parsed: ParsedWalletBlob
): Promise<{ seed: Uint8Array; publicKey: Uint8Array }> {
  let prfOutput: Uint8Array | undefined;
  try {
    prfOutput = await prf.get(rpId, parsed.credentialId);
  } catch {
    // WebAuthn cancelled / no PRF / wrong authenticator — do not distinguish.
    throw new ServiceError("AUTHENTICATION_FAILED");
  }
  try {
    return await unwrapWallet(prfOutput, parsed, rpId);
  } finally {
    scrub(prfOutput);
  }
}

/**
 * Unwrap with an already-evaluated PRF (e.g. discoverable assertion held only
 * until the parent returns a blob). Caller must scrub `prfOutput`.
 */
export async function unwrapWallet(
  prfOutput: Uint8Array,
  parsed: ParsedWalletBlob,
  rpId: string
): Promise<{ seed: Uint8Array; publicKey: Uint8Array }> {
  const key = await deriveWrappingKey(prfOutput, parsed.kdfSalt);
  const aad = buildAad(parsed, rpId);
  let seed: Uint8Array;
  try {
    seed = await aesGcmDecrypt(key, parsed.iv, parsed.ciphertext, aad);
  } catch {
    throw new ServiceError("DECRYPTION_FAILED");
  }
  const publicKey = ed25519PublicKey(seed);
  if (!bytesEqual(publicKey, parsed.publicKey)) {
    scrub(seed);
    throw new ServiceError("WALLET_MISMATCH");
  }
  return { seed, publicKey };
}

/** Sign message bytes with the decrypted seed, then scrub the seed. */
export function signAndScrub(
  messageBytes: Uint8Array,
  seed: Uint8Array
): Uint8Array {
  try {
    return ed25519Sign(messageBytes, seed);
  } finally {
    scrub(seed);
  }
}
