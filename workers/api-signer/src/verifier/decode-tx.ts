/**
 * Decode verifier `/sign` wire txs (execute + config).
 */
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  getTransactionDecoder,
  isAdvanceNonceAccountInstruction,
  AccountRole,
  type AccountMeta,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  parsePhygitalWalletInstruction,
  PhygitalWalletInstruction,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { MEMO_PROGRAM_ADDRESS } from "@/fees/constants";
import {
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
  SYSTEM_PROGRAM,
} from "@/verifier/constants";

const base64Encoder = getBase64Encoder();
const txDecoder = getTransactionDecoder();
const messageDecoder = getCompiledTransactionMessageDecoder();

const TOP_LEVEL_OK = new Set<string>([
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  MEMO_PROGRAM_ADDRESS,
]);

/** Config txs are stricter than execute: no memo, no nonce, no siblings. */
const CONFIG_TOP_LEVEL_OK = new Set<string>([
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
]);

function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * Top-level programs allowed on `/sign` wire txs.
 * System Program is only allowed for AdvanceNonceAccount (durable nonce outer ix).
 */
export function assertTopLevelInstructionAllowed(ix: Instruction): void {
  const program = String(ix.programAddress);
  if (program === SYSTEM_PROGRAM) {
    if (!isAdvanceNonceAccountInstruction(ix)) {
      throw coded(
        "Unexpected system program instruction at top level",
        "unexpected_instruction"
      );
    }
    return;
  }
  if (!TOP_LEVEL_OK.has(program)) {
    throw coded(
      `Unexpected top-level program ${program}`,
      "unexpected_instruction"
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
      "invalid_transaction"
    );
  }
  if (!ix.accounts) {
    throw coded(
      "Phygital-wallet instruction missing accounts",
      "invalid_transaction"
    );
  }
  return ix as WalletIx;
}

function expandExecuteInner(
  ix: WalletIx,
  parsed: ReturnType<typeof parsePhygitalWalletInstruction>
): Instruction[] {
  if (parsed.instructionType !== PhygitalWalletInstruction.Execute) {
    throw coded("Expected execute instruction", "invalid_transaction");
  }

  // Fixed execute metas are accounts 0–7; remaining are compact CPI metas.
  const remainingAddresses = ix.accounts.slice(8).map((a) => a.address);
  return parsed.data.compactInstructions.map((ci) => {
    const programAddress = remainingAddresses[ci.programIdIndex];
    if (!programAddress) {
      throw coded(
        "Compact instruction program index out of range",
        "invalid_transaction"
      );
    }
    return {
      programAddress,
      accounts: [...ci.accountIndexes].map((idx) => {
        const address = remainingAddresses[idx];
        if (!address) {
          throw coded(
            "Compact instruction account index out of range",
            "invalid_transaction"
          );
        }
        return { address, role: AccountRole.READONLY };
      }),
      data: new Uint8Array(ci.data),
    } satisfies Instruction;
  });
}

function parseWalletTopLevel(ix: Instruction): {
  kind: SignTxKind;
  configAction?: ConfigAction;
  verifier: string;
  phygitalToken: string;
  instructions: Instruction[];
} {
  const walletIx = asWalletInstruction(ix);
  let parsed;
  try {
    parsed = parsePhygitalWalletInstruction(walletIx);
  } catch {
    throw coded(
      "Unexpected phygital-wallet instruction",
      "unexpected_instruction"
    );
  }

  switch (parsed.instructionType) {
    case PhygitalWalletInstruction.Execute:
      return {
        kind: "execute",
        verifier: String(parsed.accounts.verifier.address),
        phygitalToken: String(parsed.accounts.phygitalToken.address),
        instructions: expandExecuteInner(walletIx, parsed),
      };
    case PhygitalWalletInstruction.SetTokenVerifier:
    case PhygitalWalletInstruction.ClearTokenVerifier:
    case PhygitalWalletInstruction.SetRecoveryWallet:
    case PhygitalWalletInstruction.ClearRecoveryWallet:
      return {
        kind: "config",
        configAction: CONFIG_ACTIONS[parsed.instructionType],
        verifier: String(parsed.accounts.verifier.address),
        phygitalToken: String(parsed.accounts.phygitalToken.address),
        instructions: [ix],
      };
    default:
      throw coded(
        "Unexpected phygital-wallet instruction",
        "unexpected_instruction"
      );
  }
}

export type SignTxKind = "execute" | "config";

/** Which config change a config-kind tx performs (for audit logging). */
export type ConfigAction =
  | "set_token_verifier"
  | "clear_token_verifier"
  | "set_recovery_wallet"
  | "clear_recovery_wallet";

const CONFIG_ACTIONS: Partial<Record<PhygitalWalletInstruction, ConfigAction>> =
  {
    [PhygitalWalletInstruction.SetTokenVerifier]: "set_token_verifier",
    [PhygitalWalletInstruction.ClearTokenVerifier]: "clear_token_verifier",
    [PhygitalWalletInstruction.SetRecoveryWallet]: "set_recovery_wallet",
    [PhygitalWalletInstruction.ClearRecoveryWallet]: "clear_recovery_wallet",
  };

export type DecodedSignTx = {
  messageBytes: Uint8Array;
  /** Verifier co-signer — must match a key in the signer Worker. */
  verifier: string;
  phygitalToken: string;
  instructions: Instruction[];
  kind: SignTxKind;
  /** Present only when kind === "config". */
  configAction?: ConfigAction;
};

export function decodeWireTransaction(base64Tx: string): DecodedSignTx {
  const bytes = new Uint8Array(base64Encoder.encode(base64Tx));
  const tx = txDecoder.decode(bytes);
  const compiled = messageDecoder.decode(tx.messageBytes);

  const topLevel = getInstructionsFromCompiledTransactionMessage(compiled);

  let kind: SignTxKind | null = null;
  let configAction: ConfigAction | undefined;
  let phygitalToken: string | null = null;
  let verifier: string | null = null;
  let inner: Instruction[] = [];
  const topLevelPrograms: string[] = [];

  for (const ix of topLevel) {
    assertTopLevelInstructionAllowed(ix);

    const program = String(ix.programAddress);
    topLevelPrograms.push(program);
    if (program !== PHYGITAL_WALLET_PROGRAM_ADDRESS) continue;

    const parsed = parseWalletTopLevel(ix);
    if (kind) {
      throw coded(
        "Transaction mixes multiple phygital-wallet instructions",
        "unexpected_instruction"
      );
    }
    kind = parsed.kind;
    configAction = parsed.configAction;
    verifier = parsed.verifier;
    phygitalToken = parsed.phygitalToken;
    inner = parsed.instructions;
  }

  if (!kind || !phygitalToken || !verifier) {
    throw coded(
      "Transaction missing phygital-wallet execute or config instruction",
      "unexpected_instruction"
    );
  }

  // Config is authorized by a grant over its canonical intent, which does not
  // cover sibling instructions — so a config tx may contain ONLY the config ix,
  // its owner Secp256r1 passkey proof, and Compute Budget. Anything else (memo,
  // a durable nonce, a stray transfer) would be co-signed under that grant, so
  // reject it. The proof must be present (the on-chain program requires it).
  if (kind === "config") {
    for (const program of topLevelPrograms) {
      if (!CONFIG_TOP_LEVEL_OK.has(program)) {
        throw coded(
          `Config transaction has an unexpected instruction (${program})`,
          "unexpected_instruction"
        );
      }
    }
    if (!topLevelPrograms.includes(SECP256R1_PROGRAM)) {
      throw coded(
        "Config transaction is missing the owner passkey proof",
        "unexpected_instruction"
      );
    }
  }

  return {
    messageBytes: new Uint8Array(tx.messageBytes),
    verifier,
    phygitalToken,
    instructions: inner,
    kind,
    configAction,
  };
}
