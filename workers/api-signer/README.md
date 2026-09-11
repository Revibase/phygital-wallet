# Revibase verifier signer (TokenSigner Durable Object)

Private Cloudflare Worker (`revibase-verifier-signer`) that hosts the
**`TokenSigner`** Durable Object (one instance per `phygitalToken`).

Owns:

1. Fee balance gate + ledger  
2. `authorizeIntent` (standing policy + Approve-once grants)  
3. Verifier ed25519 co-sign via pluggable backend  
4. Owner membership + platform WebAuthn-gated policy/grant mutations  

It is **not** publicly routed. Only [`api`](../api/) calls it through the
`TOKEN_SIGNER` Durable Object binding (`script_name`).

## RPC (`TokenSigner`)

| Method | Auth | Behavior |
|--------|------|----------|
| `verifyWebAuthnConnectAndMintBearer({ blockhash, response, origin, ttlMs })` | WebAuthn-over-blockhash proof | verify sig → `isBlockhashValid` (RPC) → consume `webauthn` counter (`signCount`) → mint bearer (`iss` = a random held verifier) — one critical section per token |
| `verifyDynamicConnectAndMintBearer({ pk, s, c, n, origin, ttlMs })` | dynamic NFC proof | verify P-256 → resolve token from `pk` and assert it equals this DO's token → consume `tap` counter → mint bearer |
| `signTransactions(wires, { challengeId?, assertion?, origin? })` | every tx's decoded co-signer must be a key we hold (`canSign`); config + Config default verifier: owner WebAuthn (`cosignConfig`); custom token verifier / execute: none | per-tx: `canSign(decoded.verifier)` → (config: fee → optional assertion) → (execute: fee → authorize) → `backend.sign` |
| `previewAuthorize({ instructions })` | none | wallet PDA → authorize(`preview`) → fee |
| `getPolicy` / `getFeeBalance` / `hasOwner` / `isOwner` / `getOwnerCredentialId` | none | reads |
| `createMutationChallenge` | none (api gates session) | mint short-TTL challenge bound to write intent; returns `challengeId` + options |
| `addOwner` | **WebAuthn** | sole owner; binding `{ kind: "addOwner", credentialId }`; fails `linked_elsewhere` if claimed |
| `setPolicy` / `clearPolicy` / `createGrant` / `removeOwnerAndClear` | **challengeId + assertion** | binding (policy / intent / kind) must match mint; consume + verify sig |
| `removeOwnerAndClear` | **WebAuthn** | on-chain: token verifier + recovery wallet PDAs must be closed; then wipe owner + policies/grants |
| `applyFeeEvents` | webhook auth on api | idempotent credit/debit |

## Session-signing key vs. on-chain co-signer (two independent roles)

The bearer's `iss` and the on-chain execute co-signer are **decoupled**, so each
rotates on its own with no coordination and no RPC on the hot path:

- **Session-signing key** = the bearer's `iss`. Picked at random from the keys we
  hold (`VERIFIER_SECRET_KEYS`, via `getRandomVerifier`) purely as a session
  identity. It is validated only against the `api` worker's local
  `DEFAULT_VERIFIER_PUBKEYS` (the accept check on `/preview`, `/sign`, and
  `/auth/app-session`) — never against on-chain config.
- **Execute co-signer** = the verifier the wallet SDK's `resolveVerifier` picks at
  random from the **live on-chain `Config.verifiers`** when building the execute
  tx. `/sign` accepts any co-signer we hold (`canSign`), and the on-chain program
  enforces that it is a configured verifier. So the bearer never needs to be an
  on-chain key.

### Rotation

- **Session-signing key (env only):** add to `VERIFIER_SECRET_KEYS` **and**
  `DEFAULT_VERIFIER_PUBKEYS` together, deploy. To retire: drop from
  `VERIFIER_SECRET_KEYS` (stop minting), keep in `DEFAULT_VERIFIER_PUBKEYS` for ≥
  one bearer TTL (15 min) so live bearers still verify, then drop it. No chain.
- **On-chain verifier (chain only):** add/remove in `Config.verifiers`;
  `resolveVerifier` reads `Config` on its next resolve and adapts. No env, no
  deploy. The only invariant — inherent anyway — is that we hold the secret for
  every active on-chain verifier (`Config.verifiers ⊆ VERIFIER_SECRET_KEYS`): you
  can't put a key on-chain you can't sign with.

Neither rotation can break the other.

## Signing backends

| `VERIFIER_SIGNER_BACKEND` | Status |
|---------------------------|--------|
| `secrets` (default) | `VERIFIER_SECRET_KEYS` JSON map pubkey → seed/keypair (max 8) |
| `kms` | Reserved |

## Secrets

```bash
wrangler secret put VERIFIER_SECRET_KEYS --config wrangler.jsonc
```

## Deploy

Deploy **signer before API** so the DO class exists. Prefer the API package
script (it chains both):

```bash
pnpm --filter api deploy
# or explicitly:
pnpm --filter api-signer deploy && pnpm --filter api exec wrangler deploy
```

Local:

```bash
pnpm --filter api dev
# starts both via `wrangler dev -c api -c api-signer`
```
