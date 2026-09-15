/**
 * Bounded Solana transaction v1 (SIMD-0385) decoder.
 *
 * WHY hand-rolled (§17, §39): @solana/kit@8.1.0 has MAX_SUPPORTED_TRANSACTION_VERSION=0
 * and cannot decode v1. This parser is deliberately small, allocation-bounded, and
 * has no recursion — it must fail SAFELY on arbitrary attacker bytes (§38). It is
 * the SINGLE source of truth for the transaction; we sign the EXACT `messageBytes`
 * it isolates, never a re-encode, so there is no validation↔signing differential.
 *
 * v1 wire layout (SIMD-0385):
 *   VersionByte(=129) | header(3) | TransactionConfigMask(u32 LE) | lifetime[32] |
 *   NumInstructions(u8) | NumAddresses(u8) | Addresses[N*32] |
 *   ConfigValues[popcount(mask)*4] | InstructionHeaders[M*(u8,u8,u16)] |
 *   InstructionPayloads(accountIdx[..]+data[..] per ix) | Signatures[numReq*64]
 * Signatures are at the TAIL; the signed message is everything before them.
 */

import {
  CONFIG_MASK_KNOWN_BITS,
  MAX_ACCOUNTS_PER_INSTRUCTION,
  MAX_COMPUTE_UNIT_LIMIT,
  MAX_HEAP_BYTES,
  MAX_INSTRUCTIONS,
  MAX_LOADED_ACCOUNTS_DATA_BYTES,
  MAX_PRIORITY_FEE_LAMPORTS,
  MAX_SIGNATURES,
  MAX_STATIC_ACCOUNTS,
  MAX_TX_BYTES,
} from "../constants.js";

export class TxError extends Error {}

export const V1_VERSION_BYTE = 129; // 0x81

export interface V1Header {
  numRequiredSignatures: number;
  numReadonlySigned: number;
  numReadonlyUnsigned: number;
}

export interface V1Config {
  priorityFeeLamports?: bigint;
  computeUnitLimit?: number;
  loadedAccountsDataBytes?: number;
  heapBytes?: number;
}

export interface V1Instruction {
  programIdIndex: number;
  accountIndexes: Uint8Array;
  data: Uint8Array;
}

export interface DecodedV1Transaction {
  version: 1;
  header: V1Header;
  configMask: number;
  config: V1Config;
  lifetimeToken: Uint8Array; // 32
  staticAccounts: Uint8Array[]; // each 32
  instructions: V1Instruction[];
  signatures: Uint8Array[]; // each 64
  /** Exact bytes the Ed25519 signature covers. Sign THESE, unchanged (§22, §39). */
  messageBytes: Uint8Array;
  /** Byte offset where the signatures section begins. */
  signaturesOffset: number;
}

class LeReader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  get offset() {
    return this.o;
  }
  private need(n: number) {
    if (n < 0 || this.o + n > this.b.length) throw new TxError("truncated");
  }
  u8(): number {
    this.need(1);
    return this.b[this.o++]!;
  }
  u16(): number {
    this.need(2);
    return this.b[this.o++]! | (this.b[this.o++]! << 8);
  }
  u32(): number {
    this.need(4);
    const v =
      (this.b[this.o]! |
        (this.b[this.o + 1]! << 8) |
        (this.b[this.o + 2]! << 16) |
        (this.b[this.o + 3]! << 24)) >>>
      0;
    this.o += 4;
    return v;
  }
  u64(): bigint {
    this.need(8);
    let v = 0n;
    for (let i = 0; i < 8; i++) v |= BigInt(this.b[this.o + i]!) << BigInt(8 * i);
    this.o += 8;
    return v;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.b.subarray(this.o, this.o + n).slice();
    this.o += n;
    return out;
  }
  atEnd(): boolean {
    return this.o === this.b.length;
  }
}

/** Decode + structurally validate a v1 transaction. Rejects legacy/v0/other. */
export function decodeV1Transaction(bytes: Uint8Array): DecodedV1Transaction {
  if (bytes.length < 1) throw new TxError("empty");
  if (bytes.length > MAX_TX_BYTES) throw new TxError("too large"); // §32 cap first

  // Version byte distinguishes v1 (0x81) from legacy (msb clear) and v0 (0x80).
  if (bytes[0] !== V1_VERSION_BYTE) throw new TxError("not a v1 transaction");

  const r = new LeReader(bytes);
  r.u8(); // consume version byte

  const header: V1Header = {
    numRequiredSignatures: r.u8(),
    numReadonlySigned: r.u8(),
    numReadonlyUnsigned: r.u8(),
  };
  if (header.numRequiredSignatures < 1 || header.numRequiredSignatures > MAX_SIGNATURES)
    throw new TxError("bad signer count");

  const configMask = r.u32();
  if ((configMask & ~CONFIG_MASK_KNOWN_BITS) !== 0)
    throw new TxError("unknown config bits"); // §20
  // Priority fee occupies bits [0,1] together — both set or both clear.
  const b0 = configMask & 0b01;
  const b1 = (configMask >> 1) & 0b01;
  if (b0 !== b1) throw new TxError("invalid priority-fee mask");

  const lifetimeToken = r.bytes(32);

  const numInstructions = r.u8();
  if (numInstructions > MAX_INSTRUCTIONS) throw new TxError("too many instructions");
  const numAddresses = r.u8();
  if (numAddresses < 1 || numAddresses > MAX_STATIC_ACCOUNTS)
    throw new TxError("bad address count");
  if (header.numRequiredSignatures > numAddresses)
    throw new TxError("signers exceed addresses");
  if (header.numReadonlySigned > header.numRequiredSignatures)
    throw new TxError("bad readonly-signed");
  if (header.numReadonlyUnsigned > numAddresses - header.numRequiredSignatures)
    throw new TxError("bad readonly-unsigned");

  const staticAccounts: Uint8Array[] = [];
  for (let i = 0; i < numAddresses; i++) staticAccounts.push(r.bytes(32));

  // Config values, in mask-bit order, with independent ceilings (§20).
  const config: V1Config = {};
  if (b0 && b1) {
    const fee = r.u64();
    if (fee > MAX_PRIORITY_FEE_LAMPORTS) throw new TxError("priority fee too high");
    config.priorityFeeLamports = fee;
  }
  if (configMask & (1 << 2)) {
    const cu = r.u32();
    if (cu > MAX_COMPUTE_UNIT_LIMIT) throw new TxError("compute unit limit too high");
    config.computeUnitLimit = cu;
  }
  if (configMask & (1 << 3)) {
    const loaded = r.u32();
    if (loaded > MAX_LOADED_ACCOUNTS_DATA_BYTES)
      throw new TxError("loaded accounts data too high");
    config.loadedAccountsDataBytes = loaded;
  }
  if (configMask & (1 << 4)) {
    const heap = r.u32();
    if (heap > MAX_HEAP_BYTES) throw new TxError("heap too high");
    config.heapBytes = heap;
  }

  // Instruction headers (grouped), then payloads (grouped) — SIMD-0385 order.
  const ixHeaders: Array<{ programIdIndex: number; numAccounts: number; numData: number }> = [];
  for (let i = 0; i < numInstructions; i++) {
    const programIdIndex = r.u8();
    const numAccounts = r.u8();
    const numData = r.u16();
    if (programIdIndex >= numAddresses) throw new TxError("bad program index");
    if (numAccounts > MAX_ACCOUNTS_PER_INSTRUCTION) throw new TxError("too many ix accounts");
    ixHeaders.push({ programIdIndex, numAccounts, numData });
  }

  const instructions: V1Instruction[] = [];
  for (const h of ixHeaders) {
    const accountIndexes = r.bytes(h.numAccounts);
    for (const idx of accountIndexes)
      if (idx >= numAddresses) throw new TxError("bad account index");
    const data = r.bytes(h.numData);
    instructions.push({ programIdIndex: h.programIdIndex, accountIndexes, data });
  }

  // Everything before the signatures is the signed message.
  const signaturesOffset = r.offset;
  const messageBytes = bytes.subarray(0, signaturesOffset).slice();

  const signatures: Uint8Array[] = [];
  for (let i = 0; i < header.numRequiredSignatures; i++) signatures.push(r.bytes(64));

  if (!r.atEnd()) throw new TxError("trailing bytes"); // §38 no hidden data

  return {
    version: 1,
    header,
    configMask,
    config,
    lifetimeToken,
    staticAccounts,
    instructions,
    signatures,
    messageBytes,
    signaturesOffset,
  };
}

/** Whether static-account index `i` is a required signer. */
export function isSignerIndex(h: V1Header, i: number): boolean {
  return i < h.numRequiredSignatures;
}

/** Whether static-account index `i` is writable (standard Solana role math). */
export function isWritableIndex(h: V1Header, numAddresses: number, i: number): boolean {
  if (i < h.numRequiredSignatures) {
    return i < h.numRequiredSignatures - h.numReadonlySigned;
  }
  const unsignedIndex = i - h.numRequiredSignatures;
  const totalUnsigned = numAddresses - h.numRequiredSignatures;
  return unsignedIndex < totalUnsigned - h.numReadonlyUnsigned;
}
