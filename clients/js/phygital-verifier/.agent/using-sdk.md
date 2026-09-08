# Using the SDK (agents)

## Imports

```ts
import {
  STANDARD_PARSERS,
  createVerifier,
  definePolicy,
  defineProgram,
  defineStandardPolicy,
  standardPolicy,
  standardTransaction,
  fromGenerated,
  uiAmountToRaw,
  validatePolicy,
  tokenParser,
} from "phygital-verifier-sdk";
```

`createVerifier({ parsers })` returns `(policy, instructions) => result`. Policies are compiled internally (cached); pass a `PolicyDocument` each call.

Generated custom parsers import `phygital-verifier-sdk/codec-readers` (`@solana/codecs`).

## Instruction input

Import Kit’s `Instruction` from `@solana/instructions` or `@solana/kit` (this SDK does not re-export it). Shape: `programAddress: Address`, optional `accounts` with `role`, optional `data`.

```ts
import type { Instruction } from "@solana/kit";
// { programAddress: Address; accounts?: (AccountMeta | AccountLookupMeta)[]; data?: ReadonlyUint8Array }
```

Strip Compute Budget before verify.

## STANDARD

```ts
const policy = defineStandardPolicy({
  wallet,
  // collectibles on by default; pass includeCollectibles: false for payments-only
  maxMintRaw: uiAmountToRaw(50, 6).toString(),
  maxSolLamports: "100000000",
});
```

When spreading `standardPolicy()`, also pass `standardTransaction()` into `definePolicy`.

## Custom rules on shipped parsers

Parsers are **full IDL** surfaces. The standard policy only allows a subset — you may allow more via `defineProgram(tokenParser, { allows: […] })` using names from `fieldSchema`.

## New program

1. Generate with `phygital-verifier-generate`
2. `fromGenerated` + register parsers
3. Exact IDL instruction names in policy

## `when` / aggregates

- Leaf `{ field, type, op, value }` or `{ and|or|not }`
- Bool: `"true"` / `"false"` only
- Multi-ix spend → `transaction.aggregates`

## Build

```bash
pnpm --filter phygital-verifier-sdk build
```
