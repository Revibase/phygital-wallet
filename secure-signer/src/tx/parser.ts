/**
 * Decode phygital-wallet ("Fjbi") instructions with the SDK's generated parsers
 * (per project direction), producing a TRUSTED summary for the confirmation UI.
 *
 * Depth-2 policy (§19): we identify the instruction, bind the authorizing
 * `authority` account to the authenticated wallet, and — for executeWithAuthority
 * — DECOMPILE the inner compacted instructions so the user sees the real spend.
 * We do NOT hard-block the inner instructions: this key is the on-chain escape
 * hatch by design, so clear-signing (display), not blocking, is the guarantee.
 */

import {
  AccountRole,
  getAddressDecoder,
  type AccountMeta,
  type Address,
  type Instruction,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  parsePhygitalWalletInstruction,
  PhygitalWalletInstruction,
  sliceExecuteRemainingAccounts,
} from "phygital-wallet-sdk";
import {
  describeInnerInstruction,
  describeWalletPolicy,
  type DetailRow,
} from "./clear-sign.js";
import {
  isSignerIndex,
  isWritableIndex,
  type DecodedV1Transaction,
  type V1Instruction,
} from "./decode-v1.js";

const addr = getAddressDecoder();
const toAddress = (b: Uint8Array): Address => addr.decode(b);

export interface InnerInstructionSummary {
  programAddress: string;
  accounts: string[];
  dataLength: number;
  /** Human title, e.g. "Send 1 SOL". */
  title: string;
  details: DetailRow[];
}

export interface ParsedInstructionSummary {
  kind: PhygitalWalletInstruction;
  /** The instruction's `authority` account (owner), if the kind has one. */
  authority: string | null;
  /** The phygital token account referenced by the instruction, if present. */
  phygitalToken: string | null;
  /** Decoded inner spend for executeWithAuthority (clear-signing), else null. */
  inner: InnerInstructionSummary[] | null;
  /** Extra trusted rows (policy caps, clear warnings, etc.). */
  details: DetailRow[];
}

function roleFor(tx: DecodedV1Transaction, i: number): AccountRole {
  const signer = isSignerIndex(tx.header, i);
  const writable = isWritableIndex(tx.header, tx.staticAccounts.length, i);
  if (signer && writable) return AccountRole.WRITABLE_SIGNER;
  if (signer) return AccountRole.READONLY_SIGNER;
  if (writable) return AccountRole.WRITABLE;
  return AccountRole.READONLY;
}

/** Build a Kit Instruction from a decoded v1 instruction + the tx's static accounts. */
export function toKitInstruction(
  tx: DecodedV1Transaction,
  ix: V1Instruction,
): Instruction & { accounts: AccountMeta[]; data: ReadonlyUint8Array } {
  const accounts: AccountMeta[] = [];
  for (const idx of ix.accountIndexes) {
    accounts.push({
      address: toAddress(tx.staticAccounts[idx]!),
      role: roleFor(tx, idx),
    });
  }
  return {
    programAddress: toAddress(tx.staticAccounts[ix.programIdIndex]!),
    accounts,
    data: ix.data as ReadonlyUint8Array,
  };
}

function summarizeInner(
  compactInstructions: ReadonlyArray<{
    programIdIndex: number;
    accountIndexes: ReadonlyUint8Array;
    data: ReadonlyUint8Array;
  }>,
  remaining: readonly AccountMeta[],
): InnerInstructionSummary[] {
  // Compact indices are relative to remaining only (on-chain ctx.remaining_accounts).
  const out: InnerInstructionSummary[] = [];
  for (const ci of compactInstructions) {
    const prog = remaining[ci.programIdIndex];
    if (!prog) throw new Error("inner program index out of range");
    const accounts: string[] = [];
    for (const ai of ci.accountIndexes) {
      const meta = remaining[ai];
      if (!meta) throw new Error("inner account index out of range");
      accounts.push(meta.address);
    }
    const data = Uint8Array.from(ci.data);
    const cleared = describeInnerInstruction(prog.address, accounts, data);
    out.push({
      programAddress: prog.address,
      accounts,
      dataLength: data.length,
      title: cleared.title,
      details: cleared.details,
    });
  }
  return out;
}

function baseSummary(
  kind: PhygitalWalletInstruction,
  authority: string | null,
  phygitalToken: string | null,
  inner: InnerInstructionSummary[] | null,
  details: DetailRow[] = [],
): ParsedInstructionSummary {
  return { kind, authority, phygitalToken, inner, details };
}

/** Parse a single instruction into a trusted display summary. */
export function parseInstruction(
  tx: DecodedV1Transaction,
  ix: V1Instruction,
): ParsedInstructionSummary {
  const kit = toKitInstruction(tx, ix);
  const parsed = parsePhygitalWalletInstruction(kit);
  const A = parsed.accounts as Record<string, { address: string } | undefined>;
  const authority = A["authority"]?.address ?? null;
  const phygitalToken = A["phygitalToken"]?.address ?? null;

  switch (parsed.instructionType) {
    case PhygitalWalletInstruction.ExecuteWithAuthority: {
      const remaining = sliceExecuteRemainingAccounts(
        parsed.instructionType,
        kit.accounts,
      );
      const inner = summarizeInner(
        parsed.data.compactInstructions,
        remaining,
      );
      return baseSummary(parsed.instructionType, authority, phygitalToken, inner);
    }
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies: {
      const remaining = sliceExecuteRemainingAccounts(
        parsed.instructionType,
        kit.accounts,
      );
      const inner = summarizeInner(
        parsed.data.compactInstructions,
        remaining,
      );
      return baseSummary(parsed.instructionType, authority, phygitalToken, inner, [
        {
          label: "Note",
          value: "Owner spend with on-chain wallet policies applied",
        },
      ]);
    }
    case PhygitalWalletInstruction.ClearAuthority:
      return baseSummary(parsed.instructionType, authority, phygitalToken, null, [
        {
          label: "Effect",
          value: "Removes the owner key from this accessory",
        },
      ]);
    case PhygitalWalletInstruction.SetWalletPolicy:
      return baseSummary(
        parsed.instructionType,
        authority,
        phygitalToken,
        null,
        describeWalletPolicy(parsed.data),
      );
    case PhygitalWalletInstruction.ClearWalletPolicy:
      return baseSummary(parsed.instructionType, authority, phygitalToken, null, [
        {
          label: "Effect",
          value: "Deletes spend caps and program permission overrides",
        },
      ]);
    case PhygitalWalletInstruction.SetAuthority:
      // setAuthority is authorized by the accessory passkey + paymaster payer,
      // NOT by an ed25519 authority signer. The owner is not a signer here.
      return baseSummary(parsed.instructionType, null, phygitalToken, null);
    default:
      throw new Error("unsupported instruction");
  }
}
