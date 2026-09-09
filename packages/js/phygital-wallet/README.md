# Phygital Wallet SDK

Kit-native TypeScript client for the `phygital-wallet` Solana program (ESM, Node ≥18 / bundlers). Build inner CPIs with ordinary `@solana/kit` / `@solana-program/*` instructions, then sign with `getPhygitalWalletSigner` like any other Kit signer.

The Wallet Standard registration surfaces as **Revibase** (browser connectors such as `@solana/connectors`). When no on-chain TokenVerifier override exists, co-signing defaults to `DEFAULT_VERIFIER_API_BASE` (`https://api.revibase.com`).

## Install

```bash
pnpm add phygital-wallet-sdk @solana/kit
# or: npm i phygital-wallet-sdk @solana/kit
```

- **Peer:** `@solana/kit` `^8.1.0`
- **Dependency:** `phygital-token-sdk` (pulled in automatically; import it when you need passkey helpers)
- **Example-only:** `@solana-program/system` (quickstart transfer below)

## Quickstart

```typescript
import {
  pipe,
  createTransactionMessage,
  appendTransactionMessageInstructions,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  getPhygitalWalletSigner,
  PolicyDeniedError,
} from "phygital-wallet-sdk";

const source = await getPhygitalWalletSigner(rpc, phygitalTokenPda);
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const message = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(source, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  (m) =>
    appendTransactionMessageInstructions(
      [
        getTransferSolInstruction({
          source,
          destination: recipient,
          amount: 1_000_000n,
        }),
      ],
      m,
    ),
);

const signed = await signTransactionMessageWithSigners(message);
```

Signing runs policy checks and a body simulation before the passkey prompt, then wraps (`secp256r1` + `execute`) and co-signs.

Soft deny throws `PolicyDeniedError` (soft) with a stable `intentHash`. After the owner approves on their device, retry the **same** instructions and sign again.

## Wallet Standard (`@solana/connectors` / adapters)

Browser-only (WebAuthn + `localStorage`). Register once at app startup:

```typescript
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({ rpc /* , chains?, fetch?, onPhaseChange? */ });
```

Options: `rpc` (required), optional `chains` (defaults to mainnet only — the program is not deployed elsewhere), `fetch`, `onPhaseChange`.

The wallet appears as **Revibase**. On connect, the user taps their accessory (`startAuthentication` → `verifyResponse` → token PDA → wallet PDA). Session PDAs are stored under `revibase:wallet-standard:v1` so refresh restores without another tap; disconnect clears it.

Features: `standard:connect` / `disconnect` / `events`, `solana:signTransaction`, `solana:signAndSendTransaction`, and `solana:signMessage` (declared for connector compatibility — PDA accounts cannot produce ed25519 message signatures). Signing uses the same wrap/`execute` path as `getPhygitalWalletSigner` (legacy, v0, and v1; blockhash or durable nonce).

Kit-only apps can skip `registerPhygitalWallet` and use `getPhygitalWalletSigner` alone.

## Optional: ceremony progress

```typescript
const source = await getPhygitalWalletSigner(rpc, phygitalTokenPda, {
  onPhaseChange: (phase) => {
    /* hold / progress UI */
  },
});
```

## Public API (summary)

| Export | Role |
|--------|------|
| `getPhygitalWalletSigner` | Kit modifying signer (preview → passkey → wrap → co-sign) |
| `PolicyDeniedError` | Soft/hard policy deny from preview or `/sign` |
| `registerPhygitalWallet` | Wallet Standard registration (Revibase) |
| `resolveVerifier` / `ResolvedVerifier` | Resolve TokenVerifier override or default paymaster |
| `DEFAULT_VERIFIER_API_BASE` | Default co-signer origin when no override is set |
| `PHYGITAL_WALLET_CHAINS` | Wallet Standard default (`solana:mainnet` only) |
| `assertHttpsEndpoint` / `normalizeVerifierApiBase` | Endpoint helpers |
| `activeConfigVerifierAddresses` / `isConfigDefaultVerifier` | Config default-verifier membership |
| `buildSet*Challenge` / `buildClear*Challenge` | Config instruction challenges |
| Codama generated client | `findWalletPda`, `getExecuteInstruction`, accounts, etc. |

## Default verifier

- **With** an on-chain TokenVerifier PDA: co-sign against that account’s `endpoint` (https, max `MAX_ENDPOINT_LEN`).
- **Without:** pick an active Config default verifier and call `DEFAULT_VERIFIER_API_BASE` (`/preview`, `/sign`). Pass a custom `fetch` on the signer if you need to rewrite requests.

## For AI agents

[`AGENTS.md`](./AGENTS.md)
