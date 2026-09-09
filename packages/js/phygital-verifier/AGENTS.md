# AGENTS — phygital-verifier-sdk

Fail-closed Solana **instruction policy** engine over **Codama** `identify*` / `parse*`. Import only from `phygital-verifier-sdk` (package root).

This package does **not** ship program parsers or product presets (payments, collectibles). Generate Codama clients yourself (or use another package’s generated client), then compose rules here.

## When to use what

| Goal | Use |
|------|-----|
| Wrap a Codama program client | `fromCodamaProgram({ programAddress, identify, parse })` |
| Allow / deny one instruction branch | `allow(matcher, when?)` / `deny(matcher, when?)` |
| Allow / deny entire program id | `allowProgram(id)` / `denyProgram(id)` |
| Cap summed amounts across a tx | `aggregate(sources, { lte \| lt \| gte \| gt \| eq, onFail? })` |
| Run the gate | `policy(rules).verify(instructions)` → `VerifyResult` |
| Soft UX deny (custom code/details) | `allow(matcher, { when, onFail })` |

Human docs (shipped in the tarball): `docs/getting-started.md`, `docs/custom-programs.md`, `docs/writing-policies.md`, `docs/verify-and-errors.md`.

## Minimal pattern

```ts
import {
  fromCodamaProgram,
  allow,
  denyProgram,
  aggregate,
  policy,
} from "phygital-verifier-sdk";

const token = fromCodamaProgram({
  programAddress: TOKEN_PROGRAM_ADDRESS,
  identify: identifyTokenInstruction,
  parse: parseTokenInstruction,
});

const gate = policy([
  denyProgram(COMPUTE_BUDGET_PROGRAM),
  allow(token.instruction(TokenInstruction.TransferChecked), {
    when: (ix) => ix.data.amount <= MAX,
    onFail: (ix) => ({
      code: "spend_limit",
      message: "Over cap",
      details: {
        mint: String(ix.accounts.mint.address),
        amount: ix.data.amount.toString(),
        limit: MAX.toString(),
      },
    }),
  }),
  aggregate(
    [{ matcher: token.instruction(TokenInstruction.TransferChecked), amount: (ix) => ix.data.amount }],
    { lte: MAX },
  ),
]);

const result = gate.verify(instructions);
if (!result.ok) {
  // result.code, result.message, result.details
}
```

## Verify order (fail-closed)

1. `denyProgram` → `instruction_denied`
2. `deny` → `instruction_denied`
3. `allowProgram` → allowed
4. `allow` (+ optional `when` / `onFail`)
5. else → `program_not_allowed` or `instruction_not_allowed`
6. then `aggregate` → `aggregate_limit` / `aggregate_failed` / custom `onFail`

Unknown programs, failed Codama identify/parse, and unmatched allows **fail**. Empty allow surface → `invalid_policy`. Misconfigured `aggregate()` (no comparison) **throws at construction**.

## Custom `InstructionMatcher`

Only when Codama lacks the instruction (e.g. System `AdvanceNonceAccount`). Implement `kind: "instruction"`, `tryParse` / `tryMatch`, and `allow(matcher)`. Prefer Codama `program.instruction(Enum.Variant)` whenever the IDL covers it. See `docs/writing-policies.md#custom-instructionmatcher`.

## Do

- Use Codama-generated `identify*` / `parse*` via `fromCodamaProgram`
- Put owner-facing fields in `onFail.details` (no post-verify enrichment)
- Keep product policy packs in a separate package

## Do not

- Hand-roll discriminators or account layouts that duplicate Codama
- Soften fail-closed defaults
- Assume this package exports Token/System parsers (it does not)

## Orientation

```
src/index.ts   → public API
src/core/      → adapter, policy, VerifyResult
docs/          → human guides
README.md      → quickstart + API table
```
