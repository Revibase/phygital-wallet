/**
 * Fee credit/debit from a Helius `transactionSubscribe` result
 * (`POST /webhooks/transactions` → WALLET_TX_QUEUE).
 *
 * Ledger lives on TokenSigner DO; idempotent by `${signature}:credit|debit`.
 */
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

import { recordAudit } from "@/audit/audit-log";
import { isDefaultFeePayer } from "@/fees/default-feePayer";
import { tryParseAddress } from "@/shared/solana/address";
import { tokenSigner } from "@/transactions/token-signer";
import type { SubscribeTxResult } from "@/webhooks/wallet-activity";

type AccountKey = string | { pubkey?: string };

type CompiledIx = {
  programIdIndex?: number;
  accounts?: number[];
  data?: string;
};

type InnerIxGroup = {
  index?: number;
  instructions?: CompiledIx[];
};

type TxMeta = {
  err?: unknown;
  fee?: number;
  preBalances?: number[];
  postBalances?: number[];
  loadedAddresses?: {
    writable?: string[];
    readonly?: string[];
  };
  innerInstructions?: InnerIxGroup[];
};

type ConfirmedTx = {
  meta?: TxMeta | null;
  transaction?: {
    signatures?: string[];
    message?: {
      accountKeys?: AccountKey[];
      instructions?: CompiledIx[];
    };
  };
};

const base58 = getBase58Encoder();
const base64 = getBase64Encoder();

function accountPubkey(key: AccountKey | undefined): string | null {
  if (typeof key === "string") return key;
  if (key && typeof key.pubkey === "string") return key.pubkey;
  return null;
}

/** Static keys + v0 loaded addresses (writable then readonly). */
export function resolveAccountKeys(confirmed: ConfirmedTx): string[] {
  const staticKeys = (confirmed.transaction?.message?.accountKeys ?? [])
    .map(accountPubkey)
    .filter((k): k is string => Boolean(k));
  const loaded = confirmed.meta?.loadedAddresses;
  const writable = (loaded?.writable ?? []).filter(
    (k): k is string => typeof k === "string" && k.length > 0,
  );
  const readonly = (loaded?.readonly ?? []).filter(
    (k): k is string => typeof k === "string" && k.length > 0,
  );
  return [...staticKeys, ...writable, ...readonly];
}

function nativeChange(
  keys: string[],
  meta: TxMeta | null | undefined,
  account: string,
): number {
  const i = keys.indexOf(account);
  if (i < 0) return 0;
  const pre = meta?.preBalances?.[i];
  const post = meta?.postBalances?.[i];
  if (typeof pre !== "number" || typeof post !== "number") return 0;
  return post - pre;
}

function decodeIxData(raw: string | undefined): Uint8Array | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return new Uint8Array(base58.encode(trimmed));
  } catch {
    /* not base58 */
  }
  try {
    return new Uint8Array(base64.encode(trimmed));
  } catch {
    return null;
  }
}

type KitIx = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

function compiledToKitIx(ix: CompiledIx, keys: string[]): KitIx | null {
  if (typeof ix.programIdIndex !== "number") return null;
  const programId = keys[ix.programIdIndex];
  if (!programId) return null;
  const data = decodeIxData(ix.data);
  if (!data) return null;
  const accounts: AccountMeta[] = (ix.accounts ?? [])
    .map((idx) => keys[idx])
    .filter((a): a is string => Boolean(a))
    .map((address) => ({
      address: address as Address,
      role: AccountRole.READONLY,
    }));
  return {
    programAddress: programId as Address,
    data,
    accounts,
  };
}

function allCompiledIxs(confirmed: ConfirmedTx): CompiledIx[] {
  const top = confirmed.transaction?.message?.instructions ?? [];
  const inner = (confirmed.meta?.innerInstructions ?? []).flatMap(
    (g) => g.instructions ?? [],
  );
  return [...top, ...inner];
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
      data: decodeIxData(trimmed) ?? new TextEncoder().encode(trimmed),
    });
    return decoded.data.memo.trim() || null;
  } catch {
    return trimmed;
  }
}

export function findMemoPhygitalToken(
  confirmed: ConfirmedTx,
  keys: string[],
): string | null {
  for (const ix of allCompiledIxs(confirmed)) {
    const kitIx = compiledToKitIx(ix, keys);
    if (!kitIx) continue;
    if (kitIx.programAddress !== MEMO_PROGRAM_ADDRESS) continue;
    try {
      const decoded = parseAddMemoInstruction(kitIx);
      const addr = tryParseAddress(decoded.data.memo);
      if (addr) return String(addr);
    } catch {
      const fallback = decodeMemoText(ix.data);
      const addr = tryParseAddress(fallback);
      if (addr) return String(addr);
    }
  }
  return null;
}

type ExecuteAccounts = {
  phygitalToken: string;
};

export function findExecuteAccounts(
  confirmed: ConfirmedTx,
  keys: string[],
): ExecuteAccounts | null {
  for (const ix of allCompiledIxs(confirmed)) {
    const kitIx = compiledToKitIx(ix, keys);
    if (!kitIx || kitIx.accounts.length < 6) continue;
    if (kitIx.programAddress !== PHYGITAL_WALLET_PROGRAM_ADDRESS) continue;
    try {
      if (
        identifyPhygitalWalletInstruction(kitIx) !==
        PhygitalWalletInstruction.Execute
      ) {
        continue;
      }
      const parsed = parseExecuteInstruction(kitIx);
      const phygitalToken = String(parsed.accounts.phygitalToken.address);
      if (!tryParseAddress(phygitalToken)) continue;
      return { phygitalToken };
    } catch {
      /* not execute */
    }
  }
  return null;
}

export type FeeTxProcessResult = {
  credited: boolean;
  debited: boolean;
};

/**
 * Process one subscribe tx: credit top-ups, debit default fee-payer execute fees.
 */
export async function processSubscribeFeeTx(
  env: Env,
  result: SubscribeTxResult,
): Promise<FeeTxProcessResult> {
  const confirmed = result.transaction as ConfirmedTx | null | undefined;
  if (!confirmed || typeof confirmed !== "object") {
    return { credited: false, debited: false };
  }

  const meta = confirmed.meta;
  if (meta?.err != null && meta.err !== false) {
    return { credited: false, debited: false };
  }

  const signature =
    result.signature?.trim() ||
    confirmed.transaction?.signatures?.[0]?.trim() ||
    "";
  if (!signature) return { credited: false, debited: false };

  const keys = resolveAccountKeys(confirmed);
  if (keys.length === 0) return { credited: false, debited: false };

  const feePayer = keys[0]!;
  const accumulator = env.TOP_UP_ACCUMULATOR?.trim() ?? "";
  const execute = findExecuteAccounts(confirmed, keys);
  const events: {
    token: string;
    event: { signature: string; kind: "credit" | "debit"; lamports: number };
  }[] = [];

  if (accumulator) {
    const change = nativeChange(keys, meta, accumulator);
    if (change > 0) {
      const token = execute?.phygitalToken ?? findMemoPhygitalToken(confirmed, keys);
      if (token) {
        events.push({
          token,
          event: {
            signature: `${signature}:credit`,
            kind: "credit",
            lamports: change,
          },
        });
      }
    }
  }

  if (execute) {
    const isDefault = await isDefaultFeePayer(feePayer);
    if (isDefault) {
      const change = nativeChange(keys, meta, feePayer);
      if (change < 0) {
        events.push({
          token: execute.phygitalToken,
          event: {
            signature: `${signature}:debit`,
            kind: "debit",
            lamports: -change,
          },
        });
      }
    }
  }

  if (events.length === 0) return { credited: false, debited: false };

  const byToken = new Map<string, (typeof events)[number]["event"][]>();
  for (const { token, event } of events) {
    const list = byToken.get(token) ?? [];
    list.push(event);
    byToken.set(token, list);
  }

  let credited = false;
  let debited = false;
  for (const [token, batch] of byToken) {
    const { appliedSignatures } = await tokenSigner(env, token).applyFeeEvents(
      batch,
    );
    if (appliedSignatures.length === 0) continue;
    const applied = new Set(appliedSignatures);
    for (const ev of batch) {
      if (!applied.has(ev.signature)) continue;
      if (ev.kind === "credit") credited = true;
      else debited = true;
      recordAudit({
        event: ev.kind === "credit" ? "fee_credit" : "fee_debit",
        phygitalToken: token,
        ok: true,
        actor: "system",
        detail: { signature, lamports: ev.lamports },
      });
    }
  }

  return { credited, debited };
}
