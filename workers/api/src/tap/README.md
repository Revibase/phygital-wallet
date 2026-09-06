# `tap/`

NFC accessory verification (`GET /verify-tap`).

| File | Role |
|------|------|
| `routes.ts` | Query params → verify URL → counter KV → identifier + counter |
| `verify-dynamic-url.ts` | Cryptographic URL check (no counter) |
| `counter-session.ts` | Monotonic counter vs stored high-water mark |
| `counter-store.ts` | KV read/write (counter only, no TTL) |

Does **not** mint the app login cookie (`revibase_device_session`). That comes
only from platform passkey register / assert under `auth/`. Linking uses
platform WebAuthn via `POST /auth/device/links`. Successful taps mint an
httpOnly `revibase_browse_unlock` cookie (short TTL) for browse access.
