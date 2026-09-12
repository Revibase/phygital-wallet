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

Connecting is three primitives that mirror `startAuthentication` →
`verifyResponse` from `phygital-token-sdk` (the login flow): tap to produce a
proof, exchange it for a session bearer, then build a signer.

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
import {
  startPhygitalConnect,
  exchangeConnectProof,
  getPhygitalWalletSigner,
} from "phygital-wallet-sdk";

// 1. Tap and produce a proof (counterpart to startAuthentication).
const proof = await startPhygitalConnect(rpc);

// 2. Exchange it for a session bearer. POST to the token's verifier directly…
const session = await exchangeConnectProof({
  endpoint: proof.resolved.endpoint,
  blockhash: proof.blockhash,
  response: proof.response,
});
//    …or send { blockhash, response } to your own backend, verify it there with
//    verifyConnectProof (phygital-verifier-sdk) — the counterpart to
//    verifyResponse — and return the bearer.

// 3. Build a signer from the token + bearer. getAccessToken hands over the
//    current bearer; re-fetched whenever it lapses (see "Keeping a session").
const source = await getPhygitalWalletSigner(rpc, proof.phygitalToken, {
  resolved: proof.resolved,
  getAccessToken: () => session.accessToken,
});

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
const send = sendTransactionWithoutConfirmingFactory({ rpc });
await send(signed);
```

The accessory is _discovered_, not chosen: `proof.phygitalToken` is whatever was
tapped — compare it if your flow expects a specific item. Signing runs policy
checks and a body simulation before the passkey prompt, wraps (`secp256r1` +
`execute`), co-signs, and submits.

Soft policy denial throws `PolicyDeniedError` with a stable `intentHash`. After
the owner approves on their device, retry the same instructions.

## When the session expires

`exchangeConnectProof` bearers are short-lived (~15 min). `getAccessToken` is
called on every `/preview`+`/sign`, so it will **throw once
it lapses**.

```typescript
import { SESSION_SKEW_MS } from "phygital-wallet-sdk";

// reuse the `session` from exchangeConnectProof above
const getAccessToken = () => {
  if (session.expiresAt - SESSION_SKEW_MS > Date.now())
    return session.accessToken;
  throw new Error("Session expired — reconnect");
};
```

## Wallet Standard (`@solana/connectors` / adapters)

Browser-only (WebAuthn + `localStorage`). Register once at app startup:

```typescript
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({ rpc /* , chains?, fetch?, onPhaseChange? */ });
```

Options: `rpc` (required), optional `chains` (defaults to mainnet only — the program is not deployed elsewhere), `fetch`, `onPhaseChange`.

The wallet appears as **Revibase**. On connect it taps with
`startPhygitalConnect`, mints a bearer with `exchangeConnectProof`, and persists
the bearer-backed session under `revibase:wallet-standard:v2`. When the session
expires, signing throws — the consumer reconnects (`standard:connect`) to tap
again; it never re-taps on its own.

Features: `standard:connect` / `disconnect` / `events`, `solana:signTransaction`, `solana:signAndSendTransaction`, and `solana:signMessage` (declared for connector compatibility — PDA accounts cannot produce ed25519 message signatures). Signing uses the same wrap/`execute` path as `getPhygitalWalletSigner` (legacy, v0, and v1; blockhash or durable nonce).

Kit-only apps can skip `registerPhygitalWallet` and compose the three primitives above.

## Public API (summary)

| Export                                 | Role                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `startPhygitalConnect`                 | Tap and produce a connect proof (counterpart to `startAuthentication`). |
| `exchangeConnectProof`                 | POST a proof to a verifier `/connect` and return its session bearer.    |
| `getPhygitalWalletSigner`              | Build a bearer-backed Kit signer for a token.                           |
| `registerPhygitalWallet`               | Register the bearer-backed wallet with Wallet Standard.                 |
| `PolicyDeniedError`                    | Policy denial from `/preview` or `/sign`.                               |
| `resolveVerifier` / `ResolvedVerifier` | Resolve a token verifier or default verifier.                           |
| `DEFAULT_VERIFIER_API_BASE`            | Default verifier origin.                                                |
| `PHYGITAL_WALLET_CHAINS`               | Wallet Standard default chains.                                         |
| Generated client                       | PDAs, instructions, accounts, and types.                                |

## Default verifier

- **With** an on-chain TokenVerifier PDA: co-sign against that account’s `endpoint` (https, max `MAX_ENDPOINT_LEN`).
- **Without:** pick an active Config default verifier and call `DEFAULT_VERIFIER_API_BASE` (`/preview`, `/sign`). Pass a custom `fetch` on the signer if you need to rewrite requests.

## For AI agents

[`AGENTS.md`](./AGENTS.md)
