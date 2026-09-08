export {
  getPhygitalWalletSigner,
  type PhygitalWalletSignPhase,
  type PhygitalWalletSignPhaseContext,
  type PhygitalWalletSignerCallbacks,
  type PhygitalWalletSignerConfig,
} from "./wallet/signer.js";
export { PolicyDeniedError, previewWalletIntent } from "./wallet/preview.js";
export {
  approvalsReconnectDelayMs,
  attachApprovalsLiveHeartbeat,
  createApprovalsLiveReconnect,
  cancelRemoteApproval,
  fetchApprovalWatchStatus,
  parseApprovalLiveEvent,
  parseRetryAfterMs,
  verifierApprovalsLiveUrl,
  verifierApprovalsWatchStatusUrl,
  type ApprovalLiveEvent,
  type ApprovalWatchStatus,
} from "./wallet/approval-watch.js";
export {
  assertHttpsEndpoint,
  createVerifierEndpointSigner,
  fetchVerifierAccountSnapshot,
  resolveVerifier,
  type ResolvedVerifier,
  type VerifierAccountSnapshot,
} from "./wallet/resolve-verifier.js";
export {
  normalizeVerifierApiBase,
  verifierPreviewUrl,
  verifierSignUrl,
} from "./wallet/verifier-endpoint.js";
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

export * from "./generated/index.js";
