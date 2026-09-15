/**
 * Kit partial signer backed by the secure-signer iframe — the owner/authority
 * signature source (parallel to `createDefaultFeePayer`, the paymaster signer).
 *
 * Unlike the WaaS signer, this uses the RAW 64-byte signature the signer returns,
 * so it does NOT need to decode the signed transaction. That matters: the signer
 * produces transaction v1, which @solana/kit@8.1.0 cannot decode. Kit assembles
 * the multi-signer transaction itself from this signature dictionary.
 */

import {
  getTransactionEncoder,
  type Address,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
} from "@solana/kit";

const encoder = getTransactionEncoder();

export function createSecureSignerSigner(params: {
  address: string;
  /** Sign the serialized transaction, returning the owner's 64-byte signature. */
  signRaw: (txBytes: Uint8Array) => Promise<Uint8Array>;
}): TransactionPartialSigner<Address> {
  const owner = params.address as Address;
  return {
    address: owner,
    signTransactions: async (
      transactions: readonly Transaction[],
    ): Promise<readonly SignatureDictionary[]> =>
      Promise.all(
        transactions.map(async (transaction) => {
          const bytes = new Uint8Array(encoder.encode(transaction));
          const signature = await params.signRaw(bytes);
          if (signature.length !== 64) {
            throw new Error("secure-signer returned an invalid signature");
          }
          return {
            [owner]: signature as SignatureBytes,
          } satisfies SignatureDictionary;
        }),
      ),
  };
}
