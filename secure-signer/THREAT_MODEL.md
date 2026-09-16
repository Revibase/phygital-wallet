# Secure Signer — Threat Model

The signer iframe is a **non-custodial browser-side signing boundary** for the
phygital-wallet **owner (ed25519 authority) key**. The parent app is treated as
**potentially fully XSS-compromised**.

## Trust boundary

```
UNTRUSTED                                 TRUSTED
parent app (app.*)   ── postMessage ──►   signer origin (signer.*)
- untrusted D1 backup of ciphertext       - generates/holds the key only transiently
- untrusted tx requester                   - localStorage ciphertext for sign/export
- may lie, replay, swap blobs/txs          - independent v1 decode + policy
                                           - trusted confirm UI + per-op WebAuthn PRF
```

Everything crossing into the signer is attacker-controlled (§44). The signer
independently derives or cryptographically verifies anything security-sensitive.
The parent only ever legitimately receives: public keys, ciphertext, signatures,
and generic results/errors.

## What it defends against

| Threat                                     | Defense                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent XSS reads the private key           | Key generated + decrypted only in the signer origin; never posted in plaintext; per-op WebAuthn; export is a dedicated in-iframe ceremony.                                      |
| Malicious storage / stolen blob            | Blob is public ciphertext; PRF→HKDF→AES-256-GCM; holding it reveals nothing without the passkey.                                                                                |
| Blob substitution (wallet A shown, B used) | AAD binds {pubkey, credentialId, salt, rpId}; after decrypt the derived pubkey must match; the trusted UI shows the **derived** key, never a parent label.                      |
| Transaction substitution after confirm     | Validated message bytes are copied + frozen; authorization is single-use and bound to their SHA-256; the exact frozen bytes are signed (no re-encode → no parser differential). |
| Arbitrary signing oracle                   | Top-level program allowlist (phygital-wallet); owner must be a required signer and the instruction `authority`; inner spend is clear-signed; per-tx WebAuthn.                |
| Replay                                     | Random requestId + freshness window + duplicate rejection + single-use authorization.                                                                                           |
| Message injection                          | `event.origin` **and** `event.source === window.parent`; strict schema (unknown fields/types/versions rejected); size caps before parsing.                                      |
| Signer-origin XSS                          | Strict CSP (`script-src 'self'`, no `unsafe-inline`/`eval`), no third-party runtime JS, no innerHTML/inline handlers, self-hosted hashed assets, build-time inline guard.       |
| Decryption oracle                          | All decrypt/auth failures collapse to one generic code.                                                                                                                         |
| DoS by parent                              | Accepted for availability; confidentiality/integrity preserved. Operations are serialized.                                                                                      |

## What it explicitly does NOT defend against (§42 — no false claims)

- **Signer-origin XSS or a malicious browser extension** with host access to the
  signer origin. If the signer origin itself is compromised, the key is exposed.
  Minimizing the signer's code and dependencies is mitigation, not a guarantee.
- **The user being socially engineered** through the export ceremony. WebAuthn
  proves presence, not comprehension — a user can click through a clear-signed
  screen. Clickjacking of a framed signer cannot be fully prevented (the signer
  is, by design, framed and cannot frame-bust); the out-of-page WebAuthn modal
  and in-iframe danger warnings are partial mitigations.
- **On-chain behavior inside the allowed program.** Program-ID allowlisting does
  not constrain what the phygital-wallet program does via CPI. This key is the
  on-chain _escape hatch_ (`execute_with_authority` bypasses policy); the signer
  clear-signs the inner spend but does not (and cannot) re-impose the on-chain
  passkey policy.
- **Secure memory erasure.** JavaScript cannot guarantee wiping. Buffers we own
  are best-effort zeroed; copies made by the runtime are not under our control.
- **Loss of the sole passkey.** With no synced copy, the wallet is unrecoverable
  (see PRF matrix). This is an accepted trade of the v1 recovery model.

## WebAuthn PRF portability (recovery)

Recovery relies on the **same PRF output** being available for the same synced
passkey on another device. This is authenticator/browser-dependent.

| Ecosystem                                  | PRF            | Cross-device (synced) recovery   |
| ------------------------------------------ | -------------- | -------------------------------- |
| iCloud Keychain (Safari/iOS/macOS)         | Yes            | Yes, within the Apple ecosystem  |
| Google Password Manager (Chrome, Android)  | Yes            | Yes, within the Google ecosystem |
| 1Password (browser extension, iOS/Android) | Yes            | Yes, within 1Password            |
| Windows Hello (platform)                   | Yes (get-time) | Device-bound — no sync           |
| Hardware security keys (FIDO2)             | Yes (get-time) | Device-bound — no sync           |
| Firefox                                    | **No PRF**     | Not supported — fails closed     |
| Cross-ecosystem (Apple ↔ Google)           | n/a            | Not portable today               |

If PRF is unavailable, the signer **throws** rather than weakening encryption
(§11). Document to users: use a synced, PRF-capable passkey and keep it; there is
no seed/multi-credential backup in v1 (accepted decision).

## Key residual risks to revisit

1. **Recovery/backup** — a lost sole passkey strands funds. A future version
   could add an encrypted seed backup or multi-credential enrollment.
2. **Transaction v1 activation** — the signer and parent both use `@solana/kit`
   v1 codecs. Confirm cluster support for SIMD-0385 before relying on v1 on a
   given network.
3. **Shared RP ID enrollment** — passkeys are created on the **app** origin
   (`rpId` = `revibase.com` / `localhost`) so Safari can register. The signer
   iframe only runs `get` + PRF and wraps the ed25519 seed. The parent must never
   receive PRF output or seed material.
