# phygital-verifier-sdk

Verify Solana instructions against a **JSON policy**.

**Parsers** decode bytes → fields. **Policies** authorize. **`createVerifier`** checks a transaction. Decoders are never embedded in the policy JSON.

## Install

```bash
pnpm add phygital-verifier-sdk
```

## Quick start

```ts
import {
  STANDARD_PARSERS,
  createVerifier,
  defineStandardPolicy,
} from "phygital-verifier-sdk";

const verify = createVerifier({ parsers: [...STANDARD_PARSERS] });
const policy = defineStandardPolicy({
  // wallet: userWalletAddress, // enables closeAccount → rent to owner
});

const result = verify(policy, instructions);
if (!result.ok) {
  console.error(result.code, result.message);
}
```

Bare `defineStandardPolicy()` is a program allowlist **without** spend caps (collectibles on). Pass `DEFAULT_MAX_MINT_RAW` / `DEFAULT_MAX_SOL_LAMPORTS` (or your own raws) for suggested 50 USDC / 0.1 SOL caps. Details: [Standard policies](./docs/standard-policies.md).

## How the pieces fit

```
instructions ──► parsers (decode) ──► fields
                      ▲
policy JSON ──────────┴──► createVerifier ──► ok | { code, message }
```

| You want to… | Use |
|--------------|-----|
| Ship a payments wallet quickly | `defineStandardPolicy` + `STANDARD_PARSERS` |
| Allow extra instructions on Token/System/… | `defineProgram(tokenParser, { allows })` + `fieldSchema` |
| Add Jupiter / another program | [Custom parsers](./docs/custom-parsers.md) (`phygital-verifier-generate`) |
| Understand deny codes | [Verify results](./docs/verify-and-errors.md) |

## Documentation

| Guide | Topic |
|-------|--------|
| [Getting started](./docs/getting-started.md) | Mental model |
| [Standard policies](./docs/standard-policies.md) | Preset options & caps |
| [Writing policies](./docs/writing-policies.md) | `allows` / `when` / aggregates |
| [Custom parsers](./docs/custom-parsers.md) | Built-in full schemas + IDL generate |
| [Verify results & errors](./docs/verify-and-errors.md) | Fail codes |

## Source layout

```
src/
  index.ts                 Public exports (start here)
  core/                    Types, verify engine, definePolicy / defineProgram
  policy/                  STANDARD policy preset
  parsers/                 STANDARD_PARSERS + generated IDL decoders
    generated/             Auto-generated — do not edit by hand
scripts/                   phygital-verifier-generate (custom IDLs)
docs/                      Guides linked above
```

## For AI agents

[`AGENTS.md`](./AGENTS.md) and [`.agent/`](./.agent/README.md).
