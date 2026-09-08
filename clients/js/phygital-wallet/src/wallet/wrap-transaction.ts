import {
  compileTransaction,
  decompileTransactionMessageFetchingLookupTables,
  estimateResourceLimitsFactory,
  getCompiledTransactionMessageDecoder,
  isTransactionMessageWithBlockhashLifetime,
  isTransactionWithBlockhashLifetime,
  isWritableRole,
  prependTransactionMessageInstructions,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type AccountMeta,
  type Address,
  type Blockhash,
  type Instruction,
  type Rpc,
  type SignatureDictionary,
  type SignaturesMap,
  type SolanaRpcApi,
  type Transaction,
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
import type { CompactInstructionArgs } from "../generated/types/compactInstruction.js";
import type { Secp256r1VerifyArgsArgs } from "../generated/types/secp256r1VerifyArgs.js";
import { compileWalletInstructions } from "./compile.js";
import {
  buildExecuteChallengeFromSlot,
  fetchLatestSlothHash,
  type SlotEntry,
} from "../utils/challenges.js";

const MEMO_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address;

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
  config: Address;
  tokenVerifier: Address;
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

function applyComputeBudget<T extends DecompiledMessage>(
  message: T,
  unitLimit: number,
  unitPrice: bigint,
): T {
  const withoutBudget = {
    ...message,
    instructions: stripComputeBudgetInstructions(message.instructions),
  } as T;

  return prependTransactionMessageInstructions(
    [
      getSetComputeUnitLimitInstruction({ units: unitLimit }),
      getSetComputeUnitPriceInstruction({ microLamports: unitPrice }),
    ],
    withoutBudget,
  ) as T;
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
function withVerifierFeePayerIfWallet<T extends DecompiledMessage>(
  message: T,
  walletPda: Address,
  verifier: TransactionSigner,
): T {
  if (message.feePayer?.address !== walletPda) {
    return message;
  }
  return setTransactionMessageFeePayerSigner(verifier, message) as T;
}

/**
 * Post fee-payer-swap wrap message for CU / fee account selection.
 * Omit secp to price fees before the passkey tap.
 */
function buildWrappedBaseMessage(input: {
  pending: PendingWalletWrap;
  verifier: TransactionSigner;
  executeAccounts: WalletExecuteAccounts;
  secp256r1VerifyInstruction?: Instruction;
  secp256r1VerifyArgs?: Secp256r1VerifyArgsArgs;
}): DecompiledMessage {
  const { pending, verifier, executeAccounts } = input;

  const executeIx = getExecuteInstruction({
    verifier,
    config: executeAccounts.config,
    phygitalToken: executeAccounts.phygitalToken,
    tokenVerifier: executeAccounts.tokenVerifier,
    wallet: executeAccounts.wallet,
    compactInstructions: pending.compactInstructions,
    secp256r1VerifyArgs: input.secp256r1VerifyArgs ?? PLACEHOLDER_SECP_ARGS,
    slotNumber: pending.slotNumber,
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

  return withVerifierFeePayerIfWallet(
    baseMessage,
    executeAccounts.wallet,
    verifier,
  );
}

/** Priority-fee RPC for the same writable set finalize would price. */
function fetchPriorityFeeMicroLamports(
  rpc: Rpc<SolanaRpcApi>,
  input: {
    prepared: PreparedWalletWrap;
    compactInstructions: CompactInstructionArgs[];
    remainingAccounts: AccountMeta[];
    verifier: TransactionSigner;
    executeAccounts: WalletExecuteAccounts;
  },
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
          verifier: input.verifier,
          executeAccounts: input.executeAccounts,
        }),
      ),
    )
    .send()
    .then(pickPriorityFeeMicroLamports);
}

/**
 * Simulate body ixs before NFC (verifier fee payer, sigVerify skipped).
 */
async function assertBodyInstructionsExecutable(input: {
  rpc: Rpc<SolanaRpcApi>;
  verifier: TransactionSigner;
  prepared: PreparedWalletWrap;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const withVerifierFeePayer = setTransactionMessageFeePayerSigner(
    input.verifier,
    {
      ...input.prepared.decompiled,
      instructions: [...input.prepared.bodyInstructions],
    } as typeof input.prepared.decompiled,
  );

  await estimateResourceLimitsFactory({ rpc: input.rpc })(withVerifierFeePayer, {
    abortSignal: input.abortSignal,
  });
}

function applyVerifierCoSignature(
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

  const bodyInstructions: Instruction[] = [];
  const memoInstructions: Instruction[] = [];
  for (const instruction of decompiled.instructions) {
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
  compiled = compileWalletInstructions(
    prepared.bodyInstructions,
    walletPda,
  ),
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
 * After passkey: execute ix, CU + fees, fresh blockhash, compile.
 */
async function finalizeWrappedWalletTransaction(input: {
  rpc: Rpc<SolanaRpcApi>;
  pending: PendingWalletWrap;
  verifier: TransactionSigner;
  executeAccounts: WalletExecuteAccounts;
  passkeyTap: Awaited<ReturnType<typeof authenticatePasskeyForSecp256r1Verify>>;
  /** Prefetched priority fee; otherwise fetched in finalize. */
  unitPricePromise?: Promise<bigint>;
}): Promise<SignedTransaction> {
  const { pending, rpc, verifier, executeAccounts, passkeyTap } = input;

  const { secp256r1VerifyInstruction, secp256r1VerifyArgs } =
    await buildSecp256r1VerifyInstruction(passkeyTap);

  const baseMessage = buildWrappedBaseMessage({
    pending,
    verifier,
    executeAccounts,
    secp256r1VerifyInstruction,
    secp256r1VerifyArgs,
  });

  const [limits, unitPrice, block] = await Promise.all([
    estimateResourceLimitsFactory({ rpc })(baseMessage),
    input.unitPricePromise ??
      fetchPriorityFeeMicroLamports(rpc, {
        prepared: pending.prepared,
        compactInstructions: pending.compactInstructions,
        remainingAccounts: pending.remainingAccounts,
        verifier,
        executeAccounts,
      }),
    rpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send()
      .then(({ value: latestBlockhash }) => latestBlockhash),
  ]);

  let message = applyComputeBudget(
    baseMessage,
    withMargin(limits.computeUnitLimit),
    unitPrice,
  );
  message = applyBlockhashIfNeeded(message, block);

  const compiledTx = compileTransaction(
    message as Parameters<typeof compileTransaction>[0],
  );
  return withLifetimeConstraint(compiledTx, message);
}

/**
 * Wrap pipeline: preview + body sim → SlotHashes → passkey → finalize → co-sign.
 */
export async function modifyAndWrapWalletTransaction(input: {
  rpc: Rpc<SolanaRpcApi>;
  transaction: Transaction & TransactionWithLifetime;
  walletPda: Address;
  verifier: TransactionSigner;
  executeAccounts: {
    config: Address;
    tokenVerifier: Address;
    wallet: Address;
    phygitalToken: Address;
  };
  abortSignal?: AbortSignal;
  preview: (bodyInstructions: readonly Instruction[]) => Promise<void>;
  authenticate: (
    messageHash: Uint8Array,
  ) => Promise<Awaited<ReturnType<typeof authenticatePasskeyForSecp256r1Verify>>>;
  coSign: (wrapped: SignedTransaction) => Promise<SignatureDictionary>;
}): Promise<SignedTransaction> {
  const prepared = await prepareWrappedWalletTransaction({
    rpc: input.rpc,
    transaction: input.transaction,
  });

  const earlyCompiled = compileWalletInstructions(
    prepared.bodyInstructions,
    input.walletPda,
  );
  const unitPricePromise = fetchPriorityFeeMicroLamports(input.rpc, {
    prepared,
    compactInstructions: earlyCompiled.compactInstructions,
    remainingAccounts: earlyCompiled.remainingAccounts,
    verifier: input.verifier,
    executeAccounts: input.executeAccounts,
  });

  const [previewResult, bodySimResult] = await Promise.allSettled([
    input.preview(prepared.bodyInstructions),
    assertBodyInstructionsExecutable({
      rpc: input.rpc,
      verifier: input.verifier,
      prepared,
      abortSignal: input.abortSignal,
    }),
  ]);
  if (previewResult.status === "rejected") throw previewResult.reason;
  if (bodySimResult.status === "rejected") throw bodySimResult.reason;

  const slot = await fetchLatestSlothHash(input.rpc);
  const pending = buildPendingWalletWrap(
    prepared,
    input.walletPda,
    slot,
    earlyCompiled,
  );

  input.abortSignal?.throwIfAborted();
  const passkeyTap = await input.authenticate(pending.messageHash);

  const wrapped = await finalizeWrappedWalletTransaction({
    rpc: input.rpc,
    pending,
    verifier: input.verifier,
    executeAccounts: input.executeAccounts,
    passkeyTap,
    unitPricePromise,
  });

  input.abortSignal?.throwIfAborted();
  const verifierSignatures = await input.coSign(wrapped);
  return applyVerifierCoSignature(
    wrapped,
    input.walletPda,
    input.transaction.signatures,
    verifierSignatures,
  );
}
