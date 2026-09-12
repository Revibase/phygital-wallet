# `shared/`

Infrastructure used by every domain. Prefer **not** putting product logic here.

| File                 | Role                                      |
| -------------------- | ----------------------------------------- |
| `http.ts`            | `json()` responses (no-store)             |
| `cors.ts`            | Allowed browser origins                   |
| `request-context.ts` | AsyncLocalStorage for `env` + `waitUntil` |
| `db.ts`              | D1 accessor (`phygital_token` binding)    |
| `crypto/base64.ts`   | Kit base64 helpers                        |
| `solana/`            | Cluster + address parse                   |
| `utils.ts`           | `getErrorMessage`                         |
