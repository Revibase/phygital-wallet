# Phygital Wallet SDK

Kit-native TypeScript client for the `phygital-wallet` Solana program. Build inner CPIs with ordinary `@solana/kit` `Instruction[]` and `@solana-program/*` helpers — `getPhygitalWalletSigner` wraps them at sign time (passkey tap + `secp256r1 verify` + `execute` + verifier co-sign).

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

const source = await getPhygitalWalletSigner(rpc, phygitalTokenPda, {
  onPhaseChange: (phase) => {
    // preparing → previewing → awaitingPasskey → building → coSigning → complete
  },
  onPasskeyPrompt: () => {
    // Show “Hold your accessory” before WebAuthn.
  },
  onError: (error) => {
    // Update UI; error is still rethrown.
  },
});

const instructions = [
  getTransferSolInstruction({
    source,
    destination: recipient,
    amount: 1_000_000n,
  }),
];
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
const message = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(feePayer, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  (m) => appendTransactionMessageInstructions(instructions, m),
);

try {
  const signed = await signTransactionMessageWithSigners(message);
} catch (e) {
  if (e instanceof PolicyDeniedError && e.soft) {
    // Soft deny may create an open approval for the *owner* phone when one is
    // linked. Owner tabs with a valid device session + link skip the inbox row.
    // Unlinked tokens never upsert. Visitors / external dapps: message only or
    // wait for the owner to Approve once / Change limits, then retry.
  }
  throw e;
}
```

After resolving the verifier, the SDK uses the API **base** (`token_verifier.endpoint` normalized, or `https://api.revibase.com`):

- Preview: `POST {base}/preview` (always, before NFC)
- Co-sign: `POST {base}/sign`

Soft denials throw `PolicyDeniedError` with `code`, `soft`, and `intentHash`.
Pass a custom `fetch` (on `getPhygitalWalletSigner` / `resolveVerifier` /
`previewWalletIntent`) when the host app must send cookies — e.g. Revibase
uses `credentials: "include"` so an **owner** tab (device session + link) can
skip creating an open-approval inbox row. The SDK itself does not set
`credentials`. Config co-sign (token verifier / recovery wallet) is app-owned.
When `resolveVerifier(...).requiresOwnerCosignAssertion` is true (Config
default verifier), mint a `cosignConfig` WebAuthn challenge for the message
hash and pass it via `createVerifierEndpointSigner({ enrichSignBody })` (or
POST `/sign` with `challengeId` + `assertion`). Custom token verifiers skip
that step.

## Token verifier / recovery wallet

Passkey challenges for `set_token_verifier`, `clear_token_verifier`,
`set_recovery_wallet`, and `clear_recovery_wallet` are
`buildSetTokenVerifierChallenge`, `buildClearTokenVerifierChallenge`,
`buildSetRecoveryWalletChallenge`, and `buildClearRecoveryWalletChallenge`.

Instruction assembly lives in the app (generated `getSetTokenVerifierInstruction`
/ `getClearTokenVerifierInstruction` / recovery equivalents + verifier fee payer).
Rent on clear is refunded to the original PDA payer.

## Regenerate

```bash
pnpm build:program
```
