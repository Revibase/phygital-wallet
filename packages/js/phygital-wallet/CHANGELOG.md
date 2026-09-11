# Changelog

## 0.2.0

Verifier-driven connect flow. One call now performs the tap, resolves the
token's verifier from chain, exchanges the proof for a short-lived session
bearer, and returns a ready signer — integrators never handle bearers,
blockhashes, or headers.

### Added

- `connectPhygitalWallet(rpc, …)` — the full connect ceremony, returning
  `{ phygitalToken, signer }` with the session bearer wired in and
  auto-refreshed. Types `PhygitalConnection`, `VerifierSessionBearer`; plus
  `SESSION_SKEW_MS` and `AccessoryMismatchError`.
- `normalizeVerifierApiBase` and the verifier endpoint helpers.
- Token-verifier and recovery-wallet challenge builders:
  `buildSetTokenVerifierChallenge`, `buildClearTokenVerifierChallenge`,
  `buildSetRecoveryWalletChallenge`, `buildClearRecoveryWalletChallenge`.
- `assertHttpsEndpoint`, `activeConfigVerifierAddresses`,
  `isConfigDefaultVerifier`.

### Changed

- `resolveVerifier` now selects a random active on-chain `Config` verifier for
  the default-paymaster path and attaches the session bearer to `/sign`.
  `ResolvedVerifier` gained `requiresOwnerCosignAssertion` and
  `usesDefaultPaymaster`.
- `PolicyDeniedError` surfaces soft-deny metadata (`intentHash`, `details`).

## 0.1.1

- Initial public release.
