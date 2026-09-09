# Getting started

`phygital-verifier-sdk` checks an array of Kit `Instruction`s against a **TypeScript rule tree**.

1. Obtain a Codama Kit client for each program (`identify*` + `parse*`).
   Step-by-step (install Codama, `codama init`, `codama run js`):
   **[From IDL to policy](./custom-programs.md)**.
2. Wrap with `fromCodamaProgram`.
3. Build rules with `allow` / `deny` / `allowProgram` / `aggregate`.
4. Call `policy(rules).verify(instructions)`.

Unknown programs, unparsed instructions, and unmatched allows **fail closed**.

Revibase’s payments preset lives in **`phygital-policy`**, not this package.
