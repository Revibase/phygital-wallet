import {
  AccountRole,
  getBase58Encoder,
  getBase64Encoder,
  type AccountMeta,
  type Address,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  MEMO_PROGRAM_ADDRESS,
  parseAddMemoInstruction,
} from "@solana-program/memo";
import {
  identifyPhygitalWalletInstruction,
  parseExecuteInstruction,
  PhygitalWalletInstruction,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { isDefaultConfigVerifier } from "@/fees/default-verifier";
import {
  creditFeeBalance,
  debitFeeBalance,
} from "@/fees/fee-balance-db";
import { getEnv } from "@/shared/request-context";
import { tryParseAddress } from "@/shared/solana/address";

type HeliusIx = {
  programId?: string;
  accounts?: string[];
  data?: string;
  /** jsonParsed memo payloads put the utf8 string here instead of `data`. */
  parsed?: string | { type?: string; info?: unknown };
};

type HeliusNativeTransfer = {
  fromUserAccount?: string;
  toUserAccount?: string;
  amount?: number;
};

/** Minimal Helius enhanced tx shape we care about. */
type HeliusTxLike = {
  signature?: string;
  feePayer?: string;
  accountData?: Array<{
    account?: string;
    nativeBalanceChange?: number;
  }>;
  nativeTransfers?: HeliusNativeTransfer[];
  instructions?: HeliusIx[];
  /** Some payloads nest under `transaction` */
  transaction?: HeliusTxLike;
};

const base58 = getBase58Encoder();
const base64 = getBase64Encoder();

function unwrapHeliusTx(raw: HeliusTxLike): HeliusTxLike {
  return raw.transaction && typeof raw.transaction === "object"
    ? { ...raw, ...raw.transaction }
    : raw;
}

function nativeChange(tx: HeliusTxLike, account: string): number {
  for (const row of tx.accountData ?? []) {
    if (row.account === account && typeof row.nativeBalanceChange === "number") {
      return row.nativeBalanceChange;
    }
  }
  let sum = 0;
  for (const transfer of tx.nativeTransfers ?? []) {
    if (typeof transfer.amount !== "number") continue;
    if (transfer.toUserAccount === account) sum += transfer.amount;
    if (transfer.fromUserAccount === account) sum -= transfer.amount;
  }
  return sum;
}

function heliusIxData(ix: HeliusIx): Uint8Array | null {
  if (typeof ix.parsed === "string" && ix.parsed.trim()) {
    return new TextEncoder().encode(ix.parsed.trim());
  }
  const raw = ix.data?.trim();
  if (!raw) return null;
  try {
    return new Uint8Array(base58.encode(raw));
  } catch {
    /* not base58 */
  }
  try {
    return new Uint8Array(base64.encode(raw));
  } catch {
    return null;
  }
}

type KitIx = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

function toKitIx(ix: HeliusIx): KitIx | null {
  if (!ix.programId) return null;
  const data = heliusIxData(ix);
  if (!data) return null;
  const accounts: AccountMeta[] = (ix.accounts ?? []).map((account) => ({
    address: account as Address,
    role: AccountRole.READONLY,
  }));
  return {
    programAddress: ix.programId as Address,
    data,
    accounts,
  };
}

/** Decode memo instruction data via `@solana-program/memo`. */
export function decodeMemoText(data: string | undefined): string | null {
  if (!data) return null;
  const trimmed = data.trim();
  if (!trimmed) return null;
  if (tryParseAddress(trimmed)) return trimmed;
  try {
    const decoded = parseAddMemoInstruction({
      programAddress: MEMO_PROGRAM_ADDRESS,
      data: heliusIxData({ data: trimmed }) ?? new TextEncoder().encode(trimmed),
    });
    return decoded.data.memo.trim() || null;
  } catch {
    return trimmed;
  }
}

function findMemoPhygitalToken(tx: HeliusTxLike): string | null {
  for (const ix of tx.instructions ?? []) {
    if (ix.programId !== MEMO_PROGRAM_ADDRESS) continue;
    const kitIx = toKitIx(ix);
    if (kitIx) {
      try {
        const decoded = parseAddMemoInstruction(kitIx);
        const addr = tryParseAddress(decoded.data.memo);
        if (addr) return String(addr);
      } catch {
        /* not a memo we can parse */
      }
    }
    const fallback = decodeMemoText(
      typeof ix.parsed === "string" ? ix.parsed : ix.data,
    );
    const addr = tryParseAddress(fallback);
    if (addr) return String(addr);
  }
  return null;
}

type ExecuteAccounts = {
  verifier: string;
  phygitalToken: string;
};

export function findExecuteAccounts(tx: HeliusTxLike): ExecuteAccounts | null {
  for (const ix of tx.instructions ?? []) {
    if (ix.programId !== PHYGITAL_WALLET_PROGRAM_ADDRESS) continue;
    const kitIx = toKitIx(ix);
    if (!kitIx || kitIx.accounts.length < 8) continue;
    try {
      if (
        identifyPhygitalWalletInstruction(kitIx) !==
        PhygitalWalletInstruction.Execute
      ) {
        continue;
      }
      const parsed = parseExecuteInstruction(kitIx);
      const verifier = String(parsed.accounts.verifier.address);
      const phygitalToken = String(parsed.accounts.phygitalToken.address);
      if (!tryParseAddress(verifier) || !tryParseAddress(phygitalToken)) {
        continue;
      }
      return { verifier, phygitalToken };
    } catch {
      /* not execute */
    }
  }
  return null;
}

/**
 * Process one Helius tx: credit top-ups, debit default-verifier execute fees.
 * Pure side-effects via D1; safe to call repeatedly (idempotent by signature).
 */
async function processHeliusFeeTx(
  raw: HeliusTxLike,
): Promise<{ credited: boolean; debited: boolean }> {
  const tx = unwrapHeliusTx(raw);
  const signature = tx.signature?.trim();
  if (!signature) return { credited: false, debited: false };

  const accumulator = getEnv().TOP_UP_ACCUMULATOR?.trim() ?? "";
  const execute = findExecuteAccounts(tx);
  let credited = false;
  let debited = false;

  // Credit: SOL landed on accumulator. Prefer execute's token (always present
  // on a wrapped top-up); memo is the fallback for a plain transfer.
  if (accumulator) {
    const change = nativeChange(tx, accumulator);
    if (change > 0) {
      const token = execute?.phygitalToken ?? findMemoPhygitalToken(tx);
      if (token) {
        credited = await creditFeeBalance({
          phygitalToken: token,
          lamports: change,
          signature: `${signature}:credit`,
        });
      }
    }
  }

  // Debit: execute with default verifier fee spend
  if (execute) {
    const feePayer = tx.feePayer ?? execute.verifier;
    const isDefault = await isDefaultConfigVerifier(feePayer);
    if (isDefault) {
      const change = nativeChange(tx, feePayer);
      if (change < 0) {
        debited = await debitFeeBalance({
          phygitalToken: execute.phygitalToken,
          lamports: -change,
          signature: `${signature}:debit`,
        });
      }
    }
  }

  return { credited, debited };
}

export async function processHeliusWebhookPayload(
  body: unknown,
): Promise<{ processed: number; credited: number; debited: number }> {
  const list: HeliusTxLike[] = Array.isArray(body)
    ? (body as HeliusTxLike[])
    : body && typeof body === "object"
      ? [body as HeliusTxLike]
      : [];

  let processed = 0;
  let credited = 0;
  let debited = 0;

  for (const item of list) {
    const result = await processHeliusFeeTx(item);
    processed += 1;
    if (result.credited) credited += 1;
    if (result.debited) debited += 1;
  }

  return { processed, credited, debited };
}
