import { describe, expect, it } from "vitest";
import { AccountRole, getAddressDecoder, type Address } from "@solana/kit";
import { compileV1, encodeV1Wire } from "../testing/encode-v1.js";
import { decodeV1Transaction, TxError } from "./decode-v1.js";

const addr = getAddressDecoder();
function randomAddress(): Address {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return addr.decode(b);
}

function sampleWire(config?: Parameters<typeof compileV1>[0]["config"]) {
  const feePayer = randomAddress();
  const prog = randomAddress();
  const acctA = randomAddress();
  const compiled = compileV1({
    feePayer,
    instructions: [
      { programAddress: prog, accounts: [{ address: acctA, role: AccountRole.WRITABLE }], data: Uint8Array.from([1, 2, 3]) },
    ],
    ...(config ? { config } : {}),
  });
  return encodeV1Wire(compiled);
}

describe("decodeV1Transaction", () => {
  it("round-trips a v1 transaction with config", () => {
    const wire = sampleWire({ computeUnitLimit: 200_000, priorityFeeLamports: 5_000n, heapBytes: 65_536 });
    const tx = decodeV1Transaction(wire);
    expect(tx.version).toBe(1);
    expect(tx.config.computeUnitLimit).toBe(200_000);
    expect(tx.config.priorityFeeLamports).toBe(5_000n);
    expect(tx.config.heapBytes).toBe(65_536);
    expect(tx.instructions).toHaveLength(1);
    expect([...tx.instructions[0]!.data]).toEqual([1, 2, 3]);
    // messageBytes is exactly the pre-signature portion.
    expect(tx.messageBytes.length).toBe(wire.length - tx.header.numRequiredSignatures * 64);
  });

  it("rejects legacy/v0 (wrong version byte)", () => {
    const wire = sampleWire();
    wire[0] = 0x80; // v0
    expect(() => decodeV1Transaction(wire)).toThrow(/not a v1/);
    wire[0] = 0x01; // legacy-ish
    expect(() => decodeV1Transaction(wire)).toThrow(/not a v1/);
  });

  it("rejects oversized transactions before parsing", () => {
    const big = new Uint8Array(5000);
    big[0] = 129;
    expect(() => decodeV1Transaction(big)).toThrow(/too large/);
  });

  it("rejects unknown config bits", () => {
    const wire = sampleWire();
    // configMask is at offset 4 (after version + 3 header bytes). Set reserved bit 5.
    wire[4] = wire[4]! | 0b0010_0000;
    expect(() => decodeV1Transaction(wire)).toThrow(/unknown config bits/);
  });

  it("rejects trailing bytes", () => {
    const wire = sampleWire();
    const extended = new Uint8Array(wire.length + 1);
    extended.set(wire);
    expect(() => decodeV1Transaction(extended)).toThrow(/trailing/);
  });

  it("rejects truncation", () => {
    const wire = sampleWire();
    expect(() => decodeV1Transaction(wire.subarray(0, wire.length - 10))).toThrow(TxError);
  });

  it("rejects a compute-unit limit above the ceiling", () => {
    const wire = sampleWire({ computeUnitLimit: 2_000_000 });
    expect(() => decodeV1Transaction(wire)).toThrow(/compute unit limit too high/);
  });
});
