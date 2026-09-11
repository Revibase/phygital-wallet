# Changelog

## 0.3.0

Adds the **verifier connect + session** layer on top of the existing policy
authoring API. The policy API (`fromCodamaProgram`, `allow`, `deny`,
`allowProgram`, `denyProgram`, `aggregate`, `policy`) is unchanged, so upgrading
from `0.2.x` is non-breaking.

### Added

- **Connect proofs** for the `/connect` and `/connect/tap` endpoints:
  - `verifyConnectProof` — WebAuthn-over-blockhash proof; injects
    `isBlockhashValid` (freshness) and `consumeSignCount` (replay). Types
    `IsBlockhashValid`, `ConsumeSignCount`, `WebAuthnConnectProof`.
  - `verifyDynamicConnectProof` — dynamic NFC tap proof; requires `rpc` and
    `expectedPhygitalToken` (the proof's resolved token is re-checked against
    it) and injects `consumeCounter`. Types `ConsumeTapCounter`,
    `DynamicTapParams`, `DynamicTapResult`.
- **Session bearers** — `signVerifierBearer`, `verifyVerifierBearer`, and
  `normalizeOrigin`, with types `VerifierBearerPayload`, `DecodeVerifierKey`,
  `IsAuthorizedVerifier`. Asymmetric, on-chain-rooted, domain-separated.
- `ConnectProofError` + `ConnectProofCode` — stable machine-readable codes and
  HTTP statuses for every connect failure.
- Docs: [verifier HTTP contract](./docs/verifier-http.md) and a framework-agnostic
  [verifier scaffold](./docs/scaffold.md).

## 0.2.0

- Initial public policy-authoring API.
