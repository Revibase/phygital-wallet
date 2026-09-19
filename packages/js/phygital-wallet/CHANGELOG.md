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

### Changed

- Wallet wrap (`modifyAndWrapWalletTransaction`) always uses a version 1
  transaction for policy preview and the final wrap (legacy / v0 inputs are
  upgraded). Preview sims with placeholder CU / priority-fee config;
  measured resource limits are applied only when building the execute envelope.
- `getPhygitalWalletSigner` takes a phygital token PDA, previews policy locally,
  discovers the default fee payer from `https://api.revibase.com/getFeePayer`,
  prompts for the passkey only after preview succeeds, and obtains the fee-payer
  signature via `/sign`.
- Wallet Standard persists only the derived token and wallet PDAs under
  `revibase:wallet-standard:v3`.
- Signing phases: `preparing → previewing → awaitingPasskey → building → feePaying → complete`.
- Recent blockhash only (no durable nonce).

## 0.2.0

- Recovery-wallet challenge builders:
  `buildSetRecoveryWalletChallenge`, `buildClearRecoveryWalletChallenge`.
- `PolicyDeniedError` surfaces soft-deny metadata (`intentHash`, `details`).

## 0.1.1

- Initial public release.
