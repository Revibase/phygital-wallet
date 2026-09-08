# Getting started

## Three concepts

1. **Parser** — turns one instruction’s `data` + `accounts` into `{ instructionName, fields }`.
2. **Policy** — JSON document: which `programId`s / instructions / field conditions are allowed, plus optional per-tx aggregates.
3. **Verifier** — `createVerifier({ parsers })` returns `(policy, instructions) => result`.

Policies never contain decoder code. If the policy needs a field (or denies/aggregates need decode) and no parser is registered → `parser_not_found`.

## Minimal example

```ts
import {
  STANDARD_PARSERS,
  createVerifier,
  defineStandardPolicy,
} from "phygital-verifier-sdk";
import { AccountRole, type Address } from "@solana/kit";

const verify = createVerifier({ parsers: [...STANDARD_PARSERS] });
const policy = defineStandardPolicy();

const result = verify(policy, [
  {
    programAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address,
    accounts: [
      { address: sourceAta, role: AccountRole.WRITABLE },
      { address: usdcMint, role: AccountRole.READONLY },
      { address: destAta, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY_SIGNER },
    ],
    data: transferCheckedData,
  },
]);
```

Instruction input is Kit’s `Instruction` from `@solana/instructions` / `@solana/kit` (not re-exported by this SDK).

## Where things live in source

| Folder | Responsibility |
|--------|----------------|
| `src/core/` | Types, `createVerifier`, `definePolicy` / `defineProgram` |
| `src/policy/` | `defineStandardPolicy` and related helpers |
| `src/parsers/` | `STANDARD_PARSERS`, named parsers, IDL-generated decoders |

## Built-in parsers

`STANDARD_PARSERS` includes full IDL coverage for Token, Token-2022, System, ATA, Token Metadata, Bubblegum, and MPL Core.

The standard policy only **allows** a small subset. For custom rules, use the same parsers:

```ts
import { tokenParser, defineProgram } from "phygital-verifier-sdk";

defineProgram(tokenParser, {
  allows: [{ instruction: "freezeAccount" }], // name from tokenParser.fieldSchema
});
```

**Compute Budget** is never in `STANDARD_PARSERS` — strip those ixs before verify (`compute_budget_not_allowed`).

## Next

- Caps & NFT opts → [Standard policies](./standard-policies.md)
- `when` / aggregates → [Writing policies](./writing-policies.md)
- Extra programs → [Custom parsers](./custom-parsers.md)
