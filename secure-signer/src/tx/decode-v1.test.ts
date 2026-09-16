import { describe, expect, it } from "vitest";
import { AccountRole, getAddressDecoder, type Address } from "@solana/kit";
import { encodeV1Wire } from "../testing/encode-v1.js";
import { decodeV1Transaction, TxError } from "./decode-v1.js";

const addr = getAddressDecoder();
function randomAddress(): Address {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return addr.decode(b);
}

function sampleWire(config?: {
  computeUnitLimit?: number;
  priorityFeeLamports?: bigint;
  heapSize?: number;
}) {
  const feePayer = randomAddress();
  const prog = randomAddress();
  const acctA = randomAddress();
  return encodeV1Wire({
    feePayer,
    instructions: [
      {
        programAddress: prog,
        accounts: [{ address: acctA, role: AccountRole.WRITABLE }],
        data: Uint8Array.from([1, 2, 3]),
      },
    ],
    ...(config ? { config } : {}),
  });
}

describe("decodeV1Transaction (kit)", () => {
  it("round-trips a v1 transaction with config", () => {
    const wire = sampleWire({
      computeUnitLimit: 200_000,
      priorityFeeLamports: 5_000n,
      heapSize: 65_536,
    });
    const tx = decodeV1Transaction(wire);
    expect(tx.version).toBe(1);
    expect(tx.message.config?.computeUnitLimit).toBe(200_000);
    expect(tx.message.config?.priorityFeeLamports).toBe(5_000n);
    expect(tx.message.config?.heapSize).toBe(65_536);
    expect(tx.message.instructions).toHaveLength(1);
    expect([...tx.message.instructions[0]!.data!]).toEqual([1, 2, 3]);
    // messageBytes is exactly the pre-signature portion (one required signer).
    expect(tx.messageBytes.length).toBe(wire.length - 64);
  });

  it("rejects legacy/v0 (wrong version)", () => {
    const wire = sampleWire();
    wire[0] = 0x80; // v0
    expect(() => decodeV1Transaction(wire)).toThrow(TxError);
    wire[0] = 0x01; // legacy-ish
    expect(() => decodeV1Transaction(wire)).toThrow(TxError);
  });

  it("rejects oversized transactions before parsing", () => {
    const big = new Uint8Array(5000);
    big[0] = 129;
    expect(() => decodeV1Transaction(big)).toThrow(/too large/);
  });

  it("rejects truncation", () => {
    const wire = sampleWire();
    expect(() => decodeV1Transaction(wire.subarray(0, wire.length - 10))).toThrow(
      TxError,
    );
  });

  it("rejects invalid priority-fee mask bits", () => {
    const wire = sampleWire();
    // configMask at offset 4; set only bit 0 (invalid — both or neither).
    wire[4] = 0b01;
    expect(() => decodeV1Transaction(wire)).toThrow(TxError);
  });
});
