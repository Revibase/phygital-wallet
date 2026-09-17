# Revibase fee-payer signer

Private Cloudflare Worker hosting one `TokenSigner` Durable Object per
`phygitalToken`. It has only two responsibilities:

1. Sign validated phygital-wallet transactions as the configured fee payer.
2. Maintain that token's prepaid fee balance, sign-time reserves, and
   idempotent credit/debit events.

The worker has no public HTTP routes. The API worker calls it through the
`TOKEN_SIGNER` Durable Object binding (`script_name`: `revibase-token-signer`).

## RPC

- `getFeeBalance()` reads settled / reserved / available lamports.
- `applyFeeEvents(events)` applies idempotent webhook credits and debits
  (debits FIFO-release open reserves first).
- `signTransactions(transactions)` validates shape, **reserves** the attempt
  floor against available balance (unless the wire is a fee top-up), signs,
  and schedules a DO alarm to release expired reserves (~90s TTL).

Top-up transactions to `TOP_UP_ACCUMULATOR` are exempt from the balance gate
so an empty ledger can be funded. New ledgers get a starter grant
(`STARTER_FEE_BALANCE_LAMPORTS` = 1_000_000) so claim/execute can begin.

## Configuration

- `FEE_PAYER_SECRET_KEYS`: JSON map of fee-payer address to seed/keypair.
- `TOP_UP_ACCUMULATOR`: destination address recognized as a fee top-up.
- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`.

Deploy the signer before the API so the Durable Object class exists:

```bash
pnpm --filter api-signer deploy
pnpm --filter api deploy
```
