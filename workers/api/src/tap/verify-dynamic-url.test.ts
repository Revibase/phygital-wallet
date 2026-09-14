import { Endian, getU32Encoder } from "@solana/kit";
import { p256 } from "@noble/curves/nist.js";
import { describe, expect, it } from "vitest";

import { bytesToBase64Url } from "@/shared/crypto/base64";
import { evaluateCounter } from "@/tap/counter-session";
import { verifyDynamicUrlWithoutCounterCheck } from "@/tap/verify-dynamic-url";

/** Build signed `pk/s/c/n` tap params the way an NFC chip would. */
function signTapParams(counter: number): URLSearchParams {
  const priv = p256.utils.randomSecretKey();
  const pk = p256.getPublicKey(priv); // 33-byte compressed
  const nonce = crypto.getRandomValues(new Uint8Array(8));

  const message = new Uint8Array(12);
  message.set(getU32Encoder({ endian: Endian.Big }).encode(counter), 0);
  message.set(nonce, 4);
  const sig = p256.sign(message, priv, { prehash: false }); // 64-byte r||s

  return new URLSearchParams({
    pk: bytesToBase64Url(pk),
    s: bytesToBase64Url(sig),
    c: String(counter),
    n: bytesToBase64Url(nonce),
  });
}

describe("verifyDynamicUrlWithoutCounterCheck", () => {
  it("verifies a genuine p256 tap signature", () => {
    const result = verifyDynamicUrlWithoutCounterCheck(signTapParams(7));
    expect(result.isVerified).toBe(true);
    expect(result.counter).toBe(7);
    expect(result.identifier).toBeTruthy();
  });

  it("rejects a tampered signature", () => {
    const params = signTapParams(7);
    const sig = params.get("s")!;
    // Flip the last character to corrupt the signature bytes.
    params.set("s", sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"));
    expect(verifyDynamicUrlWithoutCounterCheck(params).isVerified).toBe(false);
  });

  it("throws on missing params", () => {
    expect(() =>
      verifyDynamicUrlWithoutCounterCheck(new URLSearchParams({ pk: "x" })),
    ).toThrow(/Missing tap parameters/);
  });

  it("throws on a wrong-length public key", () => {
    const params = signTapParams(1);
    params.set("pk", bytesToBase64Url(new Uint8Array(10)));
    expect(() => verifyDynamicUrlWithoutCounterCheck(params)).toThrow(
      /33-byte compressed/,
    );
  });
});

describe("evaluateCounter", () => {
  it("accepts a higher counter and rejects same-or-lower (replay)", () => {
    expect(evaluateCounter(null, 5)).toBe("new");
    expect(evaluateCounter({ c: 5 }, 6)).toBe("new");
    expect(evaluateCounter({ c: 5 }, 5)).toBe("replay");
    expect(evaluateCounter({ c: 5 }, 4)).toBe("replay");
  });
});
