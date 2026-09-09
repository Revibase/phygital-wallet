# phygital-policy

Revibase payments / collectibles standing policy, built by dogfooding
`phygital-verifier-sdk` on **Codama Kit clients generated from vendored IDLs**.

```ts
import { buildPaymentsPolicy } from "phygital-policy";

const gate = buildPaymentsPolicy({
  version: "3",
  mintLimits: [
    { mint: USDC, maxRaw: "50000000" },
    { mint: OTHER, maxRaw: "1000000" },
  ],
  maxSolLamports: "100000000",
});

gate.verify(instructions);
```

Defaults (not persisted — only caps + extras are configurable):
collectibles, system setup, NFT token transfers, and ATA create are on;
token `closeAccount` is off.

Config types/defaults (`PaymentsPolicyConfig`, `uiAmountToRaw`, …) are
tree-shakeable. Persistence validation lives in api-signer. Codama adapters
and program IDs are package-internal.

## Generated clients

Codama output lives under `src/generated/`. After regenerating from IDLs, trim
to the policy surface:

```bash
pnpm trim
pnpm build
```

`pnpm trim` keeps only instructions used by `buildPaymentsPolicy`, then keeps
only types those instructions transitively need (deletes the rest).

| Program | Kept instructions |
|---------|-------------------|
| system | transferSol, createAccount, allocate, assign |
| token / token-2022 | transferChecked, transfer, closeAccount |
| associated-token | create, createIdempotent |
| token-metadata | Transfer |
| bubblegum | transfer, transferV2 |
| mpl-core | TransferV1 |
