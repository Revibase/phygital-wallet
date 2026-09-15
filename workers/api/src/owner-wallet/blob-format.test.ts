import { describe, expect, it } from "vitest";

import {
  base64UrlToBytes,
  bytesToBase64Url,
  isCredentialIdHash,
  parseOwnerBlobHeader,
  sha256Hex,
} from "./blob-format";

/** Minimal valid SSW1 layout for structural tests. */
function buildBlob(credLen = 16): Uint8Array {
  const cred = new Uint8Array(credLen).fill(7);
  const parts: number[] = [];
  parts.push(0x53, 0x53, 0x57, 0x31, 1);
  for (let i = 0; i < 32; i++) parts.push(1);
  parts.push((credLen >> 8) & 0xff, credLen & 0xff);
  for (const b of cred) parts.push(b);
  for (let i = 0; i < 32; i++) parts.push(2); // salt
  for (let i = 0; i < 12; i++) parts.push(3); // iv
  parts.push(0, 48); // ct len
  for (let i = 0; i < 48; i++) parts.push(4);
  return Uint8Array.from(parts);
}

describe("owner wallet blob format", () => {
  it("round-trips base64url", () => {
    const raw = buildBlob();
    const b64 = bytesToBase64Url(raw);
    expect(base64UrlToBytes(b64, 1024)).toEqual(raw);
  });

  it("parses a valid header", () => {
    const raw = buildBlob(8);
    const h = parseOwnerBlobHeader(raw);
    expect(h.version).toBe(1);
    expect(h.publicKey).toHaveLength(32);
    expect(h.credentialId).toEqual(new Uint8Array(8).fill(7));
  });

  it("rejects bad magic", () => {
    const raw = buildBlob();
    raw[0] = 0;
    expect(() => parseOwnerBlobHeader(raw)).toThrow();
  });

  it("hashes credential ids to 64 hex chars", async () => {
    const hex = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(isCredentialIdHash(hex)).toBe(true);
    expect(isCredentialIdHash("nope")).toBe(false);
  });
});
