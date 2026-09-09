# AGENTS — phygital-wallet-sdk

Kit client for the **phygital-wallet** Solana program. Prefer public exports from the package root (`phygital-wallet-sdk`). Do not deep-import `dist/wallet/*`.

## When to use what

| Goal | Use |
|------|-----|
| Sign a spend / CPI as the wallet PDA | `getPhygitalWalletSigner(rpc, phygitalTokenPda, opts?)` |
| Discoverable browser wallet (`@solana/connectors`, adapters) | `registerPhygitalWallet({ rpc, … })` once at startup |
| Resolve co-signer endpoint / paymaster flags | `resolveVerifier(rpc, phygitalTokenPda)` |
| Build set/clear TokenVerifier or RecoveryWallet ixs | `buildSet*Challenge` / `buildClear*Challenge` |
| PDAs, decode accounts, raw program ixs | Codama exports (`findWalletPda`, `fetchMaybeTokenVerifier`, `getExecuteInstruction`, …) |

Companion packages:

- **`phygital-token-sdk`** — passkey auth (`startAuthentication`, `verifyResponse`, `findPhygitalTokenPda`, `authenticatePasskeyForSecp256r1Verify`)
- **`phygital-verifier-sdk`** — policy engine (this wallet SDK calls verifier HTTP `/preview` + `/sign`; it does not embed policy rules)

## Mental model

1. User’s accessory → **phygital token PDA** (passkey / secp256r1).
2. **Wallet PDA** = PDA of phygital-wallet program seeded by that token.
3. Transactions that spend from the wallet are Kit messages with the wallet PDA as fee payer / signer; this SDK **wraps** body ixs into `execute` (+ secp256r1 verify), refreshes lifetime, then **co-signs** via the verifier API.
4. Default co-signer origin when no TokenVerifier override: `DEFAULT_VERIFIER_API_BASE` (`https://api.revibase.com`). Override endpoint comes from on-chain TokenVerifier.

## Kit signer (primary path)

```ts
import {
  getPhygitalWalletSigner,
  PolicyDeniedError,
} from "phygital-wallet-sdk";

const source = await getPhygitalWalletSigner(rpc, phygitalTokenPda, {
  fetch,           // optional
  onPhaseChange,   // preparing | previewing | awaitingPasskey | building | coSigning | complete
});

// Build a normal Kit message with `source` as fee payer / transfer authority, then:
await signTransactionMessageWithSigners(message);
```

Constraints agents must respect:

- **Exactly one** transaction per `modifyAndSignTransactions` call.
- Transaction must have a **lifetime** (blockhash or durable nonce).
- Soft policy deny → throws `PolicyDeniedError` with `soft === true` and often `intentHash`. Retry the **same** instructions after the owner approves; do not invent a new intent.
- Durable nonce: `AdvanceNonceAccount` stays **outer** ix 0 (not inside `execute`). Nonce authority must **not** be the wallet PDA.
- Supported versions: legacy, v0, v1 (v1 uses message config for CU/fees, not ComputeBudget ixs).

## Wallet Standard

```ts
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({ rpc }); // idempotent per rpc instance
```

- UI name: **Revibase**. Browser-only (WebAuthn + `localStorage` session key `revibase:wallet-standard:v1`).
- Connect: tap → token PDA → wallet PDA. Session restore avoids a second tap after refresh.
- Implements `solana:signTransaction` / `signAndSendTransaction`. `solana:signMessage` is declared for connectors but **throws** (PDA cannot ed25519-sign messages).

## Verifier / paymaster helpers

- `resolveVerifier` → `{ verifier, endpoint, usesDefaultPaymaster, requiresOwnerCosignAssertion, … }`
- `isConfigDefaultVerifier(config, verifier)` / `activeConfigVerifierAddresses(config)` — same membership rules as resolve
- Endpoints must be `https://` and ≤ `MAX_ENDPOINT_LEN`

## Do

- Use generated Codama helpers for program bytes (`parsePhygitalWalletInstruction`, `get*Instruction`, `fetch*` / `decode*`)
- Pass Kit `Instruction`s / messages; do not hand-roll execute compact layouts
- Surface `PolicyDeniedError` to the user (soft vs hard)

## Do not

- Deep-import wrap/compile/session modules (not public API)
- Treat `solana:signMessage` as working SIWS for the wallet PDA
- Put wallet PDA as durable-nonce authority
- Hand-roll discriminators that duplicate Codama output

## Orientation

```
src/index.ts           → public API
src/wallet/            → signer, resolve-verifier, wrap (internal)
src/wallet-standard/   → registerPhygitalWallet
src/generated/         → Codama client (re-exported)
README.md              → human quickstart
```
