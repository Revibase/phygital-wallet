# `auth/`

Owner-app authentication and standing-policy HTTP surface.

| File | Role |
|------|------|
| `device-routes.ts` | Platform passkey register / login; `GET /auth/device/gate` (session+browse+link+claimed); link → WebAuthn + DO `addOwner`; unlink → on-chain teardown + WebAuthn + DO clear; `POST /auth/browse-unlock` (Hold mint) |
| `browse-unlock-session.ts` | Short-lived httpOnly `revibase_browse_unlock` (tap / Hold); `Domain=.revibase.com` in prod |
| `device-session.ts` | Access cookie (`revibase_device_session`, ~15m) + refresh cookie (`revibase_device_refresh`, ~30d); shared domain in prod |
| `session-hmac.ts` | Shared HMAC mint/parse for session cookies |
| `session-cookie-attrs.ts` | Cookie secure / SameSite / Domain for app middleware visibility |
| `device-db.ts` | `device_credentials` + listing index `device_token_links` |
| `policies-routes.ts` | Policy/grant/deny HTTP; owner approvals inbox. Inbox on TokenSigner DO |
| `require-app-access.ts` | Global floor: device **access** session **or** browse-unlock; public allowlist for verifier, token landing GETs, session issuers/refresh |

Owner-of-record is the **TokenSigner DO** single-row `owner` (current only;
no past-owner history). A new phone links only after the current owner unlinks
(WebAuthn → clear owner + all policies). `device_token_links` is a Home listing cache.

Policy mutations: `POST .../mutation-options` with write binding → platform assertion → PUT/DELETE/grants/unlink.
