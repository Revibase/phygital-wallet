# `tokens/`

Server-only token helpers. **Wallet portfolio / collectible metadata / shortcuts
run on the app** against `NEXT_PUBLIC_SOLANA_RPC_URL` (BYO-RPC ready).

| File | Role |
|------|------|
| `routes.ts` | `/tokens/fee-balance`, `/tokens/verified` |
| `verified-tokens.ts` | Jupiter verified catalog (API key) |
| `payment-token.ts` / `usdc-mint.ts` | Verified-catalog token shape + USDC mint |
