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

export { PolicyDeniedError } from "./wallet/preview.js";

export {
  assertHttpsEndpoint,
  activeConfigVerifierAddresses,
  isConfigDefaultVerifier,
  resolveVerifier,
  type ResolvedVerifier,
} from "./wallet/resolve-verifier.js";

export { normalizeVerifierApiBase } from "./wallet/verifier-endpoint.js";

export {
  DEFAULT_VERIFIER_API_BASE,
  MAX_ENDPOINT_LEN,
} from "./constants.js";

export {
  buildClearRecoveryWalletChallenge,
  buildClearTokenVerifierChallenge,
  buildSetRecoveryWalletChallenge,
  buildSetTokenVerifierChallenge,
} from "./utils/challenges.js";

export {
  registerPhygitalWallet,
  type PhygitalWalletOptions,
} from "./wallet-standard/index.js";

export * from "./generated/index.js";