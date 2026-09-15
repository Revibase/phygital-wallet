import { describe, expect, it } from "vitest";
import { digestHex, SignerState } from "./state.js";

describe("SignerState", () => {
  it("rejects duplicate request ids", () => {
    const s = new SignerState();
    expect(s.checkFreshnessAndReplay("req-1")).toBeNull();
    s.remember("req-1");
    expect(s.checkFreshnessAndReplay("req-1")).toBe("REPLAY_REJECTED");
  });

  it("rejects stale timestamps", () => {
    let now = 1_000_000;
    const s = new SignerState(() => now);
    expect(s.checkFreshnessAndReplay("a", now)).toBeNull();
    expect(s.checkFreshnessAndReplay("b", now - 120_000)).toBe("REPLAY_REJECTED");
  });

  it("serializes operations (one active at a time)", () => {
    const s = new SignerState();
    expect(s.begin("SIGN_PENDING", "r1")).toBe(true);
    expect(s.isBusy()).toBe(true);
    expect(s.begin("IMPORT_PENDING", "r2")).toBe(false); // busy
    s.end();
    expect(s.begin("IMPORT_PENDING", "r2")).toBe(true);
  });

  it("authorization is single-use and digest-bound", async () => {
    const s = new SignerState();
    const digest = await digestHex(new Uint8Array([1, 2, 3]));
    s.authorize({
      operation: "SIGN_PENDING",
      requestId: "r1",
      walletPublicKey: new Uint8Array(32),
      messageDigest: digest,
      createdAt: 0,
    });
    // wrong digest -> null
    expect(
      s.consumeAuthorization({ operation: "SIGN_PENDING", requestId: "r1", messageDigest: "deadbeef" })
    ).toBeNull();
    // re-authorize, then correct consume works once
    s.authorize({
      operation: "SIGN_PENDING",
      requestId: "r1",
      walletPublicKey: new Uint8Array(32),
      messageDigest: digest,
      createdAt: 0,
    });
    expect(
      s.consumeAuthorization({ operation: "SIGN_PENDING", requestId: "r1", messageDigest: digest })
    ).not.toBeNull();
    // second consume -> null (single use)
    expect(
      s.consumeAuthorization({ operation: "SIGN_PENDING", requestId: "r1", messageDigest: digest })
    ).toBeNull();
  });

  it("authorization for one operation does not authorize another", async () => {
    const s = new SignerState();
    const digest = await digestHex(new Uint8Array([9]));
    s.authorize({
      operation: "SIGN_PENDING",
      requestId: "r1",
      walletPublicKey: new Uint8Array(32),
      messageDigest: digest,
      createdAt: 0,
    });
    expect(
      s.consumeAuthorization({ operation: "PRIVATE_EXPORT_PENDING", requestId: "r1", messageDigest: digest })
    ).toBeNull();
  });
});
