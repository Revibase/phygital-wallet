# Policy rules (agents) — fail closed

Follow these when authoring or reviewing policies and verifier changes.

## Hard invariants

1. **Unknown instruction discriminators fail** when the program needs parsing (denies, aggregates, or explicit allows).
2. **Unknown / empty `when` shapes fail** (`invalid_policy`) — never “match everything.”
3. **Empty `and` / `or` fail** — never vacuous true.
4. **`NOT` over a missing field fails** — optional accounts omitted from parse must not satisfy NOT.
5. **Duplicate `programId` in policy or parsers fail**.
6. **`allowAll` + aggregates for that program is forbidden** (sibling-ix spend evasion).
7. **Compute Budget is always rejected** by `createVerifier` — not a policy opt-in.
8. **Bool coercion**: only `"true"` / `"false"` strings — not `"1"` / `"0"`.

## Safe defaults for end-user wallets

| Setting | Prefer |
|---------|--------|
| Collectibles | On by default (opt out with `includeCollectibles: false`) |
| System setup (`createAccount` / `allocate` / `assign`) | Off |
| `closeAccount` | Only with `wallet` destination binding |
| SPL `transfer` (no mint) | Off; use `transferChecked` + mint or collectibles amount≤1 |
| Caps | Per-tx **aggregates** for USDC (Token+Token-2022) and SOL |
| Recipients | Not enforced by STANDARD — product layer if needed |

## Amounts

- Always **raw** units in policies.
- Per-ix `amount lte` alone is **insufficient** if multiple transfer ixs can appear in one tx — add aggregates.
- Caps are **per transaction**, not lifetime.

## Extending STANDARD

- Prefer composing `definePolicy([...standardPolicy({ maxMintRaw, maxSolLamports }), …], standardTransaction({ maxMintRaw, maxSolLamports }))` when spend caps are set; omit maxes for program allowlist only.
- Collectibles (incl. companion `allowAll`) are on by default; pass `includeCollectibles: false` for payments-only.
- New third-party programs: generate into **the consuming app**, not into this package’s `src/generated/` unless they are intentional STANDARD surface.

## Anti-patterns (reject in review)

- Shipping DEX/Jupiter parsers inside this SDK “for convenience” without an explicit product decision
- `allowAll: true` on Token / System for a consumer wallet
- Policies that allow Compute Budget
- Hand-editing large generated parser files instead of regenerating from IDL
- Softening fail-closed paths to “warn and allow”
