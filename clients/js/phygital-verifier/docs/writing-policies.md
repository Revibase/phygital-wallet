# Writing policies

If you do not have a Codama Kit client yet, start with
[From IDL to policy](./custom-programs.md).

```ts
import { allow, deny, allowProgram, aggregate, policy } from "phygital-verifier-sdk";

const gate = policy([
  deny(token.instruction(TokenInstruction.SetAuthority)),
  allow(token.instruction(TokenInstruction.TransferChecked), {
    when: (ix) =>
      ix.accounts.mint.address === USDC && ix.data.amount <= MAX,
    onFail: (ix) => ({
      code: "spend_limit",
      message: "Over USDC cap",
      details: {
        mint: String(ix.accounts.mint.address),
        limit: String(MAX),
        destination: String(ix.accounts.destination.address),
      },
    }),
  }),
  allowProgram(COMPANION_PROGRAM),
  aggregate(
    [
      {
        matcher: token.instruction(TokenInstruction.TransferChecked),
        amount: (ix) => ix.data.amount,
        when: (ix) => ix.accounts.mint.address === USDC,
      },
    ],
    {
      lte: MAX,
      onFail: ({ limit, actual }) => ({
        code: "spend_limit",
        message: "Over USDC aggregate",
        details: { limit: limit.toString(), actual: actual.toString() },
      }),
    },
  ),
]);
```

## Verify order

1. **deny** — matching matcher + predicate → `instruction_denied`
2. **allowProgram** — program id alone → allowed
3. **allow** — matcher + optional `when`:
   - `when` true (or omitted) → allowed
   - `when` false + `onFail` returns a fail → that code/details
   - `when` false + no `onFail` / `onFail` returns null → try later allows
4. Else → `program_not_allowed` or `instruction_not_allowed`
5. **aggregate** — sum amounts; breach → `onFail` or `aggregate_limit`

Predicates receive Codama’s typed `{ accounts, data, instructionType }`.
`onFail` also receives `{ instructions, instructionIndex }` so you can derive
cross-instruction fields (e.g. ATA wallet owner) when building the policy.
There is no post-verify enrichment — put owner UX in `onFail.details`.
