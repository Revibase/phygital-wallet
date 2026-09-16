# Changelog

## Unreleased

### Added

- `fetchPhygitalTokensByAuthority(rpc, authority)` — GPA discovery of phygital
  token PDAs for an ed25519 authority (filters discriminator, owner, and
  `AUTHORITY_VERSION`). Also exports `AUTHORITY_VERSION` and `AUTHORITY_GPA`.
- `execute_with_authority_using_policies`, used by the SDK to simulate the same
  policy checks as `execute` without requiring a secp256r1 signature.
- Optional `feePayer` configuration for `getPhygitalWalletSigner` and
  `registerPhygitalWallet` / `PhygitalWalletOptions`.
- Local Wallet Standard authentication using `startAuthentication`,
  `verifyResponse`, and `findPhygitalTokenPda` from `phygital-token-sdk`.

### Removed (breaking)

- Verifier connect-proof exchange, bearer sessions, verifier resolution, and
  the `getAccessToken` signer configuration.
- Durable nonce support in `getPhygitalWalletSigner`. Use a recent blockhash.
- The obsolete `wallet/connect.ts` helper.

### Changed

- `getPhygitalWalletSigner` now accepts a phygital token PDA directly, fetches
  its Authority account for policy preview, discovers the default fee payer
  from `https://api.revibase.com/getFeePayer`, requests the passkey only after
  preview succeeds, and obtains the separate fee-payer signature.
- Wallet Standard persists only the derived token and wallet PDAs under
  `revibase:wallet-standard:v3`.
- Signing phases now end with `feePaying` instead of `coSigning`.

### Migration

```ts
// Before: verifier proof + bearer.
const proof = await startPhygitalConnect(rpc);
const session = await exchangeConnectProof(/* ... */);
const signer = await getPhygitalWalletSigner(rpc, proof.phygitalToken, {
  getAccessToken: () => session.accessToken,
});

// After: known token PDA. The default fee payer is discovered over HTTP.
const signer = await getPhygitalWalletSigner(rpc, phygitalTokenPda);
```

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
