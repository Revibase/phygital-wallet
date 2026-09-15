import {
  compileTransaction,
  createNoopSigner,
  decompileTransactionMessageFetchingLookupTables,
  estimateResourceLimitsFactory,
  getCompiledTransactionMessageDecoder,
  isTransactionMessageWithBlockhashLifetime,
  isTransactionWithBlockhashLifetime,
  isWritableRole,
  prependTransactionMessageInstructions,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageLoadedAccountsDataSizeLimit,
  setTransactionMessagePriorityFeeLamports,
  type AccountMeta,
  type Address,
  type Blockhash,
  type Instruction,
  type Rpc,
  type SignatureDictionary,
  type SignaturesMap,
  type SolanaRpcApi,
  type Transaction,
  type TransactionPartialSigner,
  type TransactionSigner,
  type TransactionWithLifetime,
  type TransactionWithinSizeLimit,
} from "@solana/kit";
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import {
  authenticatePasskeyForSecp256r1Verify,
  buildSecp256r1VerifyInstruction,
} from "phygital-token-sdk";
import {
  COMPUTE_UNIT_ESTIMATE_MARGIN,
  DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  MIN_BLOCKHASH_REMAINING_SLOTS,
} from "../constants.js";
import { getExecuteInstruction } from "../generated/instructions/execute.js";
import { getExecuteWithAuthorityUsingPoliciesInstruction } from "../generated/instructions/executeWithAuthorityUsingPolicies.js";
import type { CompactInstructionArgs } from "../generated/types/compactInstruction.js";
import type { Secp256r1VerifyArgsArgs } from "../generated/types/secp256r1VerifyArgs.js";
import { compileWalletInstructions } from "./compile.js";
import {
  buildExecuteChallengeFromSlot,
  fetchLatestSlotHash,
  type SlotEntry,
} from "../utils/challenges.js";

const MEMO_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address;

/** Round loaded-accounts data size up to the next 32 KiB page (v1 cost model). */
const LOADED_ACCOUNTS_PAGE_BYTES = 32 * 1024;
/** Covers the passkey precompile + verify CPI omitted by authority preview. */
const PASSKEY_VERIFY_COMPUTE_BUFFER = 20_000;

/** Account metas for execute don't depend on the passkey payload. */
const PLACEHOLDER_SECP_ARGS: Secp256r1VerifyArgsArgs = {
  verifyArgsRelativeIndex: 0,
  signedMessageIndex: 0,
  clientDataJson: new Uint8Array(0),
};

type SignedTransaction = Transaction &
  TransactionWithinSizeLimit &
  TransactionWithLifetime;

type WalletExecuteAccounts = {
  authority: Address;
  feePayer: TransactionPartialSigner;
  authorityAccount: {
    readonly address: Address<string>;
  };
  wallet: Address;
  phygitalToken: Address;
};

type DecompiledMessage = Awaited<
  ReturnType<typeof decompileTransactionMessageFetchingLookupTables>
>;

type PreparedWalletWrap = {
  transaction: Transaction & TransactionWithLifetime;
  decompiled: DecompiledMessage;
  bodyInstructions: Instruction[];
  memoInstructions: Instruction[];
};

type PendingWalletWrap = {
  prepared: PreparedWalletWrap;
  compactInstructions: CompactInstructionArgs[];
  remainingAccounts: AccountMeta[];
  slotNumber: bigint;
  messageHash: Uint8Array;
};

type BlockContext = {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
};

function stripComputeBudgetInstructions(
  instructions: readonly Instruction[],
): Instruction[] {
  return instructions.filter(
    (instruction) =>
      instruction.programAddress !== COMPUTE_BUDGET_PROGRAM_ADDRESS,
  );
}

function withRemainingAccounts(
  instruction: Instruction,
  remainingAccounts: readonly AccountMeta[],
): Instruction {
  return {
    ...instruction,
    accounts: [...(instruction.accounts ?? []), ...remainingAccounts],
  };
}

function pickPriorityFeeMicroLamports(
  fees: readonly { prioritizationFee: bigint | number }[],
): bigint {
  const sorted = fees
    .map((fee) => BigInt(fee.prioritizationFee))
    .filter((fee) => fee > 0n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (sorted.length === 0) {
    return DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS;
  }

  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5));
  return sorted[index]!;
}

function withMargin(unitsConsumed: number): number {
  // Integer math — avoid `* 1.1` float rounding (100000 * 1.1 → 110000.00000000001).
  const tenths = Math.round(COMPUTE_UNIT_ESTIMATE_MARGIN * 10);
  return Math.min(
    1_400_000,
    Math.max(1, Math.ceil((unitsConsumed * tenths) / 10)),
  );
}

function roundUpLoadedAccountsDataSize(bytes: number): number {
  if (bytes <= 0) return LOADED_ACCOUNTS_PAGE_BYTES;
  return (
    Math.ceil(bytes / LOADED_ACCOUNTS_PAGE_BYTES) * LOADED_ACCOUNTS_PAGE_BYTES
  );
}

/** micro-lamports/CU × CU limit → absolute lamports for v1 priority fee. */
function priorityFeeLamportsFromMicroLamports(
  microLamportsPerCu: bigint,
  unitLimit: number,
): bigint {
  return (microLamportsPerCu * BigInt(unitLimit)) / 1_000_000n;
}

function collectWritableAddresses(message: DecompiledMessage): Address[] {
  const writable = new Set<Address>();

  if ("feePayer" in message && message.feePayer) {
    writable.add(message.feePayer.address);
  }

  for (const instruction of message.instructions) {
    for (const account of instruction.accounts ?? []) {
      if (isWritableRole(account.role)) {
        writable.add(account.address);
      }
    }
  }

  return [...writable];
}

/**
 * Apply CU / priority fee for the message version:
 * - legacy / v0 → prepend ComputeBudget instructions
 * - v1 → message `config` (ComputeBudget ixs are no-ops)
 */
function applyResourceLimits<T extends DecompiledMessage>(
  message: T,
  unitLimit: number,
  unitPriceMicroLamports: bigint,
  loadedAccountsDataSizeLimit?: number,
): T {
  const withoutBudget = {
    ...message,
    instructions: stripComputeBudgetInstructions(message.instructions),
  } as T;

  if (withoutBudget.version === 1) {
    let next = setTransactionMessageComputeUnitLimit(
      unitLimit,
      withoutBudget as never,
    ) as T;
    next = setTransactionMessagePriorityFeeLamports(
      priorityFeeLamportsFromMicroLamports(unitPriceMicroLamports, unitLimit),
      next as never,
    ) as T;
    const dataSize = loadedAccountsDataSizeLimit ?? LOADED_ACCOUNTS_PAGE_BYTES;
    return setTransactionMessageLoadedAccountsDataSizeLimit(
      roundUpLoadedAccountsDataSize(dataSize),
      next as never,
    ) as T;
  }

  const budgetIxs = [
    getSetComputeUnitLimitInstruction({ units: unitLimit }),
    getSetComputeUnitPriceInstruction({
      microLamports: unitPriceMicroLamports,
    }),
  ];

  return prependTransactionMessageInstructions(budgetIxs, withoutBudget) as T;
}

function applyBlockhashIfNeeded<T extends DecompiledMessage>(
  message: T,
  block: BlockContext,
): T {
  if (!isTransactionMessageWithBlockhashLifetime(message)) {
    return message;
  }

  const { lastValidBlockHeight } = message.lifetimeConstraint;
  if (
    lastValidBlockHeight >
    block.lastValidBlockHeight + MIN_BLOCKHASH_REMAINING_SLOTS
  ) {
    return message;
  }

  return setTransactionMessageLifetimeUsingBlockhash(block, message) as T;
}

function withLifetimeConstraint(
  transaction: Transaction,
  message: DecompiledMessage,
): SignedTransaction {
  if (!("lifetimeConstraint" in message)) {
    return transaction as SignedTransaction;
  }

  return {
    ...transaction,
    lifetimeConstraint: message.lifetimeConstraint,
  } as SignedTransaction;
}

/**
 * Wallet PDA cannot pay fees (no private key). If the message uses it as fee
 * payer, swap in the verifier co-signer instead.
 */
function withFeePayerIfWallet<T extends DecompiledMessage>(
  message: T,
  walletPda: Address,
  feePayer: TransactionSigner,
): T {
  if (message.feePayer?.address !== walletPda) {
    return message;
  }
  return setTransactionMessageFeePayerSigner(feePayer, message) as T;
}

/**
 * Post fee-payer-swap wrap message for CU / fee account selection.
 * Omit secp to price fees before the passkey tap.
 */
function buildWrappedBaseMessage(input: {
  pending: PendingWalletWrap;
  executeAccounts: WalletExecuteAccounts;
  secp256r1VerifyInstruction?: Instruction;
  secp256r1VerifyArgs?: Secp256r1VerifyArgsArgs;
}): DecompiledMessage {
  const { pending, executeAccounts } = input;

  const executeIx = getExecuteInstruction({
    phygitalToken: executeAccounts.phygitalToken,
    wallet: executeAccounts.wallet,
    compactInstructions: pending.compactInstructions,
    secp256r1VerifyArgs: input.secp256r1VerifyArgs ?? PLACEHOLDER_SECP_ARGS,
    slotNumber: pending.slotNumber,
    authorityAccount: executeAccounts.authorityAccount.address,
  });

  const executeWithRemaining = withRemainingAccounts(
    executeIx,
    pending.remainingAccounts,
  );
  const instructions = [
    ...(input.secp256r1VerifyInstruction
      ? [input.secp256r1VerifyInstruction]
      : []),
    executeWithRemaining,
    ...pending.prepared.memoInstructions,
  ];

  const baseMessage = {
    ...pending.prepared.decompiled,
    instructions,
  } as typeof pending.prepared.decompiled;

  return withFeePayerIfWallet(
    baseMessage,
    executeAccounts.wallet,
    executeAccounts.feePayer,
  );
}

function buildPolicyPreviewMessage(input: {
  prepared: PreparedWalletWrap;
  compactInstructions: CompactInstructionArgs[];
  remainingAccounts: AccountMeta[];
  executeAccounts: WalletExecuteAccounts;
}): DecompiledMessage {
  const { prepared, executeAccounts } = input;
  const previewIx = getExecuteWithAuthorityUsingPoliciesInstruction({
    authority: createNoopSigner(executeAccounts.authority),
    phygitalToken: executeAccounts.phygitalToken,
    authorityAccount: executeAccounts.authorityAccount.address,
    wallet: executeAccounts.wallet,
    compactInstructions: input.compactInstructions,
  });
  const instructions = [
    withRemainingAccounts(previewIx, input.remainingAccounts),
    ...prepared.memoInstructions,
  ];
  return withFeePayerIfWallet(
    { ...prepared.decompiled, instructions } as DecompiledMessage,
    executeAccounts.wallet,
    executeAccounts.feePayer,
  );
}

/** Priority-fee RPC for the same writable set finalize would price. */
function fetchPriorityFeeMicroLamports(
  rpc: Rpc<SolanaRpcApi>,
  input: {
    prepared: PreparedWalletWrap;
    compactInstructions: CompactInstructionArgs[];
    remainingAccounts: AccountMeta[];
    executeAccounts: WalletExecuteAccounts;
  },
  abortSignal?: AbortSignal,
): Promise<bigint> {
  // Slot / messageHash unused for writable-account selection.
  const pending: PendingWalletWrap = {
    prepared: input.prepared,
    compactInstructions: input.compactInstructions,
    remainingAccounts: input.remainingAccounts,
    slotNumber: 0n,
    messageHash: new Uint8Array(32),
  };
  return rpc
    .getRecentPrioritizationFees(
      collectWritableAddresses(
        buildWrappedBaseMessage({
          pending,
          executeAccounts: input.executeAccounts,
        }),
      ),
    )
    .send({ abortSignal })
    .then(pickPriorityFeeMicroLamports);
}

function applyFeePayerSignature(
  transaction: SignedTransaction,
  walletPda: Address,
  priorSignatures: SignaturesMap | undefined,
  verifierSignatures: SignatureDictionary,
): SignedTransaction {
  const remainingSignatures = { ...(priorSignatures ?? {}) };
  delete remainingSignatures[walletPda];

  return {
    ...transaction,
    signatures: {
      ...remainingSignatures,
      ...verifierSignatures,
    },
  };
}

async function prepareWrappedWalletTransaction(input: {
  rpc: Rpc<SolanaRpcApi>;
  transaction: Transaction & TransactionWithLifetime;
  walletPda: Address;
}): Promise<PreparedWalletWrap> {
  const compiledMessage = getCompiledTransactionMessageDecoder().decode(
    input.transaction.messageBytes,
  );

  const decompileConfig = isTransactionWithBlockhashLifetime(input.transaction)
    ? {
        lastValidBlockHeight:
          input.transaction.lifetimeConstraint.lastValidBlockHeight,
      }
    : undefined;

  const decompiled = await decompileTransactionMessageFetchingLookupTables(
    compiledMessage,
    input.rpc,
    decompileConfig,
  );

  const instructions = decompiled.instructions;

  const bodyInstructions: Instruction[] = [];
  const memoInstructions: Instruction[] = [];

  for (let i = 0; i < instructions.length; i++) {
    const instruction = instructions[i]!;
    if (instruction.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS) continue;
    if (instruction.programAddress === MEMO_PROGRAM_ADDRESS) {
      memoInstructions.push(instruction);
    } else {
      bodyInstructions.push(instruction);
    }
  }

  if (bodyInstructions.length === 0) {
    throw new Error(
      "Transaction has no instructions to wrap (only compute budget/memo, or empty)",
    );
  }

  return {
    transaction: input.transaction,
    decompiled,
    bodyInstructions,
    memoInstructions,
  };
}

/** Sync: compact-compile + challenge hash (no RPC). */
function buildPendingWalletWrap(
  prepared: PreparedWalletWrap,
  walletPda: Address,
  slot: SlotEntry,
  compiled = compileWalletInstructions(prepared.bodyInstructions, walletPda),
): PendingWalletWrap {
  const { slotNumber, messageHash } = buildExecuteChallengeFromSlot(
    slot,
    compiled.compactInstructions,
    compiled.remainingAccounts.map((account) => account.address),
  );

  return {
    prepared,
    compactInstructions: compiled.compactInstructions,
    remainingAccounts: compiled.remainingAccounts,
    slotNumber,
    messageHash,
  };
}

/**
 * After passkey: execute ix, resource limits, lifetime, compile.
 */
async function finalizeWrappedWalletTransaction(input: {
  pending: PendingWalletWrap;
  executeAccounts: WalletExecuteAccounts;
  passkeyTap: Awaited<ReturnType<typeof authenticatePasskeyForSecp256r1Verify>>;
  limits: Awaited<ReturnType<ReturnType<typeof estimateResourceLimitsFactory>>>;
  unitPrice: bigint;
  block: BlockContext | null;
}): Promise<SignedTransaction> {
  const { pending, executeAccounts, passkeyTap } = input;

  const { secp256r1VerifyInstruction, secp256r1VerifyArgs } =
    await buildSecp256r1VerifyInstruction(passkeyTap);

  const baseMessage = buildWrappedBaseMessage({
    pending,
    executeAccounts,
    secp256r1VerifyInstruction,
    secp256r1VerifyArgs,
  });

  let message = applyResourceLimits(
    baseMessage,
    withMargin(input.limits.computeUnitLimit) + PASSKEY_VERIFY_COMPUTE_BUFFER,
    input.unitPrice,
    input.limits.loadedAccountsDataSizeLimit,
  );
  if (input.block) {
    message = applyBlockhashIfNeeded(message, input.block);
  }

  const compiledTx = compileTransaction(
    message as Parameters<typeof compileTransaction>[0],
  );
  return withLifetimeConstraint(compiledTx, message);
}

/**
 * Wrap pipeline: policy simulation + RPC prefetch → passkey → finalize → fee signing.
 */
export async function modifyAndWrapWalletTransaction(input: {
  rpc: Rpc<SolanaRpcApi>;
  transaction: Transaction & TransactionWithLifetime;
  walletPda: Address;
  executeAccounts: WalletExecuteAccounts;
  abortSignal?: AbortSignal;
  onPreview?: () => void;
  authenticate: (
    messageHash: Uint8Array,
  ) => Promise<
    Awaited<ReturnType<typeof authenticatePasskeyForSecp256r1Verify>>
  >;
  feePayer: (wrapped: SignedTransaction) => Promise<SignatureDictionary>;
}): Promise<SignedTransaction> {
  const prepared = await prepareWrappedWalletTransaction({
    rpc: input.rpc,
    transaction: input.transaction,
    walletPda: input.walletPda,
  });

  const earlyCompiled = compileWalletInstructions(
    prepared.bodyInstructions,
    input.walletPda,
  );

  input.onPreview?.();
  const previewMessage = buildPolicyPreviewMessage({
    prepared,
    compactInstructions: earlyCompiled.compactInstructions,
    remainingAccounts: earlyCompiled.remainingAccounts,
    executeAccounts: input.executeAccounts,
  });

  const [limits, unitPrice, slot, block] = await Promise.all([
    estimateResourceLimitsFactory({ rpc: input.rpc })(previewMessage, {
      abortSignal: input.abortSignal,
    }),
    fetchPriorityFeeMicroLamports(
      input.rpc,
      {
        prepared,
        compactInstructions: earlyCompiled.compactInstructions,
        remainingAccounts: earlyCompiled.remainingAccounts,
        executeAccounts: input.executeAccounts,
      },
      input.abortSignal,
    ),
    fetchLatestSlotHash(input.rpc, input.abortSignal),
    input.rpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send({ abortSignal: input.abortSignal })
      .then(({ value }) => value),
  ]);
  const pending = buildPendingWalletWrap(
    prepared,
    input.walletPda,
    slot,
    earlyCompiled,
  );

  input.abortSignal?.throwIfAborted();
  const passkeyTap = await input.authenticate(pending.messageHash);

  const wrapped = await finalizeWrappedWalletTransaction({
    pending,
    executeAccounts: input.executeAccounts,
    passkeyTap,
    limits,
    unitPrice,
    block,
  });

  input.abortSignal?.throwIfAborted();
  const feePayerSignatures = await input.feePayer(wrapped);
  return applyFeePayerSignature(
    wrapped,
    input.walletPda,
    input.transaction.signatures,
    feePayerSignatures,
  );
}
