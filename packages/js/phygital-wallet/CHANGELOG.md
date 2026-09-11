# Changelog

## Unreleased

### Added

- `startPhygitalConnect(rpc)` → `PhygitalConnectProof` — tap and produce a
  connect proof (fresh blockhash, WebAuthn assertion, derived token, resolved
  verifier). The counterpart to `startAuthentication`.
- `exchangeConnectProof({ endpoint, blockhash, response })` → session bearer.
  POST a proof to the token's verifier `/connect` (or verify it on your own
  backend with `verifyConnectProof` from `phygital-verifier-sdk`).

### Removed (breaking)

- **`connectPhygitalWallet` and the `PhygitalConnection` type.** Connect is now
  composed from the primitives above plus `getPhygitalWalletSigner`, mirroring
  the login flow (`startAuthentication` → `verifyResponse`). Migrate:

  ```ts
  // before
  const { phygitalToken, signer } = await connectPhygitalWallet(rpc);

  // after
  const proof = await startPhygitalConnect(rpc);
  const session = await exchangeConnectProof({
    endpoint: proof.resolved.endpoint,
    blockhash: proof.blockhash,
    response: proof.response,
  });
  const signer = await getPhygitalWalletSigner(rpc, proof.phygitalToken, {
    resolved: proof.resolved,
    getAccessToken: () => session.accessToken,
  });
  ```

  A signer's `getAccessToken` returns the cached bearer and throws once it
  lapses — see the README ("When the session expires"). It does **not** re-tap
  on its own (a surprise NFC prompt mid-action is bad UX); the app reconnects on
  an explicit user action. The Wallet Standard adapter follows the same rule:
  signing throws on an expired session and the consumer calls `standard:connect`
  again.

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
