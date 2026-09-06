# Revibase API

Cloudflare Worker (Hono) behind `https://api.revibase.com`.

## Start here (5-minute map)

```
api/src/
  index.ts          Worker entry — CORS, request store, mounts domains
  shared/           Cross-cutting: HTTP helpers, D1, Solana cluster, crypto
  tokens/           Verified catalog, rarity index, fee-balance
  tap/              NFC /verify-tap (pubkey + optional possession token)
  auth/             Device session + token links + standing policy / grants
  verifier/         POST /preview + /sign (proxies sensitive work to api-signer)
  fees/             Paymaster fee-balance ledger + Helius accounting
  webhooks/         POST /webhooks/helius

api-signer/         Private Worker: fee + authorizeIntent + co-sign (service binding only)
```

| If you care about… | Open |
|--------------------|------|
| Wallet co-signing / custom verifier | [`src/verifier/README.md`](./src/verifier/README.md) + [`../api-signer/README.md`](../api-signer/README.md) |
| Fee balance / top-up / webhook | this README § Fee balance |
| How HTTP routes are mounted | [`src/index.ts`](./src/index.ts) |
| Verified tokens / rarity index | [`src/tokens/README.md`](./src/tokens/README.md) |
| NFC tap verify | [`src/tap/README.md`](./src/tap/README.md) |
| Session cookie + Settings policies | [`src/auth/README.md`](./src/auth/README.md) |

**Auditor tip:** Sensitive fee / policy evaluate / co-sign live in `api-signer/`.
This Worker keeps public routes, policy CRUD, and pending-approvals UX.

## Setup

```bash
pnpm install
cp api/.dev.vars.example api/.dev.vars
cp api-signer/.dev.vars.example api-signer/.dev.vars
# Set POLICY_SESSION_SECRET on API; VERIFIER_SECRET_KEYS on api-signer
# (+ TOP_UP_ACCUMULATOR / HELIUS_WEBHOOK_AUTH as needed)
pnpm --filter api dev
```

## Routes

| Method | Path | Domain |
|--------|------|--------|
| GET | `/health` | entry |
| GET | `/verify-tap` | `tap/` |
| GET/POST | `/auth/device-session` | `auth/` (platform passkey login) |
| GET/POST | `/auth/device` | `auth/` (platform passkey register) |
| GET/POST | `/auth/device/links` | `auth/` (owned links; POST link) |
| GET | `/auth/device/links/status` | `auth/` |
| DELETE | `/auth/device/links/:token` | `auth/` (owner unlink) |
| POST | `/preview` | `verifier/` (+ fee balance gate) |
| POST | `/sign` | `verifier/` (+ fee balance gate) |
| GET/PUT/DELETE | `/policies/:phygitalToken` | `auth/` (owner session; standing policy opt-in) |
| POST | `/policies/:phygitalToken/grants` | `auth/` |
| GET/DELETE | `/policies/:phygitalToken/approvals…` | `auth/` |
| GET | `/wallet/activity` | `wallet/` (Helius Wallet API `/history` proxy) |
| GET | `/tokens/fee-balance` | `tokens/` / `fees/` |
| GET | `/tokens/verified` | `tokens/` (Jupiter) |
| POST | `/tokens/rarity` | `tokens/` (D1; client supplies DAS fields) |
| POST | `/webhooks/helius` | `webhooks/` |

**Client-side (app RPC / browser):** portfolio, collectible metadata, shortcuts.
Set `NEXT_PUBLIC_SOLANA_RPC_URL` to a DAS-capable endpoint (e.g. Helius).

## Fee balance (default-verifier paymaster)

When execute uses a **Config default verifier** as fee payer, network fees are
sponsored from that keypair. Per-`phygital_token` prepaid balance lives in D1:

1. **Top-up:** wallet sends SOL → `TOP_UP_ACCUMULATOR` with SPL Memo =
   `phygitalToken` address. Helius webhook credits `token_fee_balances`.
2. **Gate:** runs in `api-signer` on `/preview` and `/sign` (formula:
   `FEE_BASE_LAMPORTS + FEE_LAMPORTS_PER_IX * ixCount`). Top-up intents are
   exempt. Custom (non-default) verifiers skip the gate.
3. **Debit:** webhook on confirmed `phygital-wallet` execute with
   `nativeBalanceChange < 0` on a default verifier → debit that token.

**Helius webhook setup:** auth header = `HELIUS_WEBHOOK_AUTH`; include
`TOP_UP_ACCUMULATOR` and program `Fjbi9JrRAmSBdxQxbkcxYDp6JUwnLbFhU2GsieWQBLSg`
(enhanced txs with `accountData` + instructions).

Apply migration: `wrangler d1 migrations apply phygital-token --remote`

## Env / bindings

| Name | Where | Purpose |
|------|-------|---------|
| `VERIFIER_SIGNER` | service binding | Private signer Worker (fee + authorize + co-sign) |
| `VERIFIER_SECRET_KEYS` | **api-signer** secret | JSON map of verifier pubkey → seed (max 8) |
| `POLICY_SESSION_SECRET` | secret | HMAC for device session + possession tokens |
| `TOP_UP_ACCUMULATOR` | secret/var | SOL address that receives top-ups |
| `HELIUS_WEBHOOK_AUTH` | secret | Shared auth for `/webhooks/helius` |
| `SOLANA_RPC_URL` / `SOLANA_CLUSTER` | vars | DAS / chain reads |
| `JUPITER_API_KEY` | optional | verified token catalog |
| `phygital_token` | D1 | rarity + policies/grants + fee balances |
| `revibase_counter` | KV | NFC counter high-water mark (anti-replay) |

See [`.dev.vars.example`](./.dev.vars.example).

## Deploy

Deploy the private signer Worker first (service binding target), then the API:

```bash
pnpm deploy:api
# or:
# pnpm --filter api-signer run deploy
# pnpm --filter api run deploy
pnpm --filter api exec wrangler d1 migrations apply phygital-token --remote
```
