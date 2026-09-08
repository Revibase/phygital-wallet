# Verify results & errors

```ts
type VerifyResult =
  | { ok: true }
  | { ok: false; code: string; message: string; details?: VerifyFailDetails };
```

| Code | Meaning |
|------|---------|
| `invalid_policy` | Empty rule set / misconfigured aggregate |
| `program_not_allowed` | No allow / allowProgram for this program |
| `instruction_not_allowed` | No matching allow for this ix |
| `instruction_denied` | A deny rule matched |
| `aggregate_limit` | Tx-level sum breached |
| `aggregate_failed` | Amount accessor threw |

`details` may include `instructionIndex`, `programId`, `instructionName`, `limit`, `actual`.
