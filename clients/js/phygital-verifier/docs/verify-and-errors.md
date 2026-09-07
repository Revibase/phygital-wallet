# Verify results and errors

```ts
const result = verify(policy, instructions);

if (result.ok) {
  // { ok: true }
} else {
  // { ok: false, code, message, details? }
}
```

## Success

```ts
{ ok: true }
```

## Failure codes

| Code | Meaning |
|------|---------|
| `invalid_policy` | Malformed policy (duplicate programId, empty and/or, unknown `when` shape, allowAll+aggregates, …) |
| `invalid_parsers` | Duplicate parser `programId`s registered on the verifier |
| `unexpected_instruction` | Empty instruction list |
| `compute_budget_not_allowed` | Compute Budget program present — strip before verify |
| `program_not_allowed` | Instruction program not in policy |
| `parser_not_found` | Policy needs decode but no parser registered |
| `instruction_not_allowed` | Instruction name not in allows (or Unknown under deny/aggregate) |
| `spend_limit` | Per-instruction amount/`when` failed (often amount over cap) |
| `aggregate_limit` | Per-tx sum over aggregate cap |
| `aggregate_failed` | Could not evaluate an aggregate field (decode / type issues) |

Treat unknown codes as fail-closed denials.

## Details

Instruction-scoped failures include decoded context when a parser is registered:

| Key | Meaning |
|-----|---------|
| `instructionIndex` | Which ix failed |
| `programId`, `instructionName` | Program / instruction |
| `field`, `op`, `limit`, `actual` | Condition mismatch (when present) |
| `mint` | Decoded mint pubkey |
| `amount` | Decoded amount (`amount` or `transferArgs.amount`) as decimal string |
| `decimals` | From `transferChecked` for SPL mints; `9` only for native System `transfer` |
| `amountUi` | Human-readable amount (`amount` ÷ 10^decimals) — prefer for UX |
| `destination` | Decoded send recipient (first of destinationOwner / newLeafOwner / newOwner / wallet / destination) |

Use them for UX / co-signer mapping — no need to re-parse the instruction.

## Practical tips

1. **Strip Compute Budget** before calling verify.
2. Prefer `defineStandardPolicy` / aggregates for multi-ix spend — per-ix `lte` alone can be bypassed by splitting transfers across instructions.
3. Register **every** program you allow that is not pure `allowAll` without denies/aggregates.
4. Call `validatePolicy(policy)` in tests or policy editors before persisting.
