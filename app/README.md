# Revibase

Next.js frontend for Revibase: signed-in **home** (owned links) and **Wallet** on `/token`.
Backend APIs live in [`workers/api/`](../workers/api/) (`https://api.revibase.com`).

## Setup

From the repo root:

```bash
pnpm install
cp app/.dev.vars.example app/.dev.vars
cp workers/api/.dev.vars.example workers/api/.dev.vars
# Set the same POLICY_SESSION_SECRET in both .dev.vars files
# (Next middleware verifies browse-unlock cookies with this HMAC).
# Use NEXT_PUBLIC_API_BASE_URL=http://localhost:8787 so cookies share the host.
# Terminal A — API Worker
pnpm --filter api dev
# Terminal B — Next app
pnpm --filter app dev
```

`/token/:address/**` is gated by `src/middleware.ts` — valid browse-unlock or
owner-browse cookie for that address. Missing unlock redirects to
`/token/:address/unlock` (Hold). The cookie is issued by the API after NFC tap
or Hold and verified locally with `POLICY_SESSION_SECRET`. Owner actions (claim,
policy edit) use the signed-in owner wallet on the client.
