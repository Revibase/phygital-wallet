# secure-signer

A **non-custodial Solana signing iframe** for the phygital-wallet **owner
(ed25519 authority) key**. The owner key is generated inside an isolated,
cross-origin signer origin, wrapped by a key derived from a **WebAuthn PRF**
output (HKDF-SHA256 → AES-256-GCM), and stored as a **portable encrypted blob**
the parent/backend persists. The parent app is treated as **potentially
XSS-compromised**; the signer is the trust boundary.

> This is security infrastructure. It is **not** "XSS-proof", "unhackable", or
> "100% secure." See [THREAT_MODEL.md](./THREAT_MODEL.md) for exactly what it does
> and does not protect against.

## Layout

```
secure-signer/
  src/
    constants.ts          # allowlist, caps, fixed KDF params
    protocol.ts           # postMessage schema validation
    encoding.ts           # bounded base64/base64url + constant-time compare
    wallet-format.ts      # deterministic binary blob + AES-GCM AAD
    crypto.ts             # WebCrypto HKDF/AES-GCM + @noble ed25519
    wallet-service.ts     # PRF→HKDF→AES-GCM pipeline
    state.ts              # state machine, replay/freshness, digest auth
    webauthn.ts           # BrowserPrfProvider
    tx/decode-v1.ts       # @solana/kit v1 decode + decompile
    tx/policy.ts          # program allowlist + owner binding
    tx/parser.ts          # instruction decode + clear-signing summary
    ui/ui.ts              # trusted confirm/create/import/export screens
    main.ts               # dispatcher
  deploy/                 # _headers + nginx.conf
  THREAT_MODEL.md
```

## Develop

```bash
pnpm --filter secure-signer test        # unit/adversarial tests (headless)
pnpm --filter secure-signer typecheck
pnpm --filter secure-signer build        # tsc + vite build + CSP inline guard
pnpm --filter secure-signer dev          # signer origin (Vite)
```

WebAuthn/PRF flows need a real authenticator with PRF support; the crypto
pipeline is covered headlessly with a mock PRF.

## Transaction support

Signs **Solana transaction v1 only** (SIMD-0385); rejects legacy/v0. v1 moves
resource limits into the message, so ComputeBudget instructions are rejected by
policy. Decoding uses `@solana/kit`.

## Policy (depth 2)

Top-level programs must be on the allowlist (phygital-wallet). The owner must be
a required signer and, for each phygital-wallet instruction that has one, the
`authority` account. `executeWithAuthority` inner instructions are decoded and
**displayed** (clear-signing), not blocked — this key is the on-chain escape
hatch by design. See `tx/policy.ts` and the threat model.

## postMessage API

Request → result: `AUTH_START` → `AUTH_COMPLETE`, `SIGN_TRANSACTION`,
`EXPORT_PRIVATE_KEY`. Mid-flow: `BLOB_NEEDED` / `BLOB_PROVIDED` for discoverable
restore when signer-origin localStorage has no ciphertext.

Sign / export use **signer localStorage only**. The parent always shows the
create/unlock sheet before `AUTH_START`. `AUTH_COMPLETE` returns ciphertext so
the parent can PUT the D1 backup (and mint `owner_session`).

All requests carry `{ protocolVersion: 1, requestId, timestamp? }`; blobs are
base64url, transactions base64. Errors are generic
`{ type: "ERROR", requestId, code }`. Unknown/malformed input fails closed. The
signer posts `{ type: "SIGNER_READY" }` on load.

`AUTH_START` unlocks in the iframe, or completes create when the parent sends
`authMode: "create"` + `credentialId` (passkey registered on the app with the
shared RP ID). Optional `putChallenge` produces a possession proof so the parent
can PUT the blob and mint `owner_session` in one step.

**Passkey create:** runs on the **app** (top-level, Safari-safe) with
`rpId` = `revibase.com` (prod) or `localhost` (dev). The signer then prompts
once more for PRF and wraps the wallet key — the app never sees PRF/seed.
Unlock / sign stay in the iframe.

## Parent integration seam

`useOwnerWallet` mounts the iframe and maps: `address` ← cookie session /
create/import; `signTransaction` ← `SIGN_TRANSACTION`; `exportWallet` ←
`EXPORT_PRIVATE_KEY`. Fee sponsorship still goes through API `/getFeePayer` +
`/sign`.

## Deployment

Serve `dist/` from a **separate origin** with the headers in `deploy/` (strict
CSP with `connect-src 'none'`, `frame-ancestors <app>`,
`Permissions-Policy: publickey-credentials-get=(self), clipboard-write=(self)`,
HSTS, no-store index). Do **not** add `X-Frame-Options` (breaks embedding) or
COEP. The parent must delegate `publickey-credentials-get` and `clipboard-write`
to the signer origin via `Permissions-Policy` and the iframe `allow=` attribute.
