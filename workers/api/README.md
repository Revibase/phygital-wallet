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

**Auditor tip:** Fee / policy evaluate / co-sign / owner membership / soft-deny
inbox live in the `TokenSigner` DO on `api-signer/`. This Worker is an untrusted
edge: session UX and WebAuthn before `addOwner`.

## Setup

```bash
pnpm install
cp api/.dev.vars.example api/.dev.vars
cp api-signer/.dev.vars.example api-signer/.dev.vars
# POLICY_SESSION_SECRET on API; VERIFIER_SECRET_KEYS on api-signer
pnpm --filter api dev
```

## Routes

Protected by default: valid `revibase_device_session` **access** cookie **or**
`revibase_browse_unlock` cookie (browse-unlock must match the request token when
one is present). Login also sets `revibase_device_refresh` (~30d); use
`POST /auth/device-session/refresh` to mint a new access cookie without WebAuthn.

| Method | Path | Access | Notes |
|--------|------|--------|--------|
| GET | `/health` | Public | Liveness |
| POST | `/preview` / `/sign` | Public | Verifier (open CORS for 3p; app origins stay credentialed) |
| GET | `/auth/device/gate` | Public | Token landing (works with zero cookies; may refresh access) |
| GET | `/auth/device/register-options` | Public | Start passkey registration |
| POST | `/auth/device` | Public | Finish registration → access + refresh cookies |
| GET | `/auth/device-session/options` | Public | Start passkey sign-in |
| POST | `/auth/device-session` | Public | Finish sign-in → access + refresh cookies |
| POST | `/auth/device-session/refresh` | Public | Refresh cookie → new access (+ rotate refresh) |
| GET | `/auth/device-session` | Public | Current access session (silent refresh if needed) |
| GET | `/verify-tap` | Public | NFC → may set browse-unlock |
| POST | `/auth/browse-unlock` | Public | Accessory Hold → browse-unlock |
| POST | `/webhooks/helius` | Public\* | Shared secret (`HELIUS_WEBHOOK_AUTH`) |
| GET | `/auth/device/links` | Protected | Listing index |
| POST | `/auth/device/links` | Protected | Link → WebAuthn → DO `addOwner` |
| POST | `/auth/device/links/:token/mutation-options` | Protected | Claim WebAuthn challenge |
| DELETE | `/auth/device/links/:token` | Protected | WebAuthn → DO `removeOwnerAndClear` |
| GET/PUT/DELETE | `/policies/:token` | Protected | Owner session (+ WebAuthn on writes) |
| POST | `/policies/:token/mutation-options` | Protected | Owner WebAuthn challenge |
| POST | `/policies/:token/grants` | Protected | Owner WebAuthn |
| GET | `/policies/:token/approvals` | Protected | Soft-deny inbox |
| POST | `/policies/:token/approvals/deny` | Protected | Owner deny |
| GET | `/tokens/fee-balance` | Protected‡ | Matching browse-unlock **or** owner device session |
| GET | `/tokens/verified` | Protected | Verified catalog |
| POST | `/tokens/rarity` | Protected | Rarity index |

\*Webhook is on the cookie allowlist but still requires `HELIUS_WEBHOOK_AUTH`.  
‡Not readable cross-token with a random device session — must own the token or hold browse-unlock for it.

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
| `phygital_token` | D1 | credentials, link index, rarity |

## Deploy

`pnpm --filter api run deploy` deploys **api-signer first** (TokenSigner DO must
exist before `revibase-api` can bind `script_name`), then the API Worker.

```bash
pnpm --filter api run deploy
# or: pnpm deploy:api
```
