import {
  getTransactionDecoder,
  getTransactionEncoder,
  type Address,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
} from "@solana/kit";

const encoder = getTransactionEncoder();
const decoder = getTransactionDecoder();

/**
 * Kit partial signer backed by the Helius WaaS wallet — the owner/authority
 * signature source, mirroring `createDefaultFeePayer` (the paymaster signer).
 *
 * WaaS signs whole serialized transactions, so this serializes each tx, has
 * WaaS sign it, and returns ONLY this wallet's signature. Kit then assembles
 * the multi-signer transaction itself (and keeps its blockhash lifetime),
 * letting the paymaster + owner co-sign in one `signTransactionMessageWithSigners`.
 */
export function createHeliusSigner(params: {
  address: string;
  signTransaction: (transaction: Uint8Array) => Promise<Uint8Array>;
}): TransactionPartialSigner<Address> {
  const owner = params.address as Address;
  return {
    address: owner,
    signTransactions: async (
      transactions: readonly Transaction[]
    ): Promise<readonly SignatureDictionary[]> =>
      Promise.all(
        transactions.map(async (transaction) => {
          const signedBytes = await params.signTransaction(
            new Uint8Array(encoder.encode(transaction))
          );
          const signature = decoder.decode(signedBytes).signatures[owner];
          if (!signature) {
            throw new Error(
              "Helius wallet returned no signature for this transaction"
            );
          }
          return { [owner]: signature as SignatureBytes } satisfies SignatureDictionary;
        })
      ),
  };
}
