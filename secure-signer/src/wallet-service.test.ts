import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "./crypto.js";
import { decodeWalletBlob } from "./wallet-format.js";
import {
  createWallet,
  decryptWallet,
  parseBlob,
  ServiceError,
  signAndScrub,
  type PrfProvider,
  type PrfResult,
} from "./wallet-service.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const RP = "signer.example.com";

/** Mock PRF: a synced passkey where each credentialId maps to a stable PRF output. */
class MockPrf implements PrfProvider {
  constructor(private readonly secret: string) {}
  async create(): Promise<PrfResult> {
    const credentialId = crypto.getRandomValues(new Uint8Array(16));
    return { credentialId, prfOutput: await this.derive(credentialId) };
  }
  async get(_rpId: string, credentialId: Uint8Array): Promise<Uint8Array> {
    return this.derive(credentialId);
  }
  private derive(credentialId: Uint8Array): Promise<Uint8Array> {
    return sha256(new Uint8Array([...credentialId, ...utf8(this.secret)]));
  }
}

describe("wallet-service pipeline", () => {
  it("create -> import(decrypt) -> sign round-trips", async () => {
    const prf = new MockPrf("authenticator-A");
    const { publicKey, blob } = await createWallet(prf, RP);

    const parsed = parseBlob(blob);
    const { seed, publicKey: derived } = await decryptWallet(prf, RP, parsed);
    expect([...derived]).toEqual([...publicKey]);

    const msg = crypto.getRandomValues(new Uint8Array(64));
    const sig = signAndScrub(msg, seed);
    expect(ed25519.verify(sig, msg, publicKey)).toBe(true);
    // seed scrubbed after sign
    expect(seed.every((b) => b === 0)).toBe(true);
  });

  it("fails to decrypt with a different authenticator (wrong passkey)", async () => {
    const { blob } = await createWallet(new MockPrf("authenticator-A"), RP);
    const parsed = parseBlob(blob);
    await expect(decryptWallet(new MockPrf("authenticator-B"), RP, parsed)).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
    });
  });

  it("fails to decrypt a tampered public key (AAD binding)", async () => {
    const prf = new MockPrf("authenticator-A");
    const { blob } = await createWallet(prf, RP);
    blob[5] = blob[5]! ^ 0xff; // first byte of publicKey (offset 4 magic+1 version = 5)
    // structural decode still ok, but AAD no longer matches -> auth failure
    const parsed = decodeWalletBlob(blob);
    await expect(decryptWallet(prf, RP, parsed)).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
    });
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const prf = new MockPrf("authenticator-A");
    const { blob } = await createWallet(prf, RP);
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0xff;
    const parsed = decodeWalletBlob(blob);
    await expect(decryptWallet(prf, RP, parsed)).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
    });
  });

  it("rejects a structurally corrupt blob before any crypto", () => {
    expect(() => parseBlob(new Uint8Array([1, 2, 3]))).toThrow(ServiceError);
  });

  it("binds decryption to the rpId (a different rpId fails)", async () => {
    const prf = new MockPrf("authenticator-A");
    const { blob } = await createWallet(prf, RP);
    const parsed = parseBlob(blob);
    await expect(decryptWallet(prf, "evil.example.com", parsed)).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
    });
  });
});
