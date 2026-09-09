# phygital-verifier-sdk

Verify Solana instructions against **composable TypeScript policies** over **Codama** parses (ESM, Node ≥18 / bundlers).

This package does **not** ship program parsers or product presets. Generate Codama Kit clients from your IDLs, wrap them with `fromCodamaProgram`, and compose rules in your app.

## Install

```bash
pnpm add phygital-verifier-sdk
# or: npm i phygital-verifier-sdk
```

Depends on `@solana/instructions` (compatible with `@solana/kit` ^8). Your Codama-generated clients typically need `@solana/kit` as well.

## Quick start

```ts
import {
  fromCodamaProgram,
  allow,
  denyProgram,
  aggregate,
  policy,
} from "phygital-verifier-sdk";
import {
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
  identifyTokenInstruction,
  parseTokenInstruction,
} from "./generated/token"; // your Codama client — not shipped by this package

const token = fromCodamaProgram({
  programAddress: TOKEN_PROGRAM_ADDRESS,
  identify: identifyTokenInstruction,
  parse: parseTokenInstruction,
});

const gate = policy([
  denyProgram("ComputeBudget111111111111111111111111111111"),
  allow(token.instruction(TokenInstruction.TransferChecked), (ix) =>
    ix.data.amount <= 50_000_000n
  ),
  aggregate(
    [
      {
        matcher: token.instruction(TokenInstruction.TransferChecked),
        amount: (ix) => ix.data.amount,
      },
    ],
    { lte: 50_000_000n },
  ),
]);

const result = gate.verify(instructions);
if (!result.ok) {
  console.error(result.code, result.message);
}
```

## API

| Export | Role |
|--------|------|
| `fromCodamaProgram({ programAddress, identify, parse })` | Fail-closed adapter over Codama Kit helpers |
| `allow(matcher, predicate?)` | Permit a Codama instruction branch |
| `deny(matcher, predicate?)` | Reject a matching instruction |
| `allowProgram(address)` | Permit any ix for a program id (no parse) |
| `denyProgram(address)` | Reject any ix for a program id |
| `aggregate(sources, { lte \| … })` | Sum amounts across the tx |
| `policy(rules).verify(instructions)` | Fail-closed gate |

Also exported: types (`InstructionMatcher`, `Policy`, `VerifyResult`, …), plus `fail` / `ok` / `addressString` helpers.

Generate Codama clients from IDLs (`codama run js`) and compose rules in your app.

**New program?** Follow [From IDL to policy (Codama)](./docs/custom-programs.md).

**Kit-only instruction (no Codama branch)?** Build a custom `InstructionMatcher` — see [Writing policies](./docs/writing-policies.md#custom-instructionmatcher).

## Docs

- [Getting started](./docs/getting-started.md)
- [From IDL to policy (Codama)](./docs/custom-programs.md)
- [Writing policies](./docs/writing-policies.md)
- [Verify results](./docs/verify-and-errors.md)

## For AI agents

[`AGENTS.md`](./AGENTS.md)
