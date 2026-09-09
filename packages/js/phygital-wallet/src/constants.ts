import { SOLANA_MAINNET_CHAIN } from "@solana/wallet-standard-chains";

export const SLOT_HASHES_SYSVAR_ADDRESS =
  "SysvarS1otHashes111111111111111111111111111" as const;

export const MAX_ENDPOINT_LEN = 128;

/** Default verifier API origin (`/sign` and `/preview` are appended). */
export const DEFAULT_VERIFIER_API_BASE = "https://api.revibase.com" as const;

/** Wallet Standard chains — program is deployed on mainnet only. */
export const PHYGITAL_WALLET_CHAINS = [SOLANA_MAINNET_CHAIN] as const;

/** Refresh the tx blockhash when fewer than this many slots remain (~25s at 400ms). */
export const MIN_BLOCKHASH_REMAINING_SLOTS = 64n;

/** Safety margin applied on top of simulated compute-unit consumption. */
export const COMPUTE_UNIT_ESTIMATE_MARGIN = 1.1;

/** Fallback micro-lamports/CU when recent prioritization fees are empty. */
export const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = 10_000n;
