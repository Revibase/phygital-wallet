/**
 * Decode verifier `/sign` wire txs (execute + config).
 * Keep aligned with workers/api/src/verifier/decode-tx.ts.
 */
import {
  AccountRole,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  getTransactionDecoder,
  type AccountMeta,
  type Address,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PhygitalWalletInstruction,
  parsePhygitalWalletInstruction,
} from "phygital-wallet-sdk";

import { COMPUTE_BUDGET_PROGRAM } from "./policy.js";

const SECP256R1_PROGRAM = "Secp256r1SigVerify1111111111111111111111111";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const base64Encoder = getBase64Encoder();
const txDecoder = getTransactionDecoder();
const messageDecoder = getCompiledTransactionMessageDecoder();

const TOP_LEVEL_OK = new Set<string>([
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  MEMO_PROGRAM,
]);

function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

type WalletIx = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

function asWalletInstruction(ix: Instruction): WalletIx {
  if (!ix.data?.length) {
    throw coded("Phygital-wallet instruction missing data", "invalid_transaction");
  }
  if (!ix.accounts) {
    throw coded(
      "Phygital-wallet instruction missing accounts",
      "invalid_transaction",
    );
  }
  return ix as WalletIx;
}

function expandExecuteInner(
  ix: WalletIx,
  parsed: ReturnType<typeof parsePhygitalWalletInstruction>,
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

function parseWalletTopLevel(ix: Instruction): {
  kind: SignTxKind;
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
      "unexpected_instruction",
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
        verifier: String(parsed.accounts.verifier.address),
        phygitalToken: String(parsed.accounts.phygitalToken.address),
        instructions: [ix],
      };
    default:
      throw coded(
        "Unexpected phygital-wallet instruction",
        "unexpected_instruction",
      );
  }
}

/** Kit `AccountRole` is 0–3; preview JSON may send number or numeric string. */
function coerceAccountRole(role: string | number | undefined): AccountRole {
  const n = typeof role === "number" ? role : Number(role);
  if (Number.isInteger(n) && n >= 0 && n <= 3) return n as AccountRole;
  return AccountRole.READONLY;
}

export type SignTxKind = "execute" | "config";

export type DecodedSignTx = {
  messageBytes: Uint8Array;
  verifier: string;
  phygitalToken: string;
  instructions: Instruction[];
  kind: SignTxKind;
};

export function decodeWireTransaction(base64Tx: string): DecodedSignTx {
  const bytes = new Uint8Array(base64Encoder.encode(base64Tx));
  const tx = txDecoder.decode(bytes);
  const compiled = messageDecoder.decode(tx.messageBytes);
  const topLevel = getInstructionsFromCompiledTransactionMessage(compiled);

  let kind: SignTxKind | null = null;
  let phygitalToken: string | null = null;
  let verifier: string | null = null;
  let inner: Instruction[] = [];

  for (const ix of topLevel) {
    const program = String(ix.programAddress);
    if (!TOP_LEVEL_OK.has(program)) {
      throw coded(
        `Unexpected top-level program ${program}`,
        "unexpected_instruction",
      );
    }

    if (program !== PHYGITAL_WALLET_PROGRAM_ADDRESS) continue;

    const parsed = parseWalletTopLevel(ix);
    if (kind) {
      throw coded(
        "Transaction mixes multiple phygital-wallet instructions",
        "unexpected_instruction",
      );
    }
    kind = parsed.kind;
    verifier = parsed.verifier;
    phygitalToken = parsed.phygitalToken;
    inner = parsed.instructions;
  }

  if (!kind || !phygitalToken || !verifier) {
    throw coded(
      "Transaction missing phygital-wallet execute or config instruction",
      "unexpected_instruction",
    );
  }

  return {
    messageBytes: new Uint8Array(tx.messageBytes),
    verifier,
    phygitalToken,
    instructions: inner,
    kind,
  };
}

export function instructionFromJson(raw: {
  programAddress: string;
  accounts?: { address: string; role?: string | number }[];
  data?: string;
}): Instruction {
  const dataB64 = raw.data ?? "";
  const data =
    dataB64.length > 0
      ? new Uint8Array(base64Encoder.encode(dataB64))
      : new Uint8Array();
  return {
    programAddress: raw.programAddress as Address,
    accounts: (raw.accounts ?? []).map((a) => ({
      address: a.address as Address,
      role: coerceAccountRole(a.role),
    })),
    data,
  } satisfies Instruction;
}
