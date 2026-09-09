# AGENTS — phygital-verifier-sdk

Fail-closed Solana instruction policy gate over **Codama** `identify*` / `parse*`.

## Orientation

```
src/index.ts     → public API
src/core/        → adapter, policy rules, verify types
```

## Do

- Wrap Codama clients with `fromCodamaProgram`
- Compose `allow` / `deny` / `allowProgram` / `aggregate` then `policy(…).verify(…)`
- Keep product presets (payments, collectibles) **out** of this package
- Point humans at `docs/custom-programs.md` for IDL → `codama init` / `codama run js` → SDK

## Do not

- Reintroduce STANDARD parsers / JSON `when` AST / custom IDL→tryDecode generators
- Hand-roll discriminators or layouts (use Codama)
- Soften fail-closed paths
