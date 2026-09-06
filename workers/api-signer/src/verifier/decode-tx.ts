import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  getTransactionDecoder,
  AccountRole,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  EXECUTE_DISCRIMINATOR,
  getExecuteInstructionDataDecoder,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { MEMO_PROGRAM_ADDRESS } from "@/fees/constants";
import {
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
} from "@/verifier/constants";

const base64Encoder = getBase64Encoder();
const txDecoder = getTransactionDecoder();
const messageDecoder = getCompiledTransactionMessageDecoder();
const executeDataDecoder = getExecuteInstructionDataDecoder();
const EXECUTE_DISC = new Uint8Array(EXECUTE_DISCRIMINATOR);

const TOP_LEVEL_OK = new Set<string>([
  COMPUTE_BUDGET_PROGRAM,
  SECP256R1_PROGRAM,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  MEMO_PROGRAM_ADDRESS,
]);

function discEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length < b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Kit `AccountRole` is 0–3; preview JSON may send number or numeric string. */
function coerceAccountRole(role: string | number | undefined): AccountRole {
  const n = typeof role === "number" ? role : Number(role);
  if (Number.isInteger(n) && n >= 0 && n <= 3) return n as AccountRole;
  return AccountRole.READONLY;
}

type DecodedSignTx = {
  messageBytes: Uint8Array;
  /** Execute account meta 0 — must match a key in the signer Worker. */
  verifier: string;
  phygitalToken: string;
  instructions: Instruction[];
};

export function decodeWireTransaction(base64Tx: string): DecodedSignTx {
  const bytes = new Uint8Array(base64Encoder.encode(base64Tx));
  const tx = txDecoder.decode(bytes);
  const compiled = messageDecoder.decode(tx.messageBytes);

  const topLevel = getInstructionsFromCompiledTransactionMessage(compiled);

  let phygitalToken: string | null = null;
  let verifier: string | null = null;
  let inner: Instruction[] = [];

  for (const ix of topLevel) {
    const program = String(ix.programAddress);
    if (!TOP_LEVEL_OK.has(program)) {
      throw Object.assign(
        new Error(`Unexpected top-level program ${program}`),
        { code: "unexpected_instruction" },
      );
    }

    const ixData = ix.data ? new Uint8Array(ix.data) : new Uint8Array();
    if (
      program === PHYGITAL_WALLET_PROGRAM_ADDRESS &&
      discEq(ixData, EXECUTE_DISC)
    ) {
      const accounts = ix.accounts ?? [];
      // Fixed execute metas: 0 verifier, 1 config, 2 phygital_token, …, 7 program; then remaining
      const verifierMeta = accounts[0];
      const tokenMeta = accounts[2];
      if (!verifierMeta?.address) {
        throw Object.assign(new Error("Execute missing verifier"), {
          code: "invalid_transaction",
        });
      }
      if (!tokenMeta?.address) {
        throw Object.assign(new Error("Execute missing phygitalToken"), {
          code: "invalid_transaction",
        });
      }
      verifier = String(verifierMeta.address);
      phygitalToken = String(tokenMeta.address);

      const remainingAddresses = accounts.slice(8).map((a) => a.address);

      const decoded = executeDataDecoder.decode(ixData);
      inner = decoded.compactInstructions.map((ci) => {
        const programAddress = remainingAddresses[ci.programIdIndex];
        if (!programAddress) {
          throw Object.assign(
            new Error("Compact instruction program index out of range"),
            { code: "invalid_transaction" },
          );
        }
        const instruction: Instruction = {
          programAddress,
          accounts: [...ci.accountIndexes].map((idx) => {
            const accountAddress = remainingAddresses[idx];
            if (!accountAddress) {
              throw Object.assign(
                new Error("Compact instruction account index out of range"),
                { code: "invalid_transaction" },
              );
            }
            return { address: accountAddress, role: AccountRole.READONLY };
          }),
          data: new Uint8Array(ci.data),
        };
        return instruction;
      });
    }
  }

  if (!phygitalToken || !verifier) {
    throw Object.assign(
      new Error("Transaction missing phygital-wallet execute"),
      { code: "unexpected_instruction" },
    );
  }

  return {
    messageBytes: new Uint8Array(tx.messageBytes),
    verifier,
    phygitalToken,
    instructions: inner,
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
