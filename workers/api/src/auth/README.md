# `auth/`

Owner-app authentication and standing-policy HTTP surface.

| File | Role |
|------|------|
| `device-routes.ts` | Platform passkey register / login; `GET /auth/device/gate` (session+browse+link+claimed); link → WebAuthn + DO `addOwner`; unlink → on-chain teardown + WebAuthn + DO clear; `POST /auth/browse-unlock` (Hold mint) |
| `browse-unlock-session.ts` | Short-lived httpOnly `revibase_browse_unlock` (tap / Hold); `Domain=.revibase.com` in prod |
| `device-session.ts` | Device session cookie (`revibase_device_session`); shared domain in prod |
| `session-hmac.ts` | Shared HMAC mint/parse for both session cookies |
| `session-cookie-attrs.ts` | Cookie secure / SameSite / Domain for app middleware visibility |
| `device-db.ts` | `device_credentials` + listing index `device_token_links` |
| `policies-routes.ts` | Policy/grant/deny/cancel HTTP; owner approvals inbox + hibernatable live WS. Inbox on TokenSigner DO |
| `approvals-tickets.ts` | HMAC ticket head mint/parse for live / watch |
| `approval-constants.ts` | Soft-deny / watch-ticket TTL (matches DO) |
| `require-app-access.ts` | Global floor: device session **or** browse-unlock; public allowlist for verifier, token landing GETs, session issuers, and soft-deny ticket routes |

Owner-of-record is the **TokenSigner DO** single-row `owner` (current only;
no past-owner history). A new phone links only after the current owner unlinks
(WebAuthn → clear owner + all policies). `device_token_links` is a Home listing cache.

Policy mutations: `POST .../mutation-options` with write binding → platform assertion → PUT/DELETE/grants/unlink.
