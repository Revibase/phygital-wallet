# Revibase API

Cloudflare Worker (Hono) behind `https://api.revibase.com`.

## Start here (5-minute map)

```
api/src/
  index.ts          Worker entry — CORS, request store, mounts domains
  shared/           Cross-cutting: HTTP helpers, D1, Solana cluster, crypto
  tokens/           Verified catalog, rarity index, fee-balance (proxied to DO)
  tap/              NFC /verify-tap (pubkey + counter anti-replay)
  auth/             Device session + link index + policy HTTP (WebAuthn → DO)
  verifier/         POST /preview + /sign (proxies to TokenSigner DO)
  fees/             Helius fee accounting → DO applyFeeEvents
  webhooks/         POST /webhooks/helius

api-signer/         Private Worker: TokenSigner Durable Object (per token)
```

| If you care about… | Open |
|--------------------|------|
| Wallet co-signing / custom verifier | [`../api-signer/README.md`](../api-signer/README.md) |
| Fee balance / top-up / webhook | this README § Fee balance |
| Session + Settings policies | [`src/auth/README.md`](./src/auth/README.md) |

**Auditor tip:** Fee / policy evaluate / co-sign / owner membership live in the
`TokenSigner` DO on `api-signer/`. This Worker is an untrusted edge: session UX,
pending-approvals inbox, and WebAuthn before `addOwner`.

## Setup

```bash
pnpm install
cp api/.dev.vars.example api/.dev.vars
cp api-signer/.dev.vars.example api-signer/.dev.vars
# POLICY_SESSION_SECRET on API; VERIFIER_SECRET_KEYS on api-signer
pnpm --filter api dev
```

## Routes

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `/auth/device-session` | platform passkey login |
| GET/POST | `/auth/device/links` | listing index; POST link → WebAuthn → DO `addOwner` |
| GET/POST/DELETE | `/auth/browse-unlock` | httpOnly browse cookie (tap also sets via `/verify-tap`) |
| POST | `/auth/device/links/:token/mutation-options` | claim WebAuthn challenge (`addOwner` binding) |
| DELETE | `/auth/device/links/:token` | WebAuthn assertion → DO `removeOwnerAndClear` |
| POST | `/preview` / `/sign` | TokenSigner DO |
| POST | `/policies/:token/mutation-options` | owner WebAuthn challenge bound to write intent |
| PUT/DELETE | `/policies/:token` | assertion required |
| POST | `/policies/:token/grants` | assertion required |
| GET/DELETE | `/policies/:token/approvals…` | inbox on API D1 |
| GET | `/tokens/fee-balance` | DO ledger |
| POST | `/webhooks/helius` | → DO `applyFeeEvents` |

## Fee balance

Per-token prepaid balance lives in the **TokenSigner DO** (not D1):

1. **Top-up:** SOL → `TOP_UP_ACCUMULATOR` + memo; Helius webhook → DO credit  
   (new token ledgers start with 0.001 SOL)  
2. **Gate:** DO on preview/sign (`execute`: fee + policy; config: owner WebAuthn + fee)  
3. **Debit:** webhook → DO debit on confirmed execute  

## Env / bindings

| Name | Where | Purpose |
|------|-------|---------|
| `TOKEN_SIGNER` | DO binding | `TokenSigner` on `revibase-verifier-signer` |
| `VERIFIER_SECRET_KEYS` | **api-signer** | verifier seeds |
| `POLICY_SESSION_SECRET` | api **and app** | device session + browse-unlock HMAC (app middleware verifies cookies) |
| `phygital_token` | D1 | credentials, link index, pending approvals, rarity |

## Deploy

`pnpm --filter api run deploy` deploys **api-signer first** (TokenSigner DO must
exist before `revibase-api` can bind `script_name`), then the API Worker.

```bash
pnpm --filter api run deploy
# or: pnpm deploy:api
```
