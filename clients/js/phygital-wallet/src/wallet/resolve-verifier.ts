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
  phygitalToken: Address,
  config: {
    /** Full `/sign` URL */
    endpoint: string;
    fetch?: typeof fetch;
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

      const response = await httpFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phygitalToken,
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

/** Cacheable TokenVerifier + Config resolution (no HTTP signer). */
export type VerifierAccountSnapshot = {
  verifierAddress: Address;
  /** Verifier API base (e.g. `https://api.revibase.com`). */
  endpoint: string;
  configPda: Address;
  tokenVerifierPda: Address;
  /** True when the co-signer is a Config default verifier. */
  requiresOwnerCosignAssertion: boolean;
  /** True when default-verifier fee balance / paymaster applies. */
  usesDefaultPaymaster: boolean;
};

export type ResolvedVerifier = VerifierAccountSnapshot & {
  verifier: TransactionPartialSigner;
};

function signerFromSnapshot(
  phygitalToken: Address,
  snapshot: VerifierAccountSnapshot,
  config: {
    fetch?: typeof fetch;
  },
): ResolvedVerifier {
  return {
    ...snapshot,
    verifier: createVerifierEndpointSigner(
      snapshot.verifierAddress,
      phygitalToken,
      {
        endpoint: verifierSignUrl(snapshot.endpoint),
        fetch: config.fetch,
      },
    ),
  };
}

function snapshotFromAccounts(args: {
  tokenVerifierPda: Address;
  configPda: Address;
  tokenVerifierEncoded: Awaited<
    ReturnType<typeof fetchEncodedAccounts>
  >[number];
  configEncoded: Awaited<ReturnType<typeof fetchEncodedAccounts>>[number];
}): VerifierAccountSnapshot {
  const { tokenVerifierPda, configPda, tokenVerifierEncoded, configEncoded } =
    args;

  const onChainConfig = decodeConfig(configEncoded);
  const defaults = new Set<string>();
  if (onChainConfig.exists) {
    for (const v of onChainConfig.data.verifiers.slice(
      0,
      onChainConfig.data.verifierCount,
    )) {
      defaults.add(String(v));
    }
  }

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
  if (!selectedVerifier) {
    throw new Error("No verifier configured for phygital-wallet execute");
  }

  return {
    verifierAddress: selectedVerifier,
    endpoint: DEFAULT_VERIFIER_API_BASE,
    configPda,
    tokenVerifierPda,
    requiresOwnerCosignAssertion: true,
    usesDefaultPaymaster: true,
  };
}

/** Fetch TokenVerifier + Config into a {@link VerifierAccountSnapshot}. */
export async function fetchVerifierAccountSnapshot(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  phygitalToken: Address,
): Promise<VerifierAccountSnapshot> {
  const [[tokenVerifierPda], [configPda]] = await Promise.all([
    findTokenVerifierPda({ phygitalToken }),
    findConfigPda(),
  ]);

  const [tokenVerifierEncoded, configEncoded] = await fetchEncodedAccounts(
    rpc,
    [tokenVerifierPda, configPda],
  );

  return snapshotFromAccounts({
    tokenVerifierPda,
    configPda,
    tokenVerifierEncoded,
    configEncoded,
  });
}

export async function resolveVerifier(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  phygitalToken: Address,
  config: {
    fetch?: typeof fetch;
    /** Skip getMultipleAccounts when provided. */
    snapshot?: VerifierAccountSnapshot;
  } = {},
): Promise<ResolvedVerifier> {
  if (config.snapshot) {
    return signerFromSnapshot(phygitalToken, config.snapshot, config);
  }

  const snapshot = await fetchVerifierAccountSnapshot(rpc, phygitalToken);
  return signerFromSnapshot(phygitalToken, snapshot, config);
}
