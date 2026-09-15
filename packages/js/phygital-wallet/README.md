# Phygital Wallet SDK

Kit TypeScript client for `phygital-wallet` (ESM, Node ≥18). Build inner CPIs with
`@solana/kit` / `@solana-program/*`, then sign with `getPhygitalWalletSigner`.

Browser Wallet Standard name: **Revibase**.

```bash
pnpm add phygital-wallet-sdk @solana/kit
```

Peer: `@solana/kit` `^8.1.0`. Runtime: `phygital-token-sdk`.

## Sign with a known token PDA

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
  fetch, // optional; default fee-payer HTTP
  onPhaseChange,
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
await sendTransactionWithoutConfirmingFactory({ rpc })(signed);
```

One transaction per `modifyAndSignTransactions`. Recent blockhash only — durable
nonce is rejected before preview / passkey.

Default fee payer: `https://api.revibase.com/getFeePayer` + `/sign`. Override with
`feePayer: TransactionPartialSigner`.

Phases: `preparing → previewing → awaitingPasskey → building → feePaying → complete`.
Preview simulates `execute_with_authority_using_policies` (same policy as `execute`,
no secp256r1). Failed preview aborts before the passkey prompt.

## Wallet Standard

```typescript
import { registerPhygitalWallet } from "phygital-wallet-sdk";

registerPhygitalWallet({ rpc /* , feePayer, onPhaseChange, chains */ });
```

Connect: random challenge → `startAuthentication` → local `verifyResponse` → derive
token + wallet PDAs. Persist only those PDAs under `revibase:wallet-standard:v3`.
`solana:signMessage` throws (PDA cannot ed25519-sign messages).

## Authority / policy builders

Generated: `getSetAuthorityInstruction`, `getClearAuthorityInstruction`,
`getSetWalletPolicyInstruction`, `getClearWalletPolicyInstruction`,
`getExecuteInstruction`, `getExecuteWithAuthorityInstruction`,
`getExecuteWithAuthorityUsingPoliciesInstruction`.

`execute_with_authority` bypasses policy. `execute_with_authority_using_policies`
applies the same checks as `execute` without a passkey (SDK preview path).

## Exports

| Export | Role |
| --- | --- |
| `getPhygitalWalletSigner` | Kit modifying signer for a token PDA |
| `registerPhygitalWallet` | Wallet Standard registration |
| `buildSetAuthorityChallenge` | Passkey challenge for `set_authority` |
| Generated client | Accounts, PDAs, instructions, codecs, policy types |

Agent notes: [`AGENTS.md`](./AGENTS.md). Program semantics:
[`programs/phygital-wallet/docs/policy-reference.md`](../../../programs/phygital-wallet/docs/policy-reference.md).
