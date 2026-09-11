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

## Quickstart: connect and transact

```typescript
import {
  pipe,
  createTransactionMessage,
  appendTransactionMessageInstructions,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  sendTransactionWithoutConfirmingFactory,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { connectPhygitalWallet } from "phygital-wallet-sdk";

// Connect once: this performs the tap, resolves the token verifier, obtains the
// bearer, and wires that bearer into preview and sign requests.
const { signer: source } = await connectPhygitalWallet(rpc);
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
      m
    )
);

const signed = await signTransactionMessageWithSigners(message);
const send = sendTransactionWithoutConfirmingFactory({ rpc });
await send(signed);
```

`connectPhygitalWallet` performs the NFC/passkey connection and keeps the
verifier bearer available for `/preview` and `/sign`. Signing then runs policy
checks and a body simulation before the passkey prompt, wraps (`secp256r1` +
`execute`), co-signs, and submits the transaction.

Soft policy denial throws `PolicyDeniedError` with a stable `intentHash`. After
the owner approves on their device, retry the same instructions.

## Wallet Standard (`@solana/connectors` / adapters)

Browser-only (WebAuthn + `localStorage`). Register once at app startup:

```typescript
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({ rpc /* , chains?, fetch?, onPhaseChange? */ });
```

Options: `rpc` (required), optional `chains` (defaults to mainnet only — the program is not deployed elsewhere), `fetch`, `onPhaseChange`.

The wallet appears as **Revibase**. It uses `connectPhygitalWallet` to obtain
the verifier bearer, persists the bearer-backed session under
`revibase:wallet-standard:v2`, and renews it through the same connect flow when
it expires.

Features: `standard:connect` / `disconnect` / `events`, `solana:signTransaction`, `solana:signAndSendTransaction`, and `solana:signMessage` (declared for connector compatibility — PDA accounts cannot produce ed25519 message signatures). Signing uses the same wrap/`execute` path as `getPhygitalWalletSigner` (legacy, v0, and v1; blockhash or durable nonce).

Kit-only apps can skip `registerPhygitalWallet` and use `connectPhygitalWallet` alone.

## Optional: ceremony progress

```typescript
const source = await connectPhygitalWallet(rpc, {
  onPhaseChange: (phase) => {
    /* hold / progress UI */
  },
});
```

## Public API (summary)

| Export                                 | Role                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| `connectPhygitalWallet`                | Tap an accessory and return a bearer-backed transaction signer. |
| `getPhygitalWalletSigner`              | Build a signer when the token and bearer are already known.     |
| `registerPhygitalWallet`               | Register the bearer-backed wallet with Wallet Standard.         |
| `PolicyDeniedError`                    | Policy denial from `/preview` or `/sign`.                       |
| `resolveVerifier` / `ResolvedVerifier` | Resolve a token verifier or default verifier.                   |
| `DEFAULT_VERIFIER_API_BASE`            | Default verifier origin.                                        |
| `PHYGITAL_WALLET_CHAINS`               | Wallet Standard default chains.                                 |
| Generated client                       | PDAs, instructions, accounts, and types.                        |

## Default verifier

- **With** an on-chain TokenVerifier PDA: co-sign against that account’s `endpoint` (https, max `MAX_ENDPOINT_LEN`).
- **Without:** pick an active Config default verifier and call `DEFAULT_VERIFIER_API_BASE` (`/preview`, `/sign`). Pass a custom `fetch` on the signer if you need to rewrite requests.

## For AI agents

[`AGENTS.md`](./AGENTS.md)
