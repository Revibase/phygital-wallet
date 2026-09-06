import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  type SignatureDictionary,
  type TransactionPartialSigner,
} from "@solana/kit";
import {
  fetchMaybeTokenVerifier,
  fetchConfig,
  findConfigPda,
  findTokenVerifierPda,
} from "phygital-wallet-sdk";

const DEFAULT_ENDPOINT = "https://api.revibase.com/sign";
const SYSTEM = "11111111111111111111111111111111";
const base64Encoder = getBase64Encoder();

/** HTTP verifier signer used as fee payer for set/clear token verifier. */
export async function createAppVerifierSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalToken: Address,
): Promise<TransactionPartialSigner> {
  const [[tokenVerifierPda], [configPda]] = await Promise.all([
    findTokenVerifierPda({ phygitalToken }),
    findConfigPda(),
  ]);

  const [override, configAccount] = await Promise.all([
    fetchMaybeTokenVerifier(rpc, tokenVerifierPda),
    fetchConfig(rpc, configPda),
  ]);

  if (override.exists) {
    return createHttpSigner(
      override.data.verifier,
      override.data.endpoint || DEFAULT_ENDPOINT,
    );
  }

  const verifiers = configAccount.data.verifiers as readonly Address[];
  const first = verifiers.find((v) => String(v) !== SYSTEM);
  if (!first) {
    throw new Error("No default transaction verifier configured");
  }
  return createHttpSigner(first, DEFAULT_ENDPOINT);
}

function createHttpSigner(
  verifierAddress: Address,
  endpoint: string,
): TransactionPartialSigner {
  return {
    address: verifierAddress,
    signTransactions: async (transactions, options) => {
      options?.abortSignal?.throwIfAborted();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: transactions.map((transaction) =>
            getBase64EncodedWireTransaction(transaction),
          ),
        }),
        signal: options?.abortSignal,
      });
      const body = (await response.json().catch(() => ({}))) as {
        signatures?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error ?? `Verifier sign request failed (${response.status})`,
        );
      }
      if (!body.signatures || body.signatures.length !== transactions.length) {
        throw new Error("Verifier returned unexpected signatures");
      }
      return body.signatures.map((signature) => {
        const bytes = new Uint8Array(base64Encoder.encode(signature));
        return Object.freeze({
          [verifierAddress]: Object.freeze(bytes),
        }) as SignatureDictionary;
      });
    },
  };
}
