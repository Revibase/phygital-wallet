# secure-signer

A **non-custodial Solana signing iframe** for the phygital-wallet **owner
(ed25519 authority) key**, intended to replace Helius WaaS. The owner key is
generated inside an isolated, cross-origin signer origin, wrapped by a key
derived from a **WebAuthn PRF** output (HKDF-SHA256 → AES-256-GCM), and stored as
a **portable encrypted blob** the parent/backend persists. The parent app is
treated as **potentially XSS-compromised**; the signer is the trust boundary.

> This is security infrastructure. It is **not** "XSS-proof", "unhackable", or
> "100% secure." See [THREAT_MODEL.md](./THREAT_MODEL.md) for exactly what it does
> and does not protect against.

## Layout

```
secure-signer/
  signer/         # the trusted origin (Vite vanilla-ts, no runtime UI framework)
    src/
      constants.ts        # centralized security constants (allowlist, caps, fixed KDF params)
      protocol.ts         # strict postMessage schema validation (pure, fuzzable)
      encoding.ts         # bounded base64/base64url + constant-time compare
      wallet-format.ts    # deterministic binary blob + AES-GCM AAD
      crypto.ts           # WebCrypto HKDF/AES-GCM + @noble ed25519
      wallet-service.ts   # PRF→HKDF→AES-GCM pipeline (PRF injected → headless-testable)
      state.ts            # state machine, replay/freshness, digest-bound authorization
      webauthn.ts         # BrowserPrfProvider (thin WebAuthn shell)
      tx/decode-v1.ts     # bounded Solana v1 (SIMD-0385) parser
      tx/policy.ts        # program allowlist + owner binding (depth-2 clear-signing)
      tx/fjbi.ts          # phygital-wallet-sdk instruction decode + inner-instruction summary
      ui/ui.ts            # trusted confirm/create/import/export screens (textContent only)
      main.ts             # dispatcher: origin+source, schema, state, explicit switch
      testing/encode-v1.ts# TEST/DEMO-only v1 encoder (kit cannot emit v1 yet)
    deploy/               # _headers (Cloudflare/Netlify) + nginx.conf
  parent-demo/    # UNTRUSTED parent reference integration (separate origin)
  THREAT_MODEL.md
```

## Develop

```bash
pnpm --filter secure-signer test        # 50 unit/adversarial tests (headless)
pnpm --filter secure-signer typecheck
pnpm --filter secure-signer build        # tsc + vite build + CSP inline guard
# Two-origin demo (signer :5173, parent :5174):
pnpm --filter secure-signer dev
pnpm --filter secure-signer-parent-demo dev
```

WebAuthn/PRF flows require a real authenticator and a browser that supports the
PRF extension (see the compatibility matrix in the threat model); the full crypto
pipeline is covered headlessly with a mock PRF.

## Transaction support

The signer parses/signs **Solana transaction v1 only** (SIMD-0385, live on
mainnet since ~2026-09-09) and rejects legacy/v0. v1 moves resource limits into
the message, so ComputeBudget instructions are rejected. `@solana/kit@8.1.0`
cannot yet decode *or emit* v1, so:

- the signer uses its own bounded v1 parser (`tx/decode-v1.ts`);
- the parent's transaction-building path must be upgraded to a **v1-capable
  `@solana/kit`** before the end-to-end seam runs against live clusters.

## Policy (depth 2)

Top-level programs must be on the allowlist (phygital-wallet + Memo). The owner
must be a required signer and, for each phygital-wallet instruction that has one,
the `authority` account. `executeWithAuthority`'s inner instructions are decoded
and **displayed** (clear-signing), not blocked — this key is the on-chain escape
hatch by design. See `tx/policy.ts` and the threat model.

## postMessage API

Request → result: `AUTH_START` → `AUTH_COMPLETE`, `GET_PUBLIC_KEY`,
`IMPORT_KEY`, `SIGN_TRANSACTION`, `EXPORT_ENCRYPTED_WALLET`, `EXPORT_PRIVATE_KEY`.
Mid-flow: `BLOB_NEEDED` (signer → parent) / `BLOB_PROVIDED` (parent → signer) for
discoverable restore when no local ciphertext is available.

All requests carry `{ protocolVersion: 1, requestId, timestamp? }`; blobs are
base64url, transactions base64. Errors are generic `{ type: "ERROR", requestId, code }`.
Unknown/malformed input fails closed. The signer posts `{ type: "SIGNER_READY" }` on load.

`AUTH_START` unlocks in the iframe, or completes create when the parent sends
`authMode: "create"` + `credentialId` (passkey registered on the app with the
shared RP ID).

**Passkey create:** runs on the **app** (top-level, Safari-safe) with
`rpId` = `revibase.com` (prod) or `localhost` (dev). The signer then prompts
once more for PRF and wraps the wallet key — the app never sees PRF/seed.
Unlock / sign stay in the iframe.

## Parent integration seam

`useOwnerWallet` / `createHeliusSigner` are backed by a signer client that mounts
the iframe and maps: `address` ← `GET_PUBLIC_KEY`/create/import; `signTransaction`
← `SIGN_TRANSACTION`; `exportWallet` ← `EXPORT_PRIVATE_KEY`. The paymaster
co-sign / send path is unchanged. This swap is gated on the v1-capable kit
upgrade above.

## Deployment

Serve `signer/dist/` from a **separate origin** with the headers in
`signer/deploy/` (strict CSP with `connect-src 'none'`, `frame-ancestors <app>`,
`Permissions-Policy: publickey-credentials-get=(self)`, HSTS, no-store index).
Do **not** add `X-Frame-Options` (breaks the intended embedding) or COEP. The
parent must delegate `publickey-credentials-get` to the signer origin via its own
`Permissions-Policy` header and the iframe `allow=` attribute.
