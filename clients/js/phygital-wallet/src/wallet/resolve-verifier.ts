import {
  fetchEncodedAccounts,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Rpc,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
  type TransactionWithLifetime,
  type TransactionWithinSizeLimit,
} from "@solana/kit";

import {
  DEFAULT_VERIFIER_API_BASE,
  MAX_ENDPOINT_LEN,
} from "../constants.js";
import { decodeConfig } from "../generated/accounts/config.js";
import { decodeTokenVerifier } from "../generated/accounts/tokenVerifier.js";
import { findConfigPda } from "../generated/pdas/config.js";
import { findTokenVerifierPda } from "../generated/pdas/tokenVerifier.js";
import { PolicyDeniedError } from "./preview.js";
import {
  normalizeVerifierApiBase,
  verifierSignUrl,
} from "./verifier-endpoint.js";

type SignableTransaction = Transaction &
  TransactionWithinSizeLimit &
  TransactionWithLifetime;

const base64Encoder = getBase64Encoder();

export function assertHttpsEndpoint(
  endpoint: string,
  options: { maxLen?: number } = {},
): string {
  const trimmed = endpoint.trim();
  if (!trimmed.startsWith("https://")) {
    throw new Error("Verifier endpoint must be an https URL");
  }
  if (options.maxLen !== undefined && trimmed.length > options.maxLen) {
    throw new Error(`Verifier endpoint exceeds ${options.maxLen} bytes`);
  }
  return trimmed;
}

export function createVerifierEndpointSigner<TAddress extends Address>(
  verifierAddress: TAddress,
  config: { /** Full `/sign` URL */ endpoint: string; fetch?: typeof fetch },
): TransactionPartialSigner<TAddress> {
  const httpFetch = config.fetch ?? fetch;

  return {
    address: verifierAddress,
    signTransactions: async (
      transactions: readonly SignableTransaction[],
      options,
    ): Promise<readonly SignatureDictionary[]> => {
      options?.abortSignal?.throwIfAborted();

      const endpoint = assertHttpsEndpoint(config.endpoint);

      const response = await httpFetch(endpoint, {
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
        code?: string;
        soft?: boolean;
        details?: Record<string, unknown>;
      };
      if (!response.ok) {
        if (body.code) {
          throw new PolicyDeniedError({
            code: body.code,
            error:
              body.error ??
              `Verifier sign request failed (${response.status})`,
            soft: Boolean(body.soft),
            intentHash:
              typeof body.details?.intentHash === "string"
                ? body.details.intentHash
                : undefined,
            details: body.details,
          });
        }
        throw new Error(
          body.error ?? `Verifier sign request failed (${response.status})`,
        );
      }

      if (!body.signatures || body.signatures.length !== transactions.length) {
        throw new Error("Verifier sign response missing signatures");
      }

      return body.signatures.map((signatureBase64) => {
        const signatureBytes = new Uint8Array(
          base64Encoder.encode(signatureBase64),
        );
        if (signatureBytes.length !== 64) {
          throw new Error("Verifier signature must be 64 bytes");
        }

        return {
          [verifierAddress]: signatureBytes as SignatureBytes,
        } satisfies SignatureDictionary;
      });
    },
  };
}

type ResolvedVerifier = {
  verifier: TransactionPartialSigner;
  /** Verifier API base (e.g. `https://api.revibase.com`). */
  endpoint: string;
  configPda: Address;
  tokenVerifierPda: Address;
};

export async function resolveVerifier(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  phygitalToken: Address,
  config: { fetch?: typeof fetch } = {},
): Promise<ResolvedVerifier> {
  const [[tokenVerifierPda], [configPda]] = await Promise.all([
    findTokenVerifierPda({ phygitalToken }),
    findConfigPda(),
  ]);

  const [tokenVerifierEncoded, configEncoded] = await fetchEncodedAccounts(rpc, [
    tokenVerifierPda,
    configPda,
  ]);

  const tokenVerifier = decodeTokenVerifier(tokenVerifierEncoded);
  if (tokenVerifier.exists) {
    const apiBase = normalizeVerifierApiBase(
      assertHttpsEndpoint(tokenVerifier.data.endpoint, {
        maxLen: MAX_ENDPOINT_LEN,
      }),
    );
    return {
      verifier: createVerifierEndpointSigner(tokenVerifier.data.verifier, {
        endpoint: verifierSignUrl(apiBase),
        fetch: config.fetch,
      }),
      endpoint: apiBase,
      configPda,
      tokenVerifierPda,
    };
  }

  const onChainConfig = decodeConfig(configEncoded);
  if (!onChainConfig.exists) {
    throw new Error("Phygital wallet config account not found");
  }
  const activeVerifiers = onChainConfig.data.verifiers.slice(
    0,
    onChainConfig.data.verifierCount,
  );
  if (activeVerifiers.length === 0) {
    throw new Error("No verifier configured for phygital-wallet execute");
  }

  const selectedVerifier =
    activeVerifiers[Math.floor(Math.random() * activeVerifiers.length)];
  if (!selectedVerifier) {
    throw new Error("No verifier configured for phygital-wallet execute");
  }

  const apiBase = DEFAULT_VERIFIER_API_BASE;
  return {
    verifier: createVerifierEndpointSigner(selectedVerifier, {
      endpoint: verifierSignUrl(apiBase),
      fetch: config.fetch,
    }),
    endpoint: apiBase,
    configPda,
    tokenVerifierPda,
  };
}
