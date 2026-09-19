# Revibase API

Cloudflare Worker (Hono) behind `https://api.revibase.com`.

## Map

```
src/
  index.ts          Entry — CORS, request store, mounts
  shared/           HTTP, D1, cookies, crypto, logging
  auth/             Accessory unlock + owner/browse sessions
  owner-wallet/     Encrypted owner blob backup
  tokens/           Fee-balance proxy + verified catalog
  fees/             Webhook fee credit/debit → TokenSigner DO
  transactions/     GET /getFeePayer + POST /sign
  webhooks/         POST /webhooks/transactions + activity

../api-signer/      Private Worker: TokenSigner DO (per token)
```

| Topic                 | Doc                                                  |
| --------------------- | ---------------------------------------------------- |
| Fee-payer signing     | [`../api-signer/README.md`](../api-signer/README.md) |
| Fee balance / webhook | § Fee balance below                                  |
| Sessions              | `src/auth/`                                          |

## Setup

```bash
pnpm install
cp workers/api/.dev.vars.example workers/api/.dev.vars
cp workers/api-signer/.dev.vars.example workers/api-signer/.dev.vars
# POLICY_SESSION_SECRET on API; FEE_PAYER_SECRET_KEYS on api-signer
pnpm --filter api dev
```

## Routes

Cookie floor (non-public routes): matching `revibase_browse_unlock` **or**
`revibase_owner_browse`. `revibase_owner_session` is login state only — it does
not admit protected routes by itself.

| Method     | Path                                   | Access   | Notes                                                 |
| ---------- | -------------------------------------- | -------- | ----------------------------------------------------- |
| GET        | `/health`                              | Public   | Liveness                                              |
| POST       | `/accessory/unlock/tap`                | Public   | NFC dynamic URL → browse-unlock cookie                |
| POST       | `/accessory/unlock/challenge`          | Public   | WebAuthn challenge for Hold                           |
| POST       | `/accessory/unlock/webauthn`           | Public   | Finish Hold → browse-unlock cookie                    |
| GET/DELETE | `/owner-session`                       | Public\* | Owner login cookie                                    |
| POST       | `/accessory/owner-browse`              | Public†  | Mint per-item owner-browse (`owner_session` required) |
| GET        | `/accessory/session`                   | Public\* | Session status                                        |
| POST       | `/owner-wallet/blob/backup-challenge`  | Public   | ed25519 challenge for PUT (signer mints)              |
| POST       | `/owner-wallet/blob/restore-challenge` | Public   | WebAuthn challenge for restore (signer mints)         |
| POST       | `/owner-wallet/blob/restore`           | Public   | WebAuthn assertion → ciphertext (signer)              |
| PUT        | `/owner-wallet/blob`                   | Public   | ed25519 proof → store + session; create needs attestationObject |
| GET        | `/getFeePayer`                         | Public   | Default fee-payer pubkey (open CORS)                  |
| POST       | `/sign`                                | Public   | Fee co-sign via TokenSigner DO (open CORS)            |
| POST       | `/webhooks/transactions`               | HMAC     | Activity index + fee credit/debit                     |
| GET        | `/wallets/:address/activity`           | Browse   | Indexed wallet activity                               |
| GET        | `/tokens/fee-balance`                  | Browse‡  | Prepaid fee balance                                   |
| GET        | `/tokens/verified`                     | Browse   | Verified catalog                                      |

\*Response depends on cookies when present.
†Exempt from the cookie floor; handler authenticates via `owner_session`.
‡Must match browse-unlock or owner-browse for that token.

## Fee balance

Per-token prepaid balance lives in the **TokenSigner DO**:

1. **Top-up:** SOL → `TOP_UP_ACCUMULATOR` via `executeWithAuthority`; webhook → DO credit
2. **Gate:** DO on `/sign` reserves the attempt floor against **available** balance
   (settled − open reserves); webhook debit settles (releases reserve + charges actual)
3. **Debit:** webhook → DO debit when a default fee payer sponsors a confirmed execute
4. **Expiry:** DO alarm releases reserves that never confirm (~90s)

`POST /sign` stays **public** (third-party cosign).

Helius subscribe must watch `TOP_UP_ACCUMULATOR` and every `DEFAULT_FEE_PAYER_PUBKEYS` entry.

## Env / bindings

| Name                        | Where                    | Purpose                                   |
| --------------------------- | ------------------------ | ----------------------------------------- |
| `TOKEN_SIGNER`              | DO binding               | `TokenSigner` on `revibase-token-signer`  |
| `FEE_PAYER_SECRET_KEYS`     | api-signer               | Fee-payer pubkey → seed/keypair map       |
| `POLICY_SESSION_SECRET`     | api + app                | Session cookie HMAC                       |
| `WALLET_WEBHOOK_SECRET`     | api                      | HMAC for `/webhooks/transactions`         |
| `TOP_UP_ACCUMULATOR`        | api + api-signer (+ app) | Fee top-up destination                    |
| `DEFAULT_FEE_PAYER_PUBKEYS` | api                      | Default fee-payer set (debit attribution) |
| `WALLET_TX_QUEUE`           | Queue                    | `wallet-tx-ingest`                        |
| `phygital_token`            | D1                       | Sessions index, activity, audit_log       |

## Deploy

```bash
pnpm --filter api run deploy   # deploys api-signer first, then revibase-api
```
