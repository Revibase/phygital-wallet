# Phygital wallet

NFC accessory authorizes everyday spends. A separate owner key manages policy and
can execute outside those limits.

Default after owner setup: **No spending limits · Standard protections**
(policy version 8).

| Doc | Audience |
| --- | --- |
| [Program overview](programs/phygital-wallet/README.md) | Developers |
| [Accessory owner guide](programs/phygital-wallet/docs/accessory-owner-guide.md) | Product / UX |
| [Policy reference](programs/phygital-wallet/docs/policy-reference.md) | Integrators |
| [TypeScript SDK](packages/js/phygital-wallet/README.md) | App clients |

```sh
NO_DNA=1 anchor build
pnpm idl:sync          # → idl/phygital_wallet.json
NO_DNA=1 cargo test -p phygital-wallet --tests
```

Or `pnpm build:program` to build, sync the IDL, and regenerate the JS client.
