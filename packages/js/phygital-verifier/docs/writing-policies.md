# Writing policies

If you do not have a Codama Kit client yet, start with
[From IDL to policy](./custom-programs.md).

```ts
import {
  allow,
  deny,
  denyProgram,
  allowProgram,
  aggregate,
  policy,
} from "phygital-verifier-sdk";

const gate = policy([
  denyProgram(COMPUTE_BUDGET_PROGRAM),
  deny(token.instruction(TokenInstruction.SetAuthority)),
  allow(token.instruction(TokenInstruction.TransferChecked), {
    when: (ix) => ix.accounts.mint.address === USDC && ix.data.amount <= MAX,
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
    }
  ),
]);
```

## Verify order

1. **denyProgram** — program id → `instruction_denied`
2. **deny** — matching matcher + predicate → `instruction_denied`
3. **allowProgram** — program id alone → allowed
4. **allow** — matcher + optional `when`:
   - `when` true (or omitted) → allowed
   - `when` false + `onFail` returns a fail → that code/details
   - `when` false + no `onFail` / `onFail` returns null → try later allows
5. Else → `program_not_allowed` or `instruction_not_allowed`
6. **aggregate** — sum amounts; breach → `onFail` or `aggregate_limit`

Predicates receive Codama’s typed `{ accounts, data, instructionType }`.
`onFail` also receives `{ instructions, instructionIndex }` so you can derive
cross-instruction fields (e.g. ATA wallet owner) when building the policy.
There is no post-verify enrichment — put owner UX in `onFail.details`.

`details` commonly include soft-UX fields such as `destination`, `mint`,
`amount`, `decimals`, `limit`, and `actual` when your `onFail` sets them.

## Custom `InstructionMatcher`

Use this when Codama does not expose an instruction (e.g. System
`AdvanceNonceAccount`) but Kit (or your own predicate) can recognize it:

```ts
import { isAdvanceNonceAccountInstruction } from "@solana/kit";
import {
  allow,
  type InstructionMatcher,
  type ParsedProgramIx,
} from "phygital-verifier-sdk";

type AdvanceNonceParsed = ParsedProgramIx & {
  instructionType: "AdvanceNonceAccount";
};

function parseAdvanceNonce(ix: Parameters<InstructionMatcher["tryMatch"]>[0]) {
  if (!isAdvanceNonceAccountInstruction(ix)) return undefined;
  return {
    programAddress: "11111111111111111111111111111111",
    instructionType: "AdvanceNonceAccount" as const,
  };
}

const advanceNonceAccount: InstructionMatcher<AdvanceNonceParsed> = {
  kind: "instruction",
  programAddress: "11111111111111111111111111111111",
  instructionType: "AdvanceNonceAccount",
  adapter: {
    programAddress: "11111111111111111111111111111111",
    tryParse: parseAdvanceNonce,
  },
  tryMatch: parseAdvanceNonce,
};

policy([allow(advanceNonceAccount)]);
```

Prefer Codama `fromCodamaProgram(…).instruction(…)` whenever the IDL covers
the instruction — custom matchers are the escape hatch, not the default.
