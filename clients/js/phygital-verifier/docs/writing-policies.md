# Writing policies

Policies are JSON-safe. Amounts are **raw on-chain units** as decimal strings. Instruction and field names must match the parser / IDL **exactly**.

## Building with helpers

```ts
import {
  definePolicy,
  defineProgram,
  standardPolicy,
  standardTransaction,
} from "phygital-verifier-sdk";

const policy = definePolicy(
  [
    ...standardPolicy({
      maxMintRaw: "50000000",
      maxSolLamports: "100000000",
    }),
    defineProgram(myParser, {
      allows: [
        {
          instruction: "route",
          when: {
            field: "inAmount",
            type: "bigint",
            op: "lte",
            value: "50000000",
          },
        },
      ],
    }),
  ],
  standardTransaction({
    maxMintRaw: "50000000",
    maxSolLamports: "100000000",
  }),
);
```

`defineProgram(parser, opts)` types `instruction` / field names from `parser.fieldSchema` when possible. You can also pass a raw `programId` string for `allowAll` blocks that need no parser.

## Program block shape

```ts
{
  programId: string;
  allowAll?: boolean;
  allows?: { instruction: string; when?: PolicyExpr }[];
  denies?: { instruction: string; when?: PolicyExpr }[];
}
```

### Verify order (per instruction)

1. Program must appear in `programs` (else `program_not_allowed`).
2. **`allowAll`** — if set and there are no denies, the ix is allowed **without** a parser (program id alone). Denies require a registered parser. Combining `allowAll` with aggregates for that program is `invalid_policy`.
3. **`denies`** — if a deny matches (instruction + optional `when`), fail.
4. **`allows`** — must match at least one allow for that instruction name; multiple allows for the same instruction are **OR**’d.

If denies or aggregates require decoding, unrecognized discriminators (`Unknown`) **fail closed**.

Duplicate `programId` blocks → `invalid_policy`.

## `when` expressions

```ts
type PolicyExpr =
  | PolicyCondition
  | { and: PolicyExpr[] }
  | { or: PolicyExpr[] }
  | { not: PolicyExpr };
```

There is **no** array form for conditions. Empty `and` / `or` → `invalid_policy`. Unknown shapes (e.g. typo `{ all: [] }`) → `invalid_policy`.

Compile lowers every `when` to byte/account predicates. Rules:

- `and` — flatten to one AND-group (children must not be `or`)
- `or` — OR of AND-groups (do not mix dynamic/`parsed` fields across branches)
- `not` — **leaf only** (inverts `eq`↔`neq`, `lt`↔`gte`, …); `not` of `and`/`or` → `invalid_policy`

```ts
// Prefer top-level or of and-groups:
when: {
  or: [
    {
      and: [
        { field: "mint", type: "string", op: "eq", value: USDC },
        { field: "amount", type: "bigint", op: "lte", value: "1000000" },
      ],
    },
    {
      and: [
        { field: "mint", type: "string", op: "eq", value: USDC },
        { field: "tag", type: "string", op: "eq", value: "vip" },
      ],
    },
  ],
}
```

Nested IDL fields use dotted names: `transferArgs.amount`.

### Field types and ops

| `type` | `value` encoding | Ops |
|--------|------------------|-----|
| `string` | base58 pubkey / UTF-8 text | `eq` `neq` `in` |
| `bytes` | base58 of raw bytes | `eq` `neq` `in` |
| `bigint` | decimal string | `eq` `neq` `lt` `lte` `gt` `gte` `in` |
| `number` | decimal / float string | same as bigint |
| `bool` | `"true"` / `"false"` only | `eq` `neq` `in` |
| `json` | `JSON.stringify(…)` text | `eq` `neq` `in` (must compile to a fixed layout or parsed predicate; otherwise `invalid_policy`) |

Missing optional accounts are **omitted** from parsed fields (not `""`), so conditions on them fail closed. `NOT` over a missing field also fails closed.

### allowAll + denies

```ts
defineProgram(jupiterParser, {
  allowAll: true,
  denies: [{ instruction: "setTokenLedger" }],
});
```

`allowAll` **cannot** be combined with aggregates that reference that program (`invalid_policy`) — aggregates need decoded fields and would otherwise be escapable.

## Transaction aggregates

After every instruction passes per-ix checks, optional `transaction.aggregates` sum bigint fields across the tx:

```ts
transaction: {
  aggregates: [
    {
      fields: [
        {
          programId: TOKEN,
          instruction: "transferChecked",
          field: "amount",
          when: { field: "mint", type: "string", op: "eq", value: USDC },
        },
        {
          programId: TOKEN_2022,
          instruction: "transferChecked",
          field: "amount",
          when: { field: "mint", type: "string", op: "eq", value: USDC },
        },
      ],
      op: "lte",
      value: "50000000",
    },
  ],
}
```

- Each `fields[]` entry can have its own `when` filter.
- Empty `fields`, duplicate sources, or combining `allowAll` with aggregates for that program → `invalid_policy`.
- Breach → `aggregate_limit`.

## Full JSON example

```json
{
  "version": "2.0",
  "programs": [
    {
      "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "allows": [
        {
          "instruction": "transferChecked",
          "when": {
            "and": [
              {
                "field": "mint",
                "type": "string",
                "op": "eq",
                "value": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
              },
              {
                "field": "amount",
                "type": "bigint",
                "op": "lte",
                "value": "50000000"
              }
            ]
          }
        }
      ]
    }
  ],
  "transaction": {
    "aggregates": [
      {
        "fields": [
          {
            "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "instruction": "transferChecked",
            "field": "amount",
            "when": {
              "field": "mint",
              "type": "string",
              "op": "eq",
              "value": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
            }
          }
        ],
        "op": "lte",
        "value": "50000000"
      }
    ]
  }
}
```

## Validation without verifying a tx

```ts
import { validatePolicy } from "phygital-verifier-sdk";

const check = validatePolicy(policy);
```

Same structural rules as verify (duplicates, empty and/or, allowAll+aggregates, …).
