# phygital-verifier-sdk

Verify Solana instructions against **composable TypeScript policies** over **Codama** parses.

## Install

```bash
pnpm add phygital-verifier-sdk
```

## Quick start

```ts
import {
  fromCodamaProgram,
  allow,
  aggregate,
  policy,
} from "phygital-verifier-sdk";
import {
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
  identifyTokenInstruction,
  parseTokenInstruction,
} from "./generated/token"; // your Codama client

const token = fromCodamaProgram({
  programAddress: TOKEN_PROGRAM_ADDRESS,
  identify: identifyTokenInstruction,
  parse: parseTokenInstruction,
});

const gate = policy([
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
| `aggregate(sources, { lte \| … })` | Sum amounts across the tx |
| `policy(rules).verify(instructions)` | Fail-closed gate |

This package ships **no** STANDARD program parsers or payments presets. Generate Codama clients from IDLs (`codama run js`) and compose rules in your app — or use `phygital-policy` for Revibase’s payments preset.

**New program?** Follow [From IDL to policy (Codama)](./docs/custom-programs.md) — install Codama, `codama init` / `codama run js`, then wire `identify*` / `parse*` into `fromCodamaProgram`.

## Docs

- [Getting started](./docs/getting-started.md)
- [From IDL to policy (Codama)](./docs/custom-programs.md) — install Codama, generate Kit clients, wire the SDK
- [Writing policies](./docs/writing-policies.md)
- [Verify results](./docs/verify-and-errors.md)

## For AI agents

[`AGENTS.md`](./AGENTS.md)
