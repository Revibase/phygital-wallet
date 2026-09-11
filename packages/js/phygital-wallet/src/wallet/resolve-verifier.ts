import {
  fetchEncodedAccounts,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  type Address,
  type Rpc,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
  type TransactionWithLifetime,
  type TransactionWithinSizeLimit,
  type SolanaRpcApi,
  address,
} from "@solana/kit";

import { DEFAULT_VERIFIER_API_BASE, MAX_ENDPOINT_LEN } from "../constants.js";
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

/** Active Config verifier addresses (`verifiers[0..verifierCount)`). */
export function activeConfigVerifierAddresses(config: {
  verifiers: readonly Address[];
  verifierCount: number;
}): Set<string> {
  return new Set(
    config.verifiers.slice(0, config.verifierCount).map((v) => String(v)),
  );
}

export function isConfigDefaultVerifier(
  config: {
    verifiers: readonly Address[];
    verifierCount: number;
  } | null,
  verifier: Address | string,
): boolean {
  if (!config) return false;
  return activeConfigVerifierAddresses(config).has(String(verifier));
}

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

export function createVerifierEndpointSigner(
  verifierAddress: Address,
  config: {
    /** Full `/sign` URL */
    endpoint: string;
    fetch?: typeof fetch;
    /** Verifier session bearer; `/sign` is bearer-authenticated. */
    getAccessToken?: () => string | null | Promise<string | null>;
  },
): TransactionPartialSigner<Address> {
  const httpFetch = config.fetch ?? fetch;

  return {
    address: verifierAddress,
    signTransactions: async (
      transactions: readonly SignableTransaction[],
      options,
    ): Promise<readonly SignatureDictionary[]> => {
      options?.abortSignal?.throwIfAborted();

      const endpoint = assertHttpsEndpoint(config.endpoint);
      const accessToken = (await config.getAccessToken?.()) ?? null;

      const response = await httpFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
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
              body.error ?? `Verifier sign request failed (${response.status})`,
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

export type ResolvedVerifier = {
  verifierAddress: Address;
  /** Verifier API base (e.g. `https://api.revibase.com`). */
  endpoint: string;
  configPda: Address;
  tokenVerifierPda: Address;
  /** True when the co-signer is a Config default verifier. */
  requiresOwnerCosignAssertion: boolean;
  /** True when default-verifier fee balance / paymaster applies. */
  usesDefaultPaymaster: boolean;
  /** The signer for interacting with the resolved verifier. */
  verifier: TransactionPartialSigner;
};

function resolvedFromAccounts(args: {
  tokenVerifierPda: Address;
  configPda: Address;
  tokenVerifierEncoded: Awaited<
    ReturnType<typeof fetchEncodedAccounts>
  >[number];
  configEncoded: Awaited<ReturnType<typeof fetchEncodedAccounts>>[number];
  fetch?: typeof fetch;
  getAccessToken?: () => string | null | Promise<string | null>;
}): ResolvedVerifier {
  const {
    tokenVerifierPda,
    configPda,
    tokenVerifierEncoded,
    configEncoded,
    fetch: httpFetch,
    getAccessToken,
  } = args;

  const onChainConfig = decodeConfig(configEncoded);
  const defaults = onChainConfig.exists
    ? activeConfigVerifierAddresses(onChainConfig.data)
    : new Set<string>();

  const tokenVerifier = decodeTokenVerifier(tokenVerifierEncoded);
  if (tokenVerifier.exists) {
    const apiBase = normalizeVerifierApiBase(
      assertHttpsEndpoint(tokenVerifier.data.endpoint, {
        maxLen: MAX_ENDPOINT_LEN,
      }),
    );
    const verifierAddress = tokenVerifier.data.verifier;
    const isConfigDefault = defaults.has(String(verifierAddress));
    return {
      verifierAddress,
      endpoint: apiBase,
      configPda,
      tokenVerifierPda,
      requiresOwnerCosignAssertion: isConfigDefault,
      usesDefaultPaymaster: isConfigDefault,
      verifier: createVerifierEndpointSigner(address(verifierAddress), {
        endpoint: verifierSignUrl(apiBase),
        fetch: httpFetch,
        getAccessToken,
      }),
    };
  }

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

  return {
    verifierAddress: address(selectedVerifier),
    endpoint: DEFAULT_VERIFIER_API_BASE,
    configPda,
    tokenVerifierPda,
    requiresOwnerCosignAssertion: true,
    usesDefaultPaymaster: true,
    verifier: createVerifierEndpointSigner(address(selectedVerifier), {
      endpoint: verifierSignUrl(DEFAULT_VERIFIER_API_BASE),
      fetch: httpFetch,
      getAccessToken,
    }),
  };
}

export async function resolveVerifier(
  rpc: Rpc<SolanaRpcApi>,
  phygitalToken: Address,
  config: {
    fetch?: typeof fetch;
    getAccessToken?: () => string | null | Promise<string | null>;
  } = {},
): Promise<ResolvedVerifier> {
  const [[tokenVerifierPda], [configPda]] = await Promise.all([
    findTokenVerifierPda({ phygitalToken }),
    findConfigPda(),
  ]);

  const [tokenVerifierEncoded, configEncoded] = await fetchEncodedAccounts(
    rpc,
    [tokenVerifierPda, configPda],
  );

  return resolvedFromAccounts({
    tokenVerifierPda,
    configPda,
    tokenVerifierEncoded,
    configEncoded,
    fetch: config.fetch,
    getAccessToken: config.getAccessToken,
  });
}
