# Secure Signer — Threat Model

The signer iframe is a **non-custodial browser-side signing boundary** for the
phygital-wallet **owner (ed25519 authority) key**. It replaces Helius WaaS. The
parent app is treated as **potentially fully XSS-compromised**.

## Trust boundary

```
UNTRUSTED                                 TRUSTED
parent app (app.*)   ── postMessage ──►   signer origin (signer.*)
- untrusted storage of the ciphertext     - generates/holds the key only transiently
- untrusted tx requester                   - independent v1 decode + policy
- may lie, replay, swap blobs/txs          - trusted confirm UI + per-op WebAuthn PRF
```

Everything crossing into the signer is attacker-controlled (§44). The signer
independently derives or cryptographically verifies anything security-sensitive.
The parent only ever legitimately receives: public keys, ciphertext, signatures,
and generic results/errors.

## What it defends against

| Threat | Defense |
|---|---|
| Parent XSS reads the private key | Key generated + decrypted only in the signer origin; never posted in plaintext; per-op WebAuthn; export is a dedicated in-iframe ceremony. |
| Malicious storage / stolen blob | Blob is public ciphertext; PRF→HKDF→AES-256-GCM; holding it reveals nothing without the passkey. |
| Blob substitution (wallet A shown, B used) | AAD binds {pubkey, credentialId, salt, rpId}; after decrypt the derived pubkey must match; the trusted UI shows the **derived** key, never a parent label. |
| Transaction substitution after confirm | Validated message bytes are copied + frozen; authorization is single-use and bound to their SHA-256; the exact frozen bytes are signed (no re-encode → no parser differential). |
| Arbitrary signing oracle | Top-level program allowlist (phygital-wallet + Memo); owner must be a required signer and the Fjbi `authority`; inner spend is clear-signed; per-tx WebAuthn. |
| Replay | Random requestId + freshness window + duplicate rejection + single-use authorization. |
| Message injection | `event.origin` **and** `event.source === window.parent`; strict schema (unknown fields/types/versions rejected); size caps before parsing. |
| Signer-origin XSS | Strict CSP (`script-src 'self'`, no `unsafe-inline`/`eval`), no third-party runtime JS, no innerHTML/inline handlers, self-hosted hashed assets, build-time inline guard. |
| Decryption oracle | All decrypt/auth failures collapse to one generic code. |
| DoS by parent | Accepted for availability; confidentiality/integrity preserved. Operations are serialized. |

## What it explicitly does NOT defend against (§42 — no false claims)

- **Signer-origin XSS or a malicious browser extension** with host access to the
  signer origin. If the signer origin itself is compromised, the key is exposed.
  Minimizing the signer's code and dependencies is mitigation, not a guarantee.
- **The user being socially engineered** through the export ceremony. WebAuthn
  proves presence, not comprehension — a user can click through a clear-signed
  screen. Clickjacking of a framed signer cannot be fully prevented (the signer
  is, by design, framed and cannot frame-bust); the out-of-page WebAuthn modal
  and an in-iframe typed confirmation are partial mitigations.
- **On-chain behavior inside the allowed program.** Program-ID allowlisting does
  not constrain what the phygital-wallet program does via CPI. This key is the
  on-chain *escape hatch* (`execute_with_authority` bypasses policy); the signer
  clear-signs the inner spend but does not (and cannot) re-impose the on-chain
  passkey policy.
- **Secure memory erasure.** JavaScript cannot guarantee wiping. Buffers we own
  are best-effort zeroed; copies made by the runtime are not under our control.
- **Loss of the sole passkey.** With no synced copy, the wallet is unrecoverable
  (see PRF matrix). This is an accepted trade of the v1 recovery model.

## WebAuthn PRF portability (recovery)

Recovery relies on the **same PRF output** being available for the same synced
passkey on another device. This is authenticator/browser-dependent.

| Ecosystem | PRF | Cross-device (synced) recovery |
|---|---|---|
| iCloud Keychain (Safari/iOS/macOS) | Yes | Yes, within the Apple ecosystem |
| Google Password Manager (Chrome, Android) | Yes | Yes, within the Google ecosystem |
| 1Password (browser extension, iOS/Android) | Yes | Yes, within 1Password |
| Windows Hello (platform) | Yes (get-time) | Device-bound — no sync |
| Hardware security keys (FIDO2) | Yes (get-time) | Device-bound — no sync |
| Firefox | **No PRF** | Not supported — fails closed |
| Cross-ecosystem (Apple ↔ Google) | n/a | Not portable today |

If PRF is unavailable, the signer **throws** rather than weakening encryption
(§11). Document to users: use a synced, PRF-capable passkey and keep it; there is
no seed/multi-credential backup in v1 (accepted decision).

## Key residual risks to revisit

1. **Recovery/backup** — a lost sole passkey strands funds. A future version
   could add an encrypted seed backup or multi-credential enrollment.
2. **v1 emission dependency** — `@solana/kit@8.1.0` decodes only ≤ v0. The signer
   parses v1 with its own decoder, but the parent's tx-build path must emit v1
   (needs a v1-capable kit) before the end-to-end seam is live on mainnet.
3. **Enrollment in a cross-origin iframe** — credential *creation* is less widely
   supported than assertion; a top-level popup fallback on the signer origin may
   be required on some browsers.
