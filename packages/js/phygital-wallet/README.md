# Phygital Wallet SDK

Kit-native TypeScript client for the `phygital-wallet` Solana program (ESM, Node ≥18 / modern bundlers). Build inner CPIs with ordinary `@solana/kit` or `@solana-program/*` instructions, then use `getPhygitalWalletSigner` like any other Kit transaction-modifying signer.

The browser Wallet Standard integration appears as **Revibase**.

## Install

```bash
pnpm add phygital-wallet-sdk @solana/kit
# or: npm install phygital-wallet-sdk @solana/kit
```

- Peer dependency: `@solana/kit` `^8.1.0`
- Runtime dependency: `phygital-token-sdk`
- Example dependency below: `@solana-program/system`

## Sign a transaction with a known token

`getPhygitalWalletSigner` accepts the phygital token PDA. It fetches the wallet authority for policy preview, fetches the default fee payer from the Revibase API, prompts for the passkey only after the policy preview succeeds, wraps the instructions with `execute`, and obtains the fee-payer signature.

```typescript
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { getPhygitalWalletSigner } from "phygital-wallet-sdk";

const source = await getPhygitalWalletSigner(rpc, phygitalTokenPda, {
  fetch, // optional; used by the default fee-payer HTTP signer
  onPhaseChange, // optional UI callback
});

const { value: latestBlockhash } = await rpc
  .getLatestBlockhash({ commitment: "confirmed" })
  .send();

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

The signer supports exactly one transaction per `modifyAndSignTransactions` call. Transactions must use a recent blockhash lifetime; durable nonce transactions are rejected before preview RPCs or passkey authentication.

### Fee payer

By default, the signer fetches the fee-payer address from `https://api.revibase.com/getFeePayer` and sends the completed transaction to `https://api.revibase.com/sign` for its signature. The fee payer is independent of the wallet authority.

You can provide your own `TransactionPartialSigner`:

```typescript
const source = await getPhygitalWalletSigner(rpc, phygitalTokenPda, {
  feePayer: authoritySigner,
});
```

### Signing phases

`onPhaseChange` receives:

```text
preparing → previewing → awaitingPasskey → building → feePaying → complete
```

The preview simulates `execute_with_authority_using_policies`, so it uses the same policy checks as `execute` without requiring a secp256r1 signature. A failed preview aborts before the passkey prompt. The final `execute` instruction checks the policies again and applies successful spending-counter updates on-chain.

HTTP policy or signing failures with a structured error code are represented by `PolicyDeniedError` internally by the default fee payer.

## Wallet Standard

Register the browser wallet once at application startup:

```typescript
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({
  rpc,
  // chains,       // optional; defaults to solana:mainnet
  // fetch,        // optional override for the default fee payer
  // feePayer,     // optional TransactionPartialSigner
  // onPhaseChange,
});
```

On interactive `standard:connect`, Revibase:

1. Generates a fresh random challenge.
2. Calls `startAuthentication` from `phygital-token-sdk`.
3. Verifies the response locally with `verifyResponse` using the same challenge.
4. Derives the phygital token PDA from the verified secp256r1 public key.
5. Derives and exposes the wallet PDA as the Wallet Standard account.

No verifier connect endpoint, proof exchange, bearer token, or expiring access token is involved. Only the phygital token PDA and wallet PDA are persisted in `localStorage` under `revibase:wallet-standard:v3`, allowing silent restoration after refresh. `standard:disconnect` clears that state.

Supported features:

- `standard:connect`, `standard:disconnect`, and `standard:events`
- `solana:signTransaction`
- `solana:signAndSendTransaction`
- `solana:signMessage` is declared for connector compatibility but throws because a PDA cannot produce an ed25519 message signature
- legacy, v0, and v1 transactions with recent blockhash lifetimes

Kit-only applications that already know the phygital token PDA can skip Wallet Standard and use `getPhygitalWalletSigner` directly.

## Authority and policy instructions

The generated client exports the current authority and policy instruction builders, including:

- `getSetAuthorityInstruction` and `getClearAuthorityInstruction`
- `getSetWalletPolicyInstruction` and `getClearWalletPolicyInstruction`
- `getExecuteWithAuthorityInstruction`
- `getExecuteWithAuthorityUsingPoliciesInstruction`
- `getExecuteInstruction`

`execute_with_authority` bypasses wallet policies. `execute_with_authority_using_policies` requires the authority signer and applies the same policy evaluation as `execute`, but does not require a passkey signature. For simulation, the SDK supplies the on-chain authority as a no-op signer identity because RPC simulation skips signature verification; the fee payer remains a separate account.

## Public API summary

| Export                       | Role                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| `getPhygitalWalletSigner`    | Build a Kit signer for a known phygital token PDA.                      |
| `registerPhygitalWallet`     | Register Revibase with Wallet Standard.                                 |
| `buildSetAuthorityChallenge` | Build the passkey challenge used when setting authority.                |
| Generated client exports     | Program accounts, PDAs, instruction builders, codecs, and policy types. |

## For AI agents

See [`AGENTS.md`](./AGENTS.md).
