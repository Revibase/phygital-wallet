/**
 * Decode paymaster `/sign` wire txs.
 *
 * Validates a fee-sponsored transaction's shape and extracts its fee payer and
 * phygital token. Every phygital-wallet instruction is fee-sponsorable EXCEPT
 * `executeWithAuthorityUsingPolicies` (preview/simulation only).
 *
 * We do NOT decode each instruction's payload. The only inner detail we need is
 * whether the tx is a fee-balance TOP-UP (SOL → accumulator, wrapped in an
 * `execute`), so it can bypass the prepaid-balance gate — otherwise an empty
 * wallet could never fund its own fees. `phygitalToken` is read from a fixed
 * account slot per instruction.
 */
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  getTransactionDecoder,
  AccountRole,
  type Address,
  type AccountMeta,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  parseExecuteInstruction,
  identifyPhygitalWalletInstruction,
  PhygitalWalletInstruction,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  parseExecuteWithAuthorityInstruction,
  parseClearAuthorityInstruction,
  parseClearWalletPolicyInstruction,
  parseSetAuthorityInstruction,
  parseSetWalletPolicyInstruction,
} from "phygital-wallet-sdk";

import { MEMO_PROGRAM_ADDRESS, SYSTEM_PROGRAM_ADDRESS } from "@/fees/constants";
import { coded } from "@/shared/errors";
import {
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
} from "@/transactions/constants";

const base64Encoder = getBase64Encoder();
const txDecoder = getTransactionDecoder();
const messageDecoder = getCompiledTransactionMessageDecoder();

/** First remaining (compact-CPI) account slot for the execute variants. */
const EXECUTE_REMAINING_OFFSET = 8;
const EXECUTE_WITH_AUTHORITY_REMAINING_OFFSET = 7;

const TOP_LEVEL_OK = new Set<string>([
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  MEMO_PROGRAM_ADDRESS,
]);

/** Top-level programs allowed on `/sign` wire txs (no durable nonce). */
function assertTopLevelInstructionAllowed(ix: Instruction): void {
  const program = String(ix.programAddress);
  if (!TOP_LEVEL_OK.has(program)) {
    throw coded(
      `Unexpected top-level program ${program}`,
      "unexpected_instruction",
    );
  }
}

type WalletIx = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

function asWalletInstruction(ix: Instruction): WalletIx {
  if (!ix.data?.length) {
    throw coded(
      "Phygital-wallet instruction missing data",
      "invalid_transaction",
    );
  }
  if (!ix.accounts) {
    throw coded(
      "Phygital-wallet instruction missing accounts",
      "invalid_transaction",
    );
  }
  return ix as WalletIx;
}

/**
 * True when every inner instruction is a SOL transfer to the accumulator (plus
 * optional memo) — i.e. a fee-balance top-up, which bypasses the balance gate.
 */
function isFeeBalanceTopUpIntent(
  instructions: readonly Instruction[],
  accumulator: string,
): boolean {
  if (!accumulator || instructions.length === 0) return false;
  let sawTransfer = false;
  for (const ix of instructions) {
    const program = String(ix.programAddress);
    if (program === MEMO_PROGRAM_ADDRESS) continue;
    if (program !== SYSTEM_PROGRAM_ADDRESS) return false;
    // System Transfer: discriminator 2, destination is accounts[1].
    if (ix.data?.[0] !== 2) return false;
    const dest = ix.accounts?.[1]?.address;
    if (!dest || dest !== accumulator) return false;
    sawTransfer = true;
  }
  return sawTransfer;
}

/** Flatten an execute variant's compact CPI payload for the top-up scan. */
function expandCompactInstructions(
  compactInstructions: readonly {
    programIdIndex: number;
    accountIndexes: ReadonlyUint8Array | number[];
    data: ReadonlyUint8Array | number[];
  }[],
  remainingAddresses: readonly Address[],
): Instruction[] {
  return compactInstructions.map((ci) => {
    const programAddress = remainingAddresses[ci.programIdIndex];
    if (!programAddress) {
      throw coded(
        "Compact instruction program index out of range",
        "invalid_transaction",
      );
    }
    return {
      programAddress,
      accounts: [...ci.accountIndexes].map((idx) => {
        const address = remainingAddresses[idx];
        if (!address) {
          throw coded(
            "Compact instruction account index out of range",
            "invalid_transaction",
          );
        }
        return { address, role: AccountRole.READONLY };
      }),
      data: new Uint8Array(ci.data),
    } satisfies Instruction;
  });
}

/**
 * Resolve `phygitalToken` and whether the tx is a fee-balance top-up, without
 * decoding instruction payloads beyond the execute variants (the only ones that
 * wrap compact CPI, hence the only ones a top-up can hide in).
 */
function resolveWalletInstruction(
  walletIx: WalletIx,
  ixType: PhygitalWalletInstruction,
  accumulator: string,
): { phygitalToken: string; isFeePayingInstruction: boolean } {
  switch (ixType) {
    case PhygitalWalletInstruction.Execute: {
      const parsed = parseExecuteInstruction(walletIx);
      const inner = expandCompactInstructions(
        parsed.data.compactInstructions,
        walletIx.accounts.slice(EXECUTE_REMAINING_OFFSET).map((a) => a.address),
      );
      return {
        phygitalToken: parsed.accounts.phygitalToken.address,
        isFeePayingInstruction: isFeeBalanceTopUpIntent(inner, accumulator),
      };
    }
    case PhygitalWalletInstruction.ExecuteWithAuthority: {
      const parsed = parseExecuteWithAuthorityInstruction(walletIx);
      const inner = expandCompactInstructions(
        parsed.data.compactInstructions,
        walletIx.accounts
          .slice(EXECUTE_WITH_AUTHORITY_REMAINING_OFFSET)
          .map((a) => a.address),
      );
      return {
        phygitalToken: parsed.accounts.phygitalToken.address,
        isFeePayingInstruction: isFeeBalanceTopUpIntent(inner, accumulator),
      };
    }
    case PhygitalWalletInstruction.SetAuthority: {
      const expanded = parseSetAuthorityInstruction(walletIx);
      return {
        phygitalToken: expanded.accounts.phygitalToken.address,
        isFeePayingInstruction: false,
      };
    }
    case PhygitalWalletInstruction.SetWalletPolicy: {
      const expanded = parseSetWalletPolicyInstruction(walletIx);
      return {
        phygitalToken: expanded.accounts.phygitalToken.address,
        isFeePayingInstruction: false,
      };
    }
    case PhygitalWalletInstruction.ClearAuthority: {
      const expanded = parseClearAuthorityInstruction(walletIx);
      return {
        phygitalToken: expanded.accounts.phygitalToken.address,
        isFeePayingInstruction: false,
      };
    }
    case PhygitalWalletInstruction.ClearWalletPolicy: {
      const expanded = parseClearWalletPolicyInstruction(walletIx);
      return {
        phygitalToken: expanded.accounts.phygitalToken.address,
        isFeePayingInstruction: false,
      };
    }
    default: {
      throw coded(
        "executeWithAuthorityUsingPolicies is not fee-sponsored",
        "unexpected_instruction",
      );
    }
  }
}

export type DecodedSignTx = {
  messageBytes: Uint8Array;
  /** Transaction fee payer — must be a key this paymaster can sign for. */
  feePayer: string;
  phygitalToken: string;
  /** A fee-balance top-up — exempt from the prepaid-balance gate. */
  isFeePayingInstruction: boolean;
};

export function decodeWireTransaction(
  base64Tx: string,
  accumulator: string,
): DecodedSignTx {
  const bytes = new Uint8Array(base64Encoder.encode(base64Tx));
  const tx = txDecoder.decode(bytes);
  const compiled = messageDecoder.decode(tx.messageBytes);

  const feePayer = compiled.staticAccounts[0];
  if (!feePayer) {
    throw coded("Transaction has no fee payer", "invalid_transaction");
  }

  const topLevel = getInstructionsFromCompiledTransactionMessage(compiled);

  let resolved: {
    phygitalToken: string;
    isFeePayingInstruction: boolean;
  } | null = null;

  for (const ix of topLevel) {
    assertTopLevelInstructionAllowed(ix);

    if (String(ix.programAddress) !== PHYGITAL_WALLET_PROGRAM_ADDRESS) continue;
    if (resolved) {
      throw coded(
        "Transaction mixes multiple phygital-wallet instructions",
        "unexpected_instruction",
      );
    }
    const walletIx = asWalletInstruction(ix);
    resolved = resolveWalletInstruction(
      walletIx,
      identifyPhygitalWalletInstruction(walletIx),
      accumulator,
    );
  }

  if (!resolved) {
    throw coded(
      "Transaction missing a phygital-wallet instruction",
      "unexpected_instruction",
    );
  }

  return {
    messageBytes: new Uint8Array(tx.messageBytes),
    feePayer: String(feePayer),
    phygitalToken: resolved.phygitalToken,
    isFeePayingInstruction: resolved.isFeePayingInstruction,
  };
}
