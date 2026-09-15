/**
 * v1 transaction COMPILER + ENCODER — TEST/DEMO ONLY.
 *
 * @solana/kit@8.1.0 cannot emit v1, so tests (and the parent-demo) build v1 wire
 * bytes here to exercise the real decoder→policy→fjbi path. This module is never
 * imported by `main.ts`, so it is tree-shaken out of the production signer bundle.
 * It is NOT security-critical and deliberately not hardened.
 */

import {
  AccountRole,
  getAddressEncoder,
  type AccountMeta,
  type Address,
  type Instruction,
  type ReadonlyUint8Array,
} from "@solana/kit";

const addrEnc = getAddressEncoder();
const enc32 = (a: Address): Uint8Array => new Uint8Array(addrEnc.encode(a));
const isSigner = (r: AccountRole) => (r & 2) !== 0;
const isWritable = (r: AccountRole) => (r & 1) !== 0;

export interface CompileInput {
  feePayer: Address;
  instructions: Array<
    Instruction & {
      accounts?: readonly AccountMeta[];
      data?: ReadonlyUint8Array;
    }
  >;
  lifetimeToken?: Uint8Array; // 32
  config?: {
    priorityFeeLamports?: bigint;
    computeUnitLimit?: number;
    loadedAccountsDataBytes?: number;
    heapBytes?: number;
  };
  /** Override signatures (default: zero-filled per required signer). */
  signatures?: Uint8Array[];
}

interface Acc {
  address: Address;
  signer: boolean;
  writable: boolean;
}

/** Compile kit instructions into ordered static accounts + v1 instructions. */
export function compileV1(input: CompileInput) {
  const map = new Map<string, Acc>();
  const upsert = (address: Address, signer: boolean, writable: boolean) => {
    const k = address as string;
    const prev = map.get(k);
    if (prev) {
      prev.signer ||= signer;
      prev.writable ||= writable;
    } else {
      map.set(k, { address, signer, writable });
    }
  };

  upsert(input.feePayer, true, true);
  for (const ix of input.instructions) {
    for (const m of ix.accounts ?? [])
      upsert(m.address, isSigner(m.role), isWritable(m.role));
    upsert(ix.programAddress as Address, false, false); // program id: readonly non-signer
  }

  const all = [...map.values()];
  const wSigner = all.filter(
    (a) => a.signer && a.writable && a.address !== input.feePayer,
  );
  const rSigner = all.filter((a) => a.signer && !a.writable);
  const wNon = all.filter((a) => !a.signer && a.writable);
  const rNon = all.filter((a) => !a.signer && !a.writable);
  const feePayerAcc = map.get(input.feePayer as string)!;
  const ordered = [feePayerAcc, ...wSigner, ...rSigner, ...wNon, ...rNon];

  const numRequiredSignatures = 1 + wSigner.length + rSigner.length;
  const numReadonlySigned = rSigner.length;
  const numReadonlyUnsigned = rNon.length;

  const indexOf = new Map<string, number>();
  ordered.forEach((a, i) => indexOf.set(a.address as string, i));

  const v1Instructions = input.instructions.map((ix) => ({
    programIdIndex: indexOf.get(ix.programAddress as string)!,
    accountIndexes: Uint8Array.from(
      (ix.accounts ?? []).map((m) => indexOf.get(m.address as string)!),
    ),
    data: new Uint8Array(ix.data ?? new Uint8Array()),
  }));

  return {
    header: { numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned },
    staticAccounts: ordered.map((a) => enc32(a.address)),
    lifetimeToken: input.lifetimeToken ?? new Uint8Array(32).fill(7),
    config: input.config ?? {},
    instructions: v1Instructions,
    signatures:
      input.signatures ??
      Array.from({ length: numRequiredSignatures }, () => new Uint8Array(64)),
  };
}

function buildConfig(config: NonNullable<CompileInput["config"]>) {
  let mask = 0;
  const values: number[] = [];
  const pushU32 = (n: number) => {
    values.push(
      n & 0xff,
      (n >>> 8) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 24) & 0xff,
    );
  };
  if (config.priorityFeeLamports !== undefined) {
    mask |= 0b11;
    let v = config.priorityFeeLamports;
    for (let i = 0; i < 8; i++) {
      values.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  if (config.computeUnitLimit !== undefined) {
    mask |= 1 << 2;
    pushU32(config.computeUnitLimit);
  }
  if (config.loadedAccountsDataBytes !== undefined) {
    mask |= 1 << 3;
    pushU32(config.loadedAccountsDataBytes);
  }
  if (config.heapBytes !== undefined) {
    mask |= 1 << 4;
    pushU32(config.heapBytes);
  }
  return { mask, values: Uint8Array.from(values) };
}

/** Serialize a compiled v1 message + signatures to wire bytes. */
export function encodeV1Wire(
  compiled: ReturnType<typeof compileV1>,
): Uint8Array {
  const {
    header,
    staticAccounts,
    lifetimeToken,
    config,
    instructions,
    signatures,
  } = compiled;
  const { mask, values } = buildConfig(config);

  const parts: number[] = [];
  parts.push(129); // version
  parts.push(
    header.numRequiredSignatures,
    header.numReadonlySigned,
    header.numReadonlyUnsigned,
  );
  parts.push(
    mask & 0xff,
    (mask >>> 8) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 24) & 0xff,
  );
  parts.push(...lifetimeToken);
  parts.push(instructions.length);
  parts.push(staticAccounts.length);
  for (const a of staticAccounts) parts.push(...a);
  parts.push(...values);
  // instruction headers
  for (const ix of instructions) {
    parts.push(
      ix.programIdIndex,
      ix.accountIndexes.length,
      ix.data.length & 0xff,
      (ix.data.length >>> 8) & 0xff,
    );
  }
  // instruction payloads
  for (const ix of instructions) {
    parts.push(...ix.accountIndexes);
    parts.push(...ix.data);
  }
  for (const s of signatures) parts.push(...s);
  return Uint8Array.from(parts);
}
