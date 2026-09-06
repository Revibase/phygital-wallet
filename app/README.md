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
# (Next middleware verifies device-session + browse-unlock cookies).
# Use NEXT_PUBLIC_API_BASE_URL=http://localhost:8787 so cookies share the host.
# Terminal A — API Worker
pnpm --filter api dev
# Terminal B — Next app
pnpm --filter app dev
```

Wallet routes under `/token/:address/wallet/**` are gated by `src/middleware.ts`
(valid browse-unlock for that address, or a valid device-session cookie).
Owner-only settings leaves (send protections, limits, recipients, exceptions,
signing, recovery) require a device-session cookie.
