# Getting started

`phygital-verifier-sdk` checks an array of Kit `Instruction`s against a **TypeScript rule tree**.

1. Obtain a Codama Kit client for each program (`identify*` + `parse*`).
   Step-by-step (install Codama, `codama init`, `codama run js`):
   **[From IDL to policy](./custom-programs.md)**.
2. Wrap with `fromCodamaProgram`.
3. Build rules with `allow` / `deny` / `allowProgram` / `denyProgram` / `aggregate`.
4. Call `policy(rules).verify(instructions)`.

Unknown programs, unparsed instructions, and unmatched allows **fail closed**.

Product presets (e.g. Revibase payments) belong in a separate package — this SDK
only provides the policy engine.
