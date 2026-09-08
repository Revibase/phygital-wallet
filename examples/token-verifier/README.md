# Custom token-verifier example

Bare-minimum HTTPS co-signer for a custom on-chain **TokenVerifier**. Matches
what [`getPhygitalWalletSigner`](../../clients/js/phygital-wallet/src/wallet/signer.ts)
needs — nothing more.

## Contract

`TokenVerifier.endpoint` = API base (HTTPS, ≤128 chars, no `/preview` or `/sign`).

| Method | Path | Role |
|--------|------|------|
| `POST` | `/preview` | Policy check on **body instructions** (before NFC) |
| `POST` | `/sign` | Co-sign **wrapped** wire transaction(s) |

```
getPhygitalWalletSigner
  → POST /preview   (body ixs)
  → passkey / wrap
  → POST /sign      (base64 wire tx) → { signatures: [base64] }
```

Soft denials, grants, and approval WebSockets are **optional product UX** (e.g.
Revibase). This example always hard-denies (`soft: false`) or allows.

### `POST /preview`

```json
{
  "phygitalToken": "<base58>",
  "instructions": [
    {
      "programAddress": "<base58>",
      "accounts": [{ "address": "<base58>", "role": 0 }],
      "data": "<base64>"
    }
  ]
}
```

Allow: `{ "ok": true, "intentHash": "<hex>" }`  
Deny: `{ "ok": false, "code": "…", "error": "…", "soft": false }`

### `POST /sign`

```json
{ "transactions": ["<base64 wire transaction>"] }
```

Allow: `{ "signatures": ["<base64 64-byte ed25519>"] }`  
Deny: `{ "error": "…", "code": "…", "soft": false }` (HTTP 4xx)

The verifier pubkey in the transaction must match this server's key. Execute
inners are re-checked with the same policy; config txs are co-signed only.

## Quick start

```bash
pnpm install
pnpm --filter phygital-verifier-sdk build
pnpm --filter phygital-wallet-sdk build

cd examples/token-verifier
pnpm generate-keypair
cp .env.example .env    # paste VERIFIER_SECRET_KEY
pnpm dev                # http://127.0.0.1:8787
```

Tunnel to HTTPS, then `set_token_verifier(newVerifier, endpoint)`.

## Customize

Edit [`src/policy.ts`](./src/policy.ts) — adjust `buildPaymentsPolicy` knobs /
`evaluatePolicy`. Caps: `MAX_SOL_LAMPORTS`, `MAX_USDC_RAW`.

## Layout

```
src/
  index.ts           HTTP server
  policy.ts          phygital-verifier-sdk check (yours to change)
  decode-tx.ts       Wire tx → execute body / config
  keys.ts            Ed25519
  routes/preview.ts  POST /preview
  routes/sign.ts     POST /sign
```
