/**
 * Decode phygital-wallet instructions with the SDK's generated parsers
 * (per project direction), producing a TRUSTED summary for the confirmation UI.
 *
 * Depth-2 policy (§19): we identify the instruction, bind the authorizing
 * `authority` account to the authenticated wallet, and — for executeWithAuthority
 * — DECOMPILE the inner compacted instructions so the user sees the real spend.
 * We do NOT hard-block the inner instructions: this key is the on-chain escape
 * hatch by design, so clear-signing (display), not blocking, is the guarantee.
 */

import {
  type AccountMeta,
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

/** Parse a single kit instruction into a trusted display summary. */
export function parseInstruction(
  ix: Instruction & {
    accounts?: readonly AccountMeta[];
    data?: ReadonlyUint8Array;
  },
): ParsedInstructionSummary {
  const kit = {
    programAddress: ix.programAddress,
    accounts: [...(ix.accounts ?? [])],
    data: (ix.data ?? new Uint8Array()) as ReadonlyUint8Array,
  };
  const parsed = parsePhygitalWalletInstruction(kit);

  switch (parsed.instructionType) {
    case PhygitalWalletInstruction.ExecuteWithAuthority: {
      const remaining = sliceExecuteRemainingAccounts(
        parsed.instructionType,
        kit.accounts,
      );
      return {
        kind: parsed.instructionType,
        authority: parsed.accounts.authority.address,
        phygitalToken: parsed.accounts.phygitalToken.address,
        inner: summarizeInner(parsed.data.compactInstructions, remaining),
        details: [],
      };
    }
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies: {
      const remaining = sliceExecuteRemainingAccounts(
        parsed.instructionType,
        kit.accounts,
      );
      return {
        kind: parsed.instructionType,
        authority: parsed.accounts.authority.address,
        phygitalToken: parsed.accounts.phygitalToken.address,
        inner: summarizeInner(parsed.data.compactInstructions, remaining),
        details: [
          {
            label: "Note",
            value: "Owner spend with on-chain wallet policies applied",
          },
        ],
      };
    }
    case PhygitalWalletInstruction.ClearAuthority:
      return {
        kind: parsed.instructionType,
        authority: parsed.accounts.authority.address,
        phygitalToken: parsed.accounts.phygitalToken.address,
        inner: null,
        details: [
          {
            label: "Effect",
            value: "Removes the owner key from this accessory",
          },
        ],
      };
    case PhygitalWalletInstruction.SetWalletPolicy:
      return {
        kind: parsed.instructionType,
        authority: parsed.accounts.authority.address,
        phygitalToken: parsed.accounts.phygitalToken.address,
        inner: null,
        details: describeWalletPolicy(parsed.data),
      };
    case PhygitalWalletInstruction.ClearWalletPolicy:
      return {
        kind: parsed.instructionType,
        authority: parsed.accounts.authority.address,
        phygitalToken: parsed.accounts.phygitalToken.address,
        inner: null,
        details: [
          {
            label: "Effect",
            value: "Deletes spend caps and program permission overrides",
          },
        ],
      };
    case PhygitalWalletInstruction.SetAuthority:
      // Authorized by accessory passkey + paymaster payer — not ed25519 authority.
      return {
        kind: parsed.instructionType,
        authority: null,
        phygitalToken: parsed.accounts.phygitalToken.address,
        inner: null,
        details: [],
      };
    case PhygitalWalletInstruction.Execute:
      return {
        kind: parsed.instructionType,
        authority: null,
        phygitalToken: parsed.accounts.phygitalToken.address,
        inner: null,
        details: [],
      };
    default: {
      const _exhaustive: never = parsed;
      void _exhaustive;
      throw new Error("unsupported instruction");
    }
  }
}
