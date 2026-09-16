/**
 * v1 transaction compiler for tests — uses @solana/kit end-to-end.
 * Never imported by `main.ts` (tree-shaken out of the production signer bundle).
 */

import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getBase58Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type AccountMeta,
  type Address,
  type Blockhash,
  type Instruction,
  type ReadonlyUint8Array,
  type V1TransactionConfig,
} from "@solana/kit";

const b58 = getBase58Decoder();
const txEncoder = getTransactionEncoder();

const DEFAULT_LIFETIME = {
  blockhash: b58.decode(new Uint8Array(32).fill(7)) as Blockhash,
  lastValidBlockHeight: 0n,
};

export interface CompileInput {
  feePayer: Address;
  instructions: Array<
    Instruction & {
      accounts?: readonly AccountMeta[];
      data?: ReadonlyUint8Array;
    }
  >;
  lifetimeToken?: Uint8Array; // 32 — encoded as blockhash
  config?: V1TransactionConfig;
}

/** Build kit v1 wire bytes from fee payer + instructions (+ optional config). */
export function encodeV1Wire(input: CompileInput): Uint8Array {
  const lifetime = input.lifetimeToken
    ? {
        blockhash: b58.decode(input.lifetimeToken) as Blockhash,
        lastValidBlockHeight: 0n,
      }
    : DEFAULT_LIFETIME;

  let message = pipe(
    createTransactionMessage({ version: 1 }),
    (m) => setTransactionMessageFeePayer(input.feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(input.instructions, m),
  );
  if (input.config && Object.keys(input.config).length > 0) {
    message = setTransactionMessageConfig(input.config, message);
  }
  const transaction = compileTransaction(message);
  return new Uint8Array(txEncoder.encode(transaction));
}
