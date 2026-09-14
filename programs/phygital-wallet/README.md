# Phygital wallet: an accessory for everyday payments

Use the accessory to authorize a payment. Use a separate **owner key** to choose
what the accessory can do, change its limits, or make a transaction outside those
limits. A tap does not guarantee success: the requested action must satisfy the
wallet's permissions and available allowance.

**Development status:** this directory contains the undeployed v2 program (policy
version 8). The existing app and TypeScript SDK still use the earlier verifier
interface. The behavior below describes this program, not features already shipped
in the app.

## Start here

- [Accessory owner guide](docs/accessory-owner-guide.md): what a tap permits, limits,
  receiving funds, owner access, and common reasons a payment is blocked.
- [User expectation review](docs/user-experience-review.md): what feels natural,
  current surprises, and recommended changes that are not yet implemented.
- [Integration reference](docs/policy-reference.md): instruction rules, exact spend
  accounting, account layout, recovery, and a working configuration example.
- [Repository entry point](../../README.md): program build and documentation links.

## What happens by default?

After owner setup succeeds, the wallet starts with
**No spending limits · Standard protections**.

- Ordinary SOL and supported token transfers have no amount cap.
- Direct calls to other applications need an explicit permission.
- Checks prevent supported token accounts from retaining a spending approval for
  someone else or changing their ownership/control during accessory execution.

This default is not a spending budget or a guarantee against an unwanted payment.
There is no wallet policy before owner setup or after owner controls are removed.

## Keep these choices distinct

| Owner action | What it means |
| --- | --- |
| Set accessory spending limits | Choose the assets the accessory may spend and their allowances; assets without a cap become unavailable while any cap exists |
| Remove spending limits | Remove all caps and keep existing application rules; amounts become unlimited |
| Change application permissions | Choose blocked, all instructions, or specific rules for each program; saving currently refills all allowances |
| Restore standard settings | Remove all caps and custom rules; previously blocked baseline programs become allowed again |
| Turn off accessory protections | Remove the policy entirely; standard checks and limits stop applying |
| Use owner key for this transaction | Execute without accessory policy checks, without changing the policy or consuming its allowance |
| Remove owner controls | Delete authority and policy; this does not disable or empty the wallet |

The last three choices must not be presented as interchangeable ways to remove a
limit. An owner transaction is a separate signed transaction, not an approval token
that makes a blocked accessory transaction pass.

## Build and verify

Run from the repository root:

```sh
NO_DNA=1 anchor build
cp target/idl/phygital_wallet.json idl/phygital_wallet_v2.json
NO_DNA=1 cargo test -p phygital-wallet --tests
```

The [v2 IDL](../../idl/phygital_wallet_v2.json) is the interface for this directory.
Keep it separate from the earlier app/SDK IDL. The root `build:program` script also
regenerates the earlier SDK; use the commands above for isolated v2 work.

Tests run the built SBF program in LiteSVM. See
[instruction-rule tests](tests/instruction_policy_flow.rs) and
[spending regressions](tests/spending_regressions.rs) for concrete examples.
No deployment is part of this workflow.
