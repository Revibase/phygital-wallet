# Verify results & errors

```ts
type VerifyResult =
  | { ok: true }
  | { ok: false; code: string; message: string; details?: VerifyFailDetails };
```

| Code                      | Meaning                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `invalid_policy`          | Empty allow surface (no `allow` / `allowProgram` matched the program set) |
| `program_not_allowed`     | No allow / allowProgram for this program                                  |
| `instruction_not_allowed` | No matching allow for this ix                                             |
| `instruction_denied`      | A `deny` or `denyProgram` rule matched                                    |
| `aggregate_limit`         | Tx-level sum breached                                                     |
| `aggregate_failed`        | Amount accessor threw                                                     |

Misconfigured `aggregate()` (e.g. zero comparison ops) **throws at construction**, not as a verify code.

`details` may include `instructionIndex`, `programId`, `instructionName`, `limit`, `actual`, plus any soft-UX fields your `onFail` sets (`destination`, `mint`, `amount`, `decimals`, …).
