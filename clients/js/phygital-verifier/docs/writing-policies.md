# Writing policies

If you do not have a Codama Kit client yet, start with
[From IDL to policy](./custom-programs.md).

```ts
import { allow, deny, allowProgram, aggregate, policy } from "phygital-verifier-sdk";

const gate = policy([
  deny(token.instruction(TokenInstruction.SetAuthority)),
  allow(token.instruction(TokenInstruction.TransferChecked), (ix) =>
    ix.accounts.mint.address === USDC && ix.data.amount <= MAX
  ),
  allowProgram(COMPANION_PROGRAM),
  aggregate(
    [
      {
        matcher: token.instruction(TokenInstruction.TransferChecked),
        amount: (ix) => ix.data.amount,
        when: (ix) => ix.accounts.mint.address === USDC,
      },
    ],
    { lte: MAX },
  ),
]);
```

## Verify order

1. **deny** — matching matcher + predicate → `instruction_denied`
2. **allowProgram** — program id alone → allowed
3. **allow** — matcher + optional predicate → allowed
4. Else → `program_not_allowed` or `instruction_not_allowed`
5. **aggregate** — sum amounts; breach → `aggregate_limit`

Predicates receive Codama’s typed `{ accounts, data, instructionType }`.
