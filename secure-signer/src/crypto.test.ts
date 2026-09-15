import { describe, expect, it } from "vitest";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveWrappingKey,
  ed25519PublicKey,
  ed25519Sign,
  generateEd25519Seed,
  randomBytes,
} from "./crypto.js";
import { ed25519 } from "@noble/curves/ed25519.js";

describe("crypto", () => {
  it("HKDF -> AES-GCM wraps and unwraps a seed with AAD binding", async () => {
    const prf = randomBytes(32);
    const salt = randomBytes(32);
    const iv = randomBytes(12);
    const aad = new TextEncoder().encode("aad-v1");
    const seed = generateEd25519Seed();

    const key = await deriveWrappingKey(prf, salt);
    const ct = await aesGcmEncrypt(key, iv, seed, aad);
    expect(ct.length).toBe(seed.length + 16);

    const key2 = await deriveWrappingKey(prf, salt);
    const pt = await aesGcmDecrypt(key2, iv, ct, aad);
    expect([...pt]).toEqual([...seed]);
  });

  it("fails to decrypt under a different AAD (auth failure -> throws)", async () => {
    const prf = randomBytes(32);
    const salt = randomBytes(32);
    const iv = randomBytes(12);
    const seed = generateEd25519Seed();
    const key = await deriveWrappingKey(prf, salt);
    const ct = await aesGcmEncrypt(key, iv, seed, new TextEncoder().encode("aad-A"));
    await expect(
      aesGcmDecrypt(key, iv, ct, new TextEncoder().encode("aad-B"))
    ).rejects.toBeTruthy();
  });

  it("fails to decrypt with a different PRF output", async () => {
    const salt = randomBytes(32);
    const iv = randomBytes(12);
    const aad = new TextEncoder().encode("aad");
    const seed = generateEd25519Seed();
    const key = await deriveWrappingKey(randomBytes(32), salt);
    const ct = await aesGcmEncrypt(key, iv, seed, aad);
    const wrongKey = await deriveWrappingKey(randomBytes(32), salt);
    await expect(aesGcmDecrypt(wrongKey, iv, ct, aad)).rejects.toBeTruthy();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const prf = randomBytes(32);
    const salt = randomBytes(32);
    const iv = randomBytes(12);
    const aad = new TextEncoder().encode("aad");
    const key = await deriveWrappingKey(prf, salt);
    const ct = await aesGcmEncrypt(key, iv, generateEd25519Seed(), aad);
    ct[0] = ct[0]! ^ 0xff;
    await expect(aesGcmDecrypt(key, iv, ct, aad)).rejects.toBeTruthy();
  });

  it("derives an Ed25519 public key and signs verifiably", () => {
    const seed = generateEd25519Seed();
    const pub = ed25519PublicKey(seed);
    const msg = randomBytes(80);
    const sig = ed25519Sign(msg, seed);
    expect(sig.length).toBe(64);
    expect(ed25519.verify(sig, msg, pub)).toBe(true);
  });
});
