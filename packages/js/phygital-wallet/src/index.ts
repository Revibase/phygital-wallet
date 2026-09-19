/**
 * Public API for `phygital-wallet-sdk`.
 *
 * Prefer `getPhygitalWalletSigner` for Kit spends, or `registerPhygitalWallet`
 * for Wallet Standard / `@solana/connectors` discovery.
 */

export {
  getPhygitalWalletSigner,
  type PhygitalWalletSignPhase,
  type PhygitalWalletSignerCallbacks,
  type PhygitalWalletSignerConfig,
} from "./wallet/signer.js";

export { buildSetAuthorityChallenge } from "./utils/challenges.js";
export {
  AUTHORITY_GPA,
  AUTHORITY_VERSION,
  fetchPhygitalTokensByAuthority,
} from "./utils/fetch-phygital-tokens-by-authority.js";
export { compileWalletInstructions } from "./wallet/compile.js";
export {
  EXECUTE_NAMED_ACCOUNT_COUNT,
  EXECUTE_WITH_AUTHORITY_NAMED_ACCOUNT_COUNT,
  executeRemainingAccountOffset,
  sliceExecuteRemainingAccounts,
} from "./wallet/execute-remaining.js";
export { createDefaultFeePayer } from "./wallet/fee-payer.js";
export {
  PolicyDeniedError,
  policyDeniedErrorFromSolanaError,
} from "./wallet/preview.js";

export { registerPhygitalWallet } from "./wallet-standard/index.js";

export * from "./generated/index.js";
