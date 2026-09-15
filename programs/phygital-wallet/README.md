# Phygital wallet program

Accessory taps authorize everyday actions. The **owner key** sets permissions and
allowances, and can run a separate transaction that bypasses accessory policy.

A tap can still fail: the request must match permissions and remaining allowance.

## Docs

- [Accessory owner guide](docs/accessory-owner-guide.md) — everyday behavior and wording
- [Policy reference](docs/policy-reference.md) — rules, metering, account layout
- [TypeScript SDK](../../packages/js/phygital-wallet/README.md)

## Defaults

After `set_authority`, the wallet starts with **No spending limits · Standard
protections**:

- No amount caps on SOL / supported tokens through baseline programs
- Non-baseline programs need an explicit permission
- Wallet-owned token accounts cannot keep a standing delegate or change control
  during accessory execute

There is no policy before owner setup. After `clear_authority`, the accessory tap
is disabled until a new owner is set.

## Owner actions (keep distinct)

| Action | Effect |
| --- | --- |
| Set spending limits | Caps listed assets; any cap blocks uncapped asset decreases |
| Remove spending limits | Clear caps; keep program rules |
| Change program permissions | Per-program Denied / AllInstructions / Restricted; unchanged caps keep usage |
| Restore standard settings | Empty policy args: baseline programs, no caps, no custom blocks |
| Turn off protections | `clear_wallet_policy` — owner remains; tap stays on without policy checks |
| Owner execute | Separate tx; skips policy; does not consume accessory allowance |
| Remove owner | `clear_authority` — closes authority + policy; **disables tap** |

## Build

```sh
NO_DNA=1 anchor build
pnpm idl:sync
NO_DNA=1 cargo test -p phygital-wallet --tests
```

IDL: [`idl/phygital_wallet.json`](../../idl/phygital_wallet.json).
