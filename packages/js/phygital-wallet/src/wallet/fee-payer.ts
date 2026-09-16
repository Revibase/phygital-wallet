import {
  address,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  type Address,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
} from "@solana/kit";
import { DEFAULT_FEE_PAYER_ENDPOINT } from "../constants.js";
import { PolicyDeniedError } from "./preview.js";

export async function createDefaultFeePayer(config?: {
  /** Full `/sign` URL */
  endpoint?: string;
  fetch?: typeof fetch;
}): Promise<TransactionPartialSigner<Address>> {
  const httpFetch = config?.fetch ?? fetch;
  const feePayer = address(
    (
      (await (
        await httpFetch(
          `${config?.endpoint ?? DEFAULT_FEE_PAYER_ENDPOINT}/getFeePayer`
        )
      ).json()) as { feePayer: string }
    ).feePayer
  );
  return {
    address: feePayer,
    signTransactions: async (
      transactions: readonly Transaction[],
      options
    ): Promise<readonly SignatureDictionary[]> => {
      options?.abortSignal?.throwIfAborted();

      const response = await httpFetch(
        `${config?.endpoint ?? DEFAULT_FEE_PAYER_ENDPOINT}/sign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transactions: transactions.map((transaction) =>
              getBase64EncodedWireTransaction(transaction)
            ),
          }),
          signal: options?.abortSignal,
        }
      );

      const body = (await response.json().catch(() => ({}))) as {
        signatures?: string[];
        error?: string;
        code?: string;
        details?: Record<string, unknown>;
      };
      if (!response.ok) {
        if (body.code) {
          throw new PolicyDeniedError({
            code: body.code,
            error: body.error ?? `Sign request failed (${response.status})`,
            details: body.details,
          });
        }
        throw new Error(
          body.error ?? `Sign request failed (${response.status})`
        );
      }

      if (!body.signatures || body.signatures.length !== transactions.length) {
        throw new Error("Fee payer sign response missing signatures");
      }

      return body.signatures.map((signatureBase64) => {
        const signatureBytes = new Uint8Array(
          getBase64Encoder().encode(signatureBase64)
        );
        if (signatureBytes.length !== 64) {
          throw new Error("Fee payer signature must be 64 bytes");
        }

        return {
          [feePayer]: signatureBytes as SignatureBytes,
        } satisfies SignatureDictionary;
      });
    },
  };
}
