# Policy reference for integrators

This reference describes the **undeployed v2 program, policy version 8**. Start
with the [owner guide](accessory-owner-guide.md) for everyday behavior, or the
[expectation review](user-experience-review.md) for behavior that needs product work.

## Program and instruction permissions

`WalletPolicyArgs.program_permissions` replaces the old `allowed_programs` list.
Each program may appear exactly once. An explicit entry **replaces** that program's
baseline permission; a broad baseline entry can never bypass restricted rules.

| Access | Behavior |
| --- | --- |
| `Denied` | Reject direct calls, including to baseline programs |
| `AllInstructions` | Explicitly allow any instruction; global caps/control checks still apply |
| `Restricted(rules)` | Every direct instruction must match one complete rule |
| No entry | Allow System, SPL Token, Token-2022 and ATA; deny other programs |

The System program's zero pubkey is valid here. This program and the
phygital-token program cannot be configured as permission targets and are always
rejected by the execution structural guards.

Within a restricted program, rules are OR alternatives. Conditions inside a rule
are all AND requirements. Conditions from different rules cannot be combined.
An empty restricted rule list or empty selector is rejected when configuring policy.

An `InstructionRule` contains:

- `selector`: a nonempty instruction-data prefix, 1–64 bytes. This supports
  one-byte token tags, four-byte System tags and Anchor discriminators.
- `data_length`: optional exact encoded byte length. Set this for fixed layouts.
- `account_count`: optional exact count of instruction account positions. This
  includes repeated accounts. Use it to reject unexpected remaining accounts.
- `arguments`: byte equality or unsigned little-endian numeric predicates at
  explicit offsets. Numeric widths are 8, 16, 32 or 64 bits; comparisons are
  equal, not equal, less/greater than, and inclusive less/greater than.
- `accounts`: constraints on positions in the **instruction's** account list,
  resolved through its compact indexes, not positions in the outer account list.
  Each can match any address, an exact address, or the wallet PDA; constrain the
  owner program; require signer/writable flags; and check account data.

Account data checks require an explicit owner program, to avoid accepting data
from a forged account owned by another program. The Solana owner program differs
from the owner pubkey encoded inside an SPL token account: to constrain the latter,
check the token account's data as well. Predicates validate bytes, not full protocol
semantics; use the correct schema and expected account relationships.

Signer/writable checks use the actual privileges passed to CPI, including the
wallet PDA signature. Privileges currently come from the outer account infos and
can be elevated by another instruction in the transaction; rules reject mismatches
rather than silently downgrading them.

### Example: restrict System transfers to a merchant

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
                    value: 100_000_000, // 0.1 SOL per instruction
                },
            }],
        }]),
    }],
}
```

This is a restriction on direct System calls, not a complete merchant-only wallet
policy. Other programs retain their baseline permissions. To authorize only a
specific payment workflow, also deny or restrict other transfer routes (including
Token, Token-2022 and ATA as appropriate). The argument maximum is per instruction;
the SOL cap aggregates the execute's net SOL/WSOL loss and carries across executions.

For `TransferChecked`, match the token instruction selector and mint account,
constrain destination address or destination token-owner bytes, and require the
wallet authority account. See [instruction-policy tests](../tests/instruction_policy_flow.rs) for runnable
System and Token-2022 examples.

### Execution and trust boundary

Rules run immediately before each direct CPI, so account predicates see changes
made by preceding instructions in the batch. A violation reverts the entire
transaction. Malformed policy data, short instruction/account data, missing
positions and unknown versions fail closed.

The wallet **does not inspect every nested CPI**. A permitted router or token
transfer hook may invoke other programs with the privileges it receives. Program
and selector permission remains trust in the selected entrypoint and its code,
including upgrades. Use narrow account lists and audited protocol-specific rules.
Generic hooks/adapters, PDA derivation checks and minimum-output postconditions
are not implemented in this version.

Spending caps and control invariants remain independent, mandatory checks whenever
a policy is present; matching a rule or choosing `AllInstructions` never skips them.

## Spending and control checks

Before the batch, snapshot tracked balances; afterwards, charge actual losses:

- With **no caps**, SOL and tokens have no amount limits.
- With **any cap**, uncapped mints cannot decrease. SOL/WSOL can decrease only
  when the SOL cap exists. Receiving an uncapped asset is allowed.
- Native SOL and wallet-owned wrapped SOL share one net budget. Wrapping/unwrapping
  within the batch nets out. Wallet-funded rent counts toward native SOL loss.
- Token losses are summed across source accounts; transfers between wallet-owned
  token accounts consume the mint allowance too.
- A positive window is a fixed interval anchored when policy is saved, not a
  trailing window or calendar day. A zero window never resets automatically.
  Zero configured caps are invalid; omitting a cap is not the same as blocking it.

Surviving wallet-owned token accounts must retain their owner, mint and close
authority. No wallet-owned token account may retain a nonzero delegated amount.
New wallet-owned token accounts cannot introduce a foreign close authority. Empty
token accounts may be closed; closing wrapped SOL participates in the SOL delta.
These checks apply even when there are no spending caps.

The balance meter covers SOL/WSOL and SPL/Token-2022 accounts, not arbitrary NFT,
position or application state. Permission to call those programs does not create
a budget or asset-specific invariant for them.

## Structural guards and authority recovery

Both execution paths must be top-level. Inner instructions cannot target this
program or phygital-token, and cannot request writable/signer privileges for the
protected token or authority PDA. The wallet PDA's owner and data length must stay
unchanged. Passkey challenges bind the compact instructions and referenced account
keys to a recent slot hash. Authority/admin paths reject durable nonce transactions.

`set_authority` requires the accessory proof and only succeeds once. Policy changes,
policy clearing and authority clearing require the configured authority signer.
`execute_with_authority` bypasses all policy checks but retains structural guards.
Owner execution does not charge accessory allowances. It reads only the fixed
header, keeping the authority path available for unsupported
or malformed policy tails. `clear_wallet_policy` likewise repairs from the header
without decoding the tail; it refunds excess rent to the original authority payer.
**Every successful `set_wallet_policy` replaces the entire policy, but usage is
preserved for any cap left unchanged.** A cap counts as unchanged when both its
amount and its window match the previously stored cap for that asset (matched by
mint; the SOL cap by presence); such a cap keeps its `remaining` and its interval
anchor, so an identical save or a permissions-only edit does not refill allowances
or reset the clock. A changed cap (different amount or window) and a newly-added cap
are refilled and anchored at the current chain timestamp. A new payer can fund
account growth; shrinking always refunds the original payer.

### Exact interval and allowance accounting

`new_spend_cap` stores `last_reset = now` when a cap is first created (or when a
save changes its amount or window). On a later positive charge, `charge_cap` refills
when `now - last_reset >= window_seconds`. It advances by whole periods, preserving
the original phase. When elapsed time equals exactly one interval from the stored
anchor, the allowance refills. A read or a zero-spend execution does not update
counters. An interface must calculate effective remaining allowance from chain time;
stored `remaining` alone can be stale. Do not promise a midnight reset or a rolling
24-hour total.

SOL uses the positive net decrease of wallet lamports plus wallet-owned WSOL.
SPL token use sums positive decreases of individual spendable source accounts.
An inflow into the same source in the same batch can offset its outflow; an inflow
into a different token account does not cancel that source's debit. A later deposit
does not restore a previously consumed allowance. Account rent paid by the wallet
contributes to its SOL loss. Fees charged to a separate fee payer are outside that
wallet balance calculation. Unwrapping can include a rent refund, so distinguish
asset amount from the complete lamport change when explaining a quote.

An argument bound is **per matching instruction**, not per tap or transaction.
Multiple instructions can each meet it. The separate spending cap aggregates the
measured loss across each `execute`; allowance state carries across executions.
An owner bypass leaves that state untouched. A failed transaction rolls back the
wallet changes, but transaction fees may still be charged.

### Setup and removing owner controls

The accessory tap **requires a present owner**: `execute` rejects with
`AccessoryDisabled` whenever the authority account is absent — before `set_authority`
succeeds, or after `clear_authority` closes it. Standard protections and the tap
itself start only after `set_authority`. `clear_authority` closes the authority
account, removes its policy, and thereby **disables the accessory tap**; it does not
close the wallet, freeze funds already held, or transfer ownership of the phygital
token. A new owner (which re-enables the tap) can be installed with a valid accessory
proof. An owner that wants to keep the tap enabled but drop spending limits uses
`clear_wallet_policy` instead (owner present, policy absent). Do not map
`clear_authority` to a button named “Disconnect” — it removes owner control and
disables tapping until a new owner is set.

`clear_authority` uses Anchor decoding of the full account. For an undecodable tail,
use `clear_wallet_policy` first; unlike owner execution and policy clearing, closing
the authority is not a header-only repair path. Policy clearing also requires enough
lamports for the current base rent. No automatic layout/rent migration is supplied.

## Account layout and versioning

This is policy version **8**. Previous version-7 program lists are not interpreted
as instruction rules. This is an undeployed v2 interface change, not an on-chain
migration. The authority header remains version 1 and has unchanged offsets.

| Offset | Bytes | Field |
| --- | ---: | --- |
| 0 | 8 | Anchor discriminator |
| 8 | 104 | `AuthorityHeader` |
| 112 | 32 | SOL `SpendCap` |
| 144 | 4 | Zero `policy_padding` |
| 148 | 4 | Borsh mint-cap count `N` |
| 152 | `64 × N` | Aligned `MintCap` array |
| `152 + 64N` | variable | Borsh `Vec<ProgramPermission>`, including count prefix |

`BASE_LEN = 156`. Both an empty active policy and no policy use this size;
`header.policy_version` distinguishes them (`8` vs `0`). No-policy tails must be
zeroed. The full account is standard Borsh/Anchor-decodable. Header and counters
use zero-copy reads; the variable permission tail uses bounded decoding.

Limits: 16 program overrides, 16 rules per restricted program, 16 account/argument
constraints per rule, 16 data constraints per account, 64 bytes per byte matcher,
4096 encoded permission bytes, and 8192 bytes of decoded permission allocations.
Limits are validated at configuration and before allocations during tail decoding.
Transaction size, compute and total execution heap limits still apply; these maxima
are not a promise that every combination fits in a transaction. There is no
chunked policy upload. Mint counts and tracked accounts have no additional fixed
program ceiling; tests cover more than eight mints and sixteen tracked accounts.

For discovery, filter `getProgramAccounts` by Authority discriminator and authority
pubkey at offset **8**. The phygital token is at offset **40**. Avoid a fixed account
size filter because policies have variable lengths.

## Interface and verification

[The v2 IDL](../../../idl/phygital_wallet_v2.json) describes this program. The existing
`idl/phygital_wallet.json`, application and generated SDK target the earlier
interface; they are not overwritten by v2 development.

Run from the repository root:

```sh
NO_DNA=1 anchor build
cp target/idl/phygital_wallet.json idl/phygital_wallet_v2.json
NO_DNA=1 cargo test -p phygital-wallet --tests
```

Tests execute the freshly built SBF program in LiteSVM, covering authority and
passkey authorization, spending/control invariants, program overrides, rule
matching, atomic rollback, current-state account checks, Borsh interoperability,
malformed-tail recovery and rent refunds. No deployment is performed.
