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
export { createDefaultFeePayer } from "./wallet/feePayer.js";
export { PolicyDeniedError } from "./wallet/preview.js";

export { registerPhygitalWallet } from "./wallet-standard/index.js";

export * from "./generated/index.js";
