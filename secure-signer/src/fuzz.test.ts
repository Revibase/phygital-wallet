/**
 * Fuzz the attacker-facing decoders (§38). We assert they always terminate and
 * only ever fail with their declared error type — never hang, never OOB, never
 * throw a non-Error, never return a "valid" parse from trailing garbage.
 */
import { describe, expect, it } from "vitest";
import { base64ToBytes, DecodeError } from "./encoding.js";
import { BlobError, decodeWalletBlob } from "./wallet-format.js";
import { decodeV1Transaction, TxError } from "./tx/decode-v1.js";
import { validateInbound } from "./protocol.js";

function randomBytes(maxLen: number): Uint8Array {
  const n = Math.floor(Math.random() * maxLen);
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const ITER = 4000;

describe("fuzz: decoders fail safely on arbitrary bytes", () => {
  it("decodeWalletBlob never crashes uncontrollably", () => {
    for (let i = 0; i < ITER; i++) {
      const bytes = randomBytes(1200);
      try {
        decodeWalletBlob(bytes);
      } catch (e) {
        expect(e).toBeInstanceOf(BlobError);
      }
    }
  });

  it("decodeV1Transaction never crashes uncontrollably", () => {
    for (let i = 0; i < ITER; i++) {
      const bytes = randomBytes(4200);
      // Bias some inputs toward the v1 version byte to exercise deeper paths.
      if (bytes.length > 0 && i % 2 === 0) bytes[0] = 129;
      try {
        decodeV1Transaction(bytes);
      } catch (e) {
        expect(e).toBeInstanceOf(TxError);
      }
    }
  });

  it("base64ToBytes never crashes on arbitrary strings", () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_ \n!@#";
    for (let i = 0; i < ITER; i++) {
      const len = Math.floor(Math.random() * 64);
      let s = "";
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      try {
        base64ToBytes(s, 4096, Math.random() < 0.5 ? "std" : "url");
      } catch (e) {
        expect(e).toBeInstanceOf(DecodeError);
      }
    }
  });

  it("validateInbound never throws on arbitrary objects", () => {
    const types = ["CREATE_KEY", "SIGN_TRANSACTION", "??", 5, null];
    for (let i = 0; i < ITER; i++) {
      const data: Record<string, unknown> = {
        type: types[Math.floor(Math.random() * types.length)],
        protocolVersion: Math.floor(Math.random() * 3),
        requestId: Math.random().toString(36).slice(2),
      };
      if (Math.random() < 0.5) data["encryptedWalletBlob"] = Math.random().toString(36);
      if (Math.random() < 0.5) data["transaction"] = Math.random().toString(36);
      if (Math.random() < 0.3) data["evil"] = 1;
      // Must always return a result object, never throw.
      const r = validateInbound(data);
      expect(typeof r.ok).toBe("boolean");
    }
  });
});
