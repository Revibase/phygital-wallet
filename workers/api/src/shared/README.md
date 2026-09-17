# `shared/`

Cross-cutting infrastructure. Prefer **not** putting product logic here.

| File | Role |
| --- | --- |
| `http.ts` | `json()` responses (no-store) |
| `cors.ts` | Credentialed vs open CORS |
| `log.ts` | Structured Workers Logs |
| `request-context.ts` | AsyncLocalStorage for `env` + `waitUntil` |
| `db.ts` | D1 accessor (`phygital_token` binding) |
| `crypto/base64.ts` | Kit base64 helpers |
| `kv-challenge.ts` | Single-use KV challenge factory |
| `signed-session-cookie.ts` | HMAC session cookie factory |
| `session-ttl.ts` | Browse vs owner-session TTLs |
| `solana/` | Cluster + address parse |
| `errors.ts` | Shared coded-error helpers |
