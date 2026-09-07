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
Preview uses `credentials: "include"` so an **owner** Revibase tab (device
session + link) can skip creating an open-approval inbox row. Visitors and
external dapps still upsert when an owner exists; **unlinked** tokens never
upsert.

## Token verifier override

```typescript
import {
  buildSetTokenVerifierChallenge,
  getSetTokenVerifierInstructions,
} from "phygital-wallet-sdk";
import {
  authenticatePasskeyForSecp256r1Verify,
  buildSecp256r1VerifyInstruction,
} from "phygital-token-sdk";

const { slotNumber, messageHash } = await buildSetTokenVerifierChallenge(
  rpc,
  phygitalTokenPda,
  overrideVerifier,
  "https://verifier.example.com", // API base; /sign and /preview are appended
);
const tap = await authenticatePasskeyForSecp256r1Verify({ rpc, messageHash });
const verify = await buildSecp256r1VerifyInstruction(tap);

const instructions = await getSetTokenVerifierInstructions({
  rpc,
  payer: feePayer,
  overrideVerifier,
  endpoint: "https://verifier.example.com",
  passkeyAuth: {
    secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
    phygitalTokenPda: verify.phygitalTokenPda,
    secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
    slotNumber,
  },
});
```

Clear uses `buildClearTokenVerifierChallenge(rpc, phygitalTokenPda)` and `getClearTokenVerifierInstructions({ rpc, passkeyAuth })`. Rent is refunded to the original token verifier payer automatically.

## Regenerate

```bash
pnpm build:program
```
