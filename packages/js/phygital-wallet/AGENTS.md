# AGENTS — phygital-wallet-sdk

Prefer package-root exports. Do not deep-import `wallet/*` or `wallet-standard/*`.

## Routing

| Goal | Use |
| --- | --- |
| Sign as wallet PDA | `getPhygitalWalletSigner(rpc, phygitalTokenPda, options?)` |
| Browser wallet | `registerPhygitalWallet({ rpc, … })` once |
| Accessory auth | `startAuthentication` + `verifyResponse` + `findPhygitalTokenPda` (`phygital-token-sdk`) |
| Authority / policy | Generated `getSet*` / `getClear*` / `getExecute*` |
| Tokens by authority | `fetchPhygitalTokensByAuthority(rpc, authority)` |
| Decode / PDAs | Generated `fetch*` / `decode*` / `find*Pda` |

## Flow

1. Verified secp256r1 key → phygital token PDA → wallet PDA.
2. Authority account holds the ed25519 owner (distinct from fee payer).
3. Signer previews with `execute_with_authority_using_policies`, then builds
   `secp256r1 verify` + `execute`, fees, and fee-payer signature.
4. On-chain `execute` re-checks policy and may update counters.

No connect-proof, verifier bearer, or access-token session.

## Constraints

- One tx per `modifyAndSignTransactions`; recent blockhash only (no durable nonce).
- Default fee payer: `api.revibase.com` `getFeePayer` / `sign`.
- Preserve caller non-wallet signatures; wallet PDA is not an outer ed25519 signer.
- Preview authority = `Authority.header.authority` (no-op identity for simulation).
- Do not prompt passkey if policy simulation fails.
- Wallet Standard: derive token PDA from verified pubkey; persist only
  `{ phygitalTokenPda, walletPda }` at `revibase:wallet-standard:v3`;
  `solana:signMessage` must throw.

## Validate

```bash
pnpm --filter phygital-wallet-sdk test
pnpm --filter phygital-wallet-sdk build
```

Rust/Anchor: set `NO_DNA=1`.

```text
src/index.ts                    public API
src/wallet/signer.ts            Kit modifying signer
src/wallet/wrap-transaction.ts  preview + execute wrap
src/wallet/feePayer.ts          fee payer
src/wallet-standard/            Wallet Standard
src/generated/                  Codama client
```
