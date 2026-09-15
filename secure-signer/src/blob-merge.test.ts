import { describe, expect, it } from "vitest";
import { pickForAuth, pickForSensitiveOp, bindsEqual } from "./blob-merge.js";
import type { ParsedWalletBlob } from "./wallet-format.js";

function blob(
  pubkey: number,
  cred: number,
): ParsedWalletBlob {
  return {
    version: 1,
    publicKey: Uint8Array.from({ length: 32 }, () => pubkey),
    credentialId: Uint8Array.from([cred]),
    kdfSalt: new Uint8Array(32),
    iv: new Uint8Array(12),
    ciphertext: new Uint8Array(48),
  };
}

describe("pickForAuth", () => {
  it("returns none when both missing", () => {
    expect(pickForAuth(null, null)).toEqual({ kind: "none" });
  });

  it("uses remote and asks to write local when only remote", () => {
    const remote = blob(1, 9);
    expect(pickForAuth(null, remote)).toEqual({
      kind: "use",
      parsed: remote,
      source: "remote",
      writeLocal: true,
    });
  });

  it("prefers local when only local", () => {
    const local = blob(1, 9);
    expect(pickForAuth(local, null)).toEqual({
      kind: "use",
      parsed: local,
      source: "local",
      writeLocal: false,
    });
  });

  it("keeps local when binds match", () => {
    const local = blob(1, 9);
    const remote = blob(1, 9);
    expect(bindsEqual(local, remote)).toBe(true);
    expect(pickForAuth(local, remote)).toEqual({
      kind: "use",
      parsed: local,
      source: "local",
      writeLocal: false,
    });
  });

  it("conflicts when binds disagree", () => {
    const local = blob(1, 9);
    const remote = blob(2, 8);
    expect(pickForAuth(local, remote)).toEqual({
      kind: "conflict",
      local,
      remote,
    });
  });
});

describe("pickForSensitiveOp", () => {
  it("prefers local over remote", () => {
    const local = blob(1, 9);
    const remote = blob(2, 8);
    expect(pickForSensitiveOp(local, remote)).toBe(local);
  });

  it("falls back to remote", () => {
    const remote = blob(2, 8);
    expect(pickForSensitiveOp(null, remote)).toBe(remote);
  });
});
