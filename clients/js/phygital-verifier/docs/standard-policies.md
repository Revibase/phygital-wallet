# Standard policies

Helpers that ship a wallet/collectible program allowlist plus **optional**
per-transaction spend aggregates.

```ts
import {
  DEFAULT_MAX_MINT_RAW,
  DEFAULT_MAX_SOL_LAMPORTS,
  defineStandardPolicy,
  standardPolicy,
  standardTransaction,
  uiAmountToRaw,
} from "phygital-verifier-sdk";
```

## One-shot: `defineStandardPolicy(opts?)`

Returns a `PolicyDocument`. Spend caps are **opt-in**:

- Bare `defineStandardPolicy()` / omit maxes → program allowlist, **no** amount caps.
- Pass `maxMintRaw` / `maxSolLamports` (or the exported defaults) to enable spend limits.

```ts
// Program allowlist only (recipients / apps can layer on top in the wallet)
const allowlistOnly = defineStandardPolicy({ wallet });

// First-enable spend caps
const withCaps = defineStandardPolicy({
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  maxMintRaw: DEFAULT_MAX_MINT_RAW, // 50 USDC
  maxSolLamports: DEFAULT_MAX_SOL_LAMPORTS, // 0.1 SOL
  wallet: userWallet,
});
```

Compose with extra programs:

```ts
import { definePolicy, defineProgram, standardPolicy, standardTransaction } from "phygital-verifier-sdk";

const policy = definePolicy(
  [
    ...standardPolicy({ wallet, maxMintRaw: DEFAULT_MAX_MINT_RAW, maxSolLamports: DEFAULT_MAX_SOL_LAMPORTS }),
    defineProgram(jupiterParser, {
      allows: [{ instruction: "route", when: { /* … */ } }],
    }),
  ],
  standardTransaction({
    maxMintRaw: DEFAULT_MAX_MINT_RAW,
    maxSolLamports: DEFAULT_MAX_SOL_LAMPORTS,
  }),
);
```

When spend caps are set, pair `standardPolicy` with `standardTransaction` (or use `defineStandardPolicy`) so USDC/SOL **aggregates** apply across multiple instructions in one transaction.

## Defaults

| Allowed | Cap / notes |
|---------|-------------|
| ATA `create` + `createIdempotent` | Uncapped (rent outside SOL aggregate) |
| System `transferSol` | Uncapped unless `maxSolLamports` set (then per-ix + aggregate) |
| Token / Token-2022 `transferChecked` for the configured mint | Uncapped unless `maxMintRaw` set (then per-ix + aggregate) |
| `closeAccount` | Only if `wallet` is set; destination must equal `wallet` |
| Collectibles (on by default) | See below |

**Off by default:** system `createAccount` / `allocate` / `assign`, SPL `transfer` (no mint check). Pass `includeCollectibles: false` for payments-only.

## Collectibles (`includeCollectibles`, default `true`)

Enables:

| Path | Instruction |
|------|-------------|
| Legacy SPL NFT | Token / Token-2022 `transferChecked` with `amount ≤ 1` |
| pNFT / Metaplex TM | Token Metadata `Transfer` with `transferArgs.amount ≤ 1` |
| cNFT V1 | Bubblegum `transfer` |
| cNFT V2 | Bubblegum `transferV2` |
| MPL Core | `TransferV1` |
| Companions | `auth9…`, `cmtDv…`, `noopb…` as `{ allowAll: true }` |

NFT value is not dollar-capped — enabling this allows draining any allowed NFT.

## Options reference

| Option | Default | Purpose |
|--------|---------|---------|
| `mint` | mainnet USDC | Mint for standing `transferChecked` |
| `maxMintRaw` | unset (uncapped) | Per-tx raw USDC cap; use `DEFAULT_MAX_MINT_RAW` for 50 USDC |
| `maxSolLamports` | unset (uncapped) | Per-tx SOL cap; use `DEFAULT_MAX_SOL_LAMPORTS` for 0.1 SOL |
| `wallet` | unset | Enables `closeAccount` with destination eq wallet |
| `includeCollectibles` | `true` | NFT transfer paths + companion `allowAll` |
| `includeAta` | `true` | ATA create ixs |
| `includeSystemSetup` | `false` | System createAccount / allocate / assign |
| `includeTokenCloseAccount` | `true` | closeAccount when `wallet` set |
| `includeNftTokenTransfer` | `false` | SPL `transfer` amount ≤ 1 (prefer collectibles + `transferChecked`) |
| `tokenPrograms` | `["token","token2022"]` | Which token program blocks to emit |

## `uiAmountToRaw(ui, decimals)`

Converts a UI amount to raw units as `bigint` without float drift for common decimals. Policy condition values must be **decimal strings**:

```ts
uiAmountToRaw(50, 6).toString(); // "50000000"
```

## What STANDARD does *not* do

- Lifetime / daily spend limits (only **per transaction**)
- Recipient allowlists (product layer, e.g. API `recipientMode`)
- Binding authority/source to a specific wallet pubkey in standing allows
- DEX / swap programs (add via [custom parsers](./custom-parsers.md))
