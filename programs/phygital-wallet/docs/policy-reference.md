# Policy reference

Policy version **8**. Owner guide: [accessory-owner-guide.md](accessory-owner-guide.md).

## Program permissions

`WalletPolicyArgs.program_permissions` — each program at most once. An entry
**replaces** baseline for that program (never additive).

| Access | Behavior |
| --- | --- |
| `Denied` | Reject direct calls (including baseline programs) |
| `AllInstructions` | Allow any ix; caps / control checks still apply |
| `Restricted(rules)` | Each direct ix must match one complete rule |
| No entry | Baseline: System, SPL Token, Token-2022, ATA |

This program and phygital-token cannot be permission targets. Within a restricted
program, rules are OR; conditions inside a rule are AND. Empty rule lists /
selectors are rejected at configure time.

### `InstructionRule`

- `selector`: nonempty data prefix, 1–64 bytes
- `data_length` / `account_count`: optional exact matches
- `arguments`: byte or unsigned LE numeric predicates at offsets
- `accounts`: constraints on the **inner** account list (key / owner program /
  signer / writable / data). Data checks require an explicit owner program.

Privileges are those passed to CPI (including the wallet PDA signature). The
passkey challenge binds them in `accounts_hash` (`execute:v3`).

Rules run immediately before each direct CPI (see prior CPI effects). Nested CPIs
inside a permitted program are **not** inspected. Caps and control invariants are
independent and mandatory whenever a policy is present.

### Merchant System transfer example

```rust
WalletPolicyArgs {
    sol_cap: Some(SolCapArg { cap: 1_000_000_000, window_seconds: 86_400 }),
    mint_caps: vec![],
    program_permissions: vec![ProgramPermission {
        program_id: SYSTEM_PROGRAM_ID,
        access: ProgramAccess::Restricted(vec![InstructionRule {
            selector: 2u32.to_le_bytes().to_vec(), // System::Transfer
            data_length: Some(12),
            account_count: Some(2),
            accounts: vec![
                AccountConstraint {
                    index: 0, key: AccountKeyConstraint::Wallet,
                    owner: None, is_signer: Some(true), is_writable: Some(true),
                    data: vec![],
                },
                AccountConstraint {
                    index: 1, key: AccountKeyConstraint::Address(merchant),
                    owner: None, is_signer: None, is_writable: Some(true),
                    data: vec![],
                },
            ],
            arguments: vec![DataConstraint {
                offset: 4,
                predicate: DataPredicate::Unsigned {
                    width: NumericWidth::U64,
                    comparison: Comparison::LessThanOrEqual,
                    value: 100_000_000,
                },
            }],
        }]),
    }],
}
```

Other baseline routes remain open unless also denied/restricted. Argument bounds
are per matching instruction; the SOL cap aggregates net SOL/WSOL loss per execute.

See [instruction_policy_flow.rs](../tests/instruction_policy_flow.rs).

## Spending and control checks

Snapshot before the batch; charge measured losses after:

- No caps → no amount limits
- Any cap → uncapped mints cannot decrease; SOL/WSOL only if `sol_cap` is set
- Native SOL + wallet-owned WSOL share one net budget; wallet-funded rent counts
- Token losses sum per source account (including wallet→wallet transfers)
- Window `> 0`: epoch-grid intervals (`last_reset = now - now % window`); `0`: lifetime
- Zero configured caps are invalid; omit a cap instead of setting zero

Surviving wallet-owned token accounts keep owner, mint, and close authority; no
nonzero standing delegate. New wallet-owned accounts cannot introduce a foreign
close authority. Empty accounts may close. Meter covers SOL/WSOL and SPL/Token-2022
only — not NFT / app-specific state.

## Authority and structural guards

Sensitive instructions must be top-level. Inner ixs cannot target this program or
phygital-token, or take writable/signer on the protected token / authority PDA.
Passkey challenges bind compact instructions + account privileges to a recent slot
hash. Authority paths reject durable nonces.

| Instruction | Auth | Notes |
| --- | --- | --- |
| `set_authority` | Passkey | Once; starts empty active policy |
| `set_wallet_policy` | Owner | Full replace; **unchanged** caps keep `remaining` + anchor |
| `clear_wallet_policy` | Owner | Shrink to header; refund original payer |
| `clear_authority` | Owner | Close account; disables tap |
| `execute` | Passkey | Requires present owner; enforces policy if present |
| `execute_with_authority` | Owner | Skips policy; no allowance charge |
| `execute_with_authority_using_policies` | Owner | Same policy path as `execute` |

UI must derive effective remaining from chain time — stored `remaining` can be
stale across an interval boundary without a charge.

## Account layout

| Offset | Bytes | Field |
| --- | ---: | --- |
| 0 | 8 | Anchor discriminator |
| 8 | 104 | `AuthorityHeader` |
| 112 | 32 | SOL `SpendCap` |
| 144 | 4 | Zero padding |
| 148 | 4 | Mint-cap count `N` |
| 152 | `64 × N` | `MintCap` array |
| `152 + 64N` | variable | Borsh `Vec<ProgramPermission>` |

`BASE_LEN = 156`. Policy present when `policy_version == 8` (vs `0`). GPA: filter
Authority discriminator + authority pubkey at offset **8** + `version == 1`
(`AUTHORITY_VERSION`) at offset **106** (token at **40**).

Config limits: 16 program overrides, 16 rules/program, 16 account/arg constraints
per rule, 16 data constraints per account, 64-byte matchers, 4096 permission
bytes, 8192 decoded permission allocations. Tx size / CU still apply.

## Build

```sh
NO_DNA=1 anchor build && pnpm idl:sync
NO_DNA=1 cargo test -p phygital-wallet --tests
```

IDL: [`idl/phygital_wallet.json`](../../../idl/phygital_wallet.json).
