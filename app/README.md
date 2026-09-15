# Revibase

Next.js frontend for Revibase: signed-in **home** (owned links) and **Wallet** on `/token`.
Backend APIs live in the sibling [`api/`](../api/) Worker (`https://api.revibase.com`).

## Setup

From the repo root:

```bash
pnpm install
cp app/.dev.vars.example app/.dev.vars
cp api/.dev.vars.example api/.dev.vars
# Set the same POLICY_SESSION_SECRET in both .dev.vars files
# (Next middleware verifies browse-unlock cookies with this HMAC).
# Use NEXT_PUBLIC_API_BASE_URL=http://localhost:8787 so cookies share the host.
# Terminal A — API Worker
pnpm --filter api dev
# Terminal B — Next app
pnpm --filter app dev
```

`/token/:address/**` (card, wallet, settings hub + leaves) is gated by
`src/middleware.ts` — valid browse-unlock cookie for that address. Missing
unlock redirects to `/token/:address/unlock` (Hold). Home accessory cards
navigate to `/token/:address` and rely on the same gate. The cookie is issued
by the API after NFC tap or Hold and verified locally with `POLICY_SESSION_SECRET`.
Owner actions (claim, policy edit) still use the signed-in owner wallet on the client.
