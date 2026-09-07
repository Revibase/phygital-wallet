# `auth/`

Owner-app authentication and standing-policy HTTP surface.

| File | Role |
|------|------|
| `device-routes.ts` | Platform passkey register / login; `GET /auth/device/gate` (session+browse+link+claimed); link → WebAuthn + DO `addOwner`; unlink → on-chain teardown + WebAuthn + DO clear; browse-unlock cookie check/mint/clear |
| `browse-unlock-session.ts` | Short-lived httpOnly `revibase_browse_unlock` (tap / Hold); `Domain=.revibase.com` in prod |
| `device-session.ts` | Device session cookie (`revibase_device_session`); shared domain in prod |
| `session-hmac.ts` | Shared HMAC mint/parse for both session cookies |
| `session-cookie-attrs.ts` | Cookie secure / SameSite / Domain for app middleware visibility |
| `device-db.ts` | `device_credentials` + listing index `device_token_links` |
| `policies-routes.ts` | Policy/grant HTTP; mutations require platform WebAuthn verified in TokenSigner DO; `cosignConfig` binding used for Config-default verifier config tx co-sign via `/sign` |
| `pending-approvals-db.ts` | Soft-deny inbox (API D1 only; never authorizes spend) |

Owner-of-record is the **TokenSigner DO** single-row `owner` (current only;
no past-owner history). A new phone links only after the current owner unlinks
(WebAuthn → clear owner + all policies). `device_token_links` is a Home listing cache.

Policy mutations: `POST .../mutation-options` with write binding → platform assertion → PUT/DELETE/grants/unlink.
