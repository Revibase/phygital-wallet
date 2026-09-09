# Phygital Wallet SDK

Kit-native TypeScript client for the `phygital-wallet` Solana program. Build inner CPIs with ordinary `@solana/kit` / `@solana-program/*` instructions, then sign with `getPhygitalWalletSigner` like any other Kit signer.

## Install

```bash
pnpm add phygital-wallet-sdk @solana/kit @solana-program/system phygital-token-sdk
```

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

Soft deny throws `PolicyDeniedError` (soft) with a stable `intentHash`. The pending approval lands in the owner inbox — after they approve on their phone, retry the **same** instructions and sign again.

## Wallet Standard (`@solana/connectors` / adapters)

Register Revibase once at app startup so any Wallet Standard consumer can discover it:

```typescript
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({ rpc });
```

The wallet appears as **Revibase**. On connect, the user taps their accessory (`startAuthentication` → `verifyResponse` → token PDA → wallet PDA). The session (token + wallet PDAs) is stored in `localStorage` so refresh restores without another tap; disconnect clears it.

Features: `standard:connect` / `disconnect` / `events`, `solana:signTransaction`, `solana:signAndSendTransaction`, and `solana:signMessage` (declared for connector compatibility — PDA accounts cannot produce ed25519 message signatures). Signing uses the same wrap/`execute` path as `getPhygitalWalletSigner` (legacy, v0, and v1; blockhash or durable nonce).

## Optional: ceremony progress

```typescript
const source = await getPhygitalWalletSigner(rpc, phygitalTokenPda, {
  onPhaseChange: (phase) => {
    /* hold / progress UI */
  },
});
```

## Regenerate

```bash
pnpm build:program
```
