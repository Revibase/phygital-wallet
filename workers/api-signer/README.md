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
| `signTransactions(wires, { challengeId?, assertion?, origin? })` | config + Config default verifier: owner WebAuthn (`cosignConfig`); custom token verifier / execute: none | canSign → (config: fee → optional assertion) → (execute: fee → authorize) → `backend.sign` |
| `previewAuthorize({ instructions })` | none | wallet PDA → authorize(`preview`) → fee |
| `getPolicy` / `getFeeBalance` / `hasOwner` / `isOwner` / `getOwnerCredentialId` | none | reads |
| `createMutationChallenge` | none (api gates session) | mint short-TTL challenge bound to write intent; returns `challengeId` + options |
| `addOwner` | **WebAuthn** | sole owner; binding `{ kind: "addOwner", credentialId }`; fails `linked_elsewhere` if claimed |
| `setPolicy` / `clearPolicy` / `createGrant` / `removeOwnerAndClear` | **challengeId + assertion** | binding (policy / intent / kind) must match mint; consume + verify sig |
| `removeOwnerAndClear` | **WebAuthn** | on-chain: token verifier + recovery wallet PDAs must be closed; then wipe owner + policies/grants |
| `applyFeeEvents` | webhook auth on api | idempotent credit/debit |

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
