# Revibase fee-payer signer

Private Cloudflare Worker hosting one `TokenSigner` Durable Object per
`phygitalToken`. It has only two responsibilities:

1. Sign validated phygital-wallet transactions as the configured fee payer.
2. Maintain that token's prepaid fee balance and idempotent credit/debit events.

The worker has no public HTTP routes. The API worker calls it through the
`TOKEN_SIGNER` Durable Object binding (`script_name`: `revibase-token-signer`).

## RPC

- `getFeeBalance()` reads the token ledger.
- `applyFeeEvents(events)` applies idempotent webhook credits and debits.
- `signTransactions(transactions)` validates transaction shape, checks the
  prepaid balance, and returns fee-payer signatures.

Top-up transactions to `TOP_UP_ACCUMULATOR` are exempt from the minimum balance
check so an empty ledger can be funded.

## Configuration

- `FEE_PAYER_SECRET_KEYS`: JSON map of fee-payer address to seed/keypair.
- `TOP_UP_ACCUMULATOR`: destination address recognized as a fee top-up.
- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`.

Deploy the signer before the API so the Durable Object class exists:

```bash
pnpm --filter api-signer deploy
pnpm --filter api deploy
```
