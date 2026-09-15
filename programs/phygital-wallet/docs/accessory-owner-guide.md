# Using your accessory wallet

This guide describes the **undeployed v2 program**. It is the intended contract for
an app built on that program. The current app still uses an earlier interface;
buttons and screens mentioned here are recommended wording, not shipped UI.

## Your accessory and your owner key have different jobs

The accessory authorizes everyday transactions. The wallet checks what the request
would do and applies your accessory permissions and spending limits. The app should
show the recipient, asset, amount and any additional actions before authorization.
The program verifies the signed request; it cannot verify what a screen showed you.

The **owner key** is a separate admin key. It can change settings and make
transactions without accessory limits. It is not restricted to emergencies or to
one type of payment. How an app stores and authenticates that key is separate from
this program; the program does not itself require phone biometrics.

Linking owner controls establishes the default protections and enables the accessory
tap. Before that setup succeeds, **the accessory cannot tap at all** — a tap requires
a present owner. Merely opening the wallet or connecting to a website does not
establish these on-chain controls.

## Your starting settings

**No spending limits · Standard protections** means:

- Ordinary SOL and supported token payments have no amount cap. An authorized
  transaction can spend the available balance through those permitted operations.
- Direct calls to other applications are blocked until you allow them. Swaps,
  lending and some collectible transfers may therefore need additional permission.
- Supported token-account checks prevent leaving another party with a nonzero
  spending approval or changing control of an existing wallet-owned account.

“Standard protections” does not mean every payment is safe, every asset is covered,
or only trusted merchants can receive funds. There is no default recipient list.
Application-specific assets and token extensions can have additional behavior.

## Spending limits also choose which assets can be spent

When you add **any** spending limit, only assets with configured allowances can be
spent through the accessory. For example:

| Your settings | Accessory spending |
| --- | --- |
| No limits | No amount limits for SOL and tokens through permitted operations |
| USDC: 100 per interval; no SOL limit | USDC up to its allowance; SOL and other tokens cannot decrease |
| SOL: 1 and USDC: 100 per interval | SOL/WSOL and USDC up to their allowances; other tokens cannot decrease |

A token payment can need a small amount of SOL to create the recipient's token
account. If that SOL comes from your wallet, you also need a SOL allowance while
limits are enabled. The app should include account-creation costs in its preview.

Removing one asset's allowance while other caps remain **blocks that asset**.
Removing the last allowance **removes all amount limits**. A zero allowance is not
a supported setting. An app must make this difference clear before saving.

## When does my allowance reset?

A “24-hour allowance” follows fixed intervals aligned to the clock grid, not to
the moment you saved. A daily limit resets at 00:00 UTC; a weekly limit resets on
a fixed weekday; a “monthly” limit is a fixed 30 days. It does not total all
spending in the preceding 24 hours, and unused allowance does not accumulate.

The allowance refills on the first positive spend **at or after** the next grid
boundary. The app shows the actual next reset date, not just “daily.” A limit with
no reset interval lasts until owner settings change it.

**Saving a policy setting keeps the usage of any allowance you left unchanged.**
Editing an application permission, or saving the same limits again, no longer refills
your allowances or restarts their intervals. An allowance is refilled and its clock
restarts only when you change that limit's amount or its reset interval, or add a
new limit.

## What counts as spending?

The wallet measures supported balances around the actions you authorize.

- SOL and wallet-owned wrapped SOL share an allowance. Wrapping/unwrapping does
  not charge the same asset twice; associated rent movements can affect the total.
- Token spending is measured per source account. Moving tokens between two of your
  own token accounts can use allowance even though your overall holdings stay equal.
- Several payments in one request share the available allowance. A separate rule
  limiting each individual action is not automatically a limit on the entire tap.
- Receiving money later does not restore an allowance already used. Within one
  request, money returning to the same measured balance can reduce the net charge.

Allowances are asset amounts, not a stable dollar value. A SOL allowance changes in
market value as SOL's price changes.

## Can I still receive funds?

Ordinary incoming transfers do not require your accessory authorization. A spending
cap does not cap your wallet balance. The asset's own transfer rules still apply.
If receiving is part of an action your wallet executes, that action must also meet
its application permissions; “receiving” does not exempt a blocked application.

## Application permissions

An app should describe permissions as actions such as “Transfer USDC to this
merchant,” with the relevant asset and recipient shown.

- **Blocked:** the accessory cannot call that program directly.
- **All instructions:** the accessory may call any instruction in that program.
  Spending limits and supported account-control checks remain active.
- **Specific actions:** the request must satisfy one complete rule, including its
  allowed instruction, accounts and any amount conditions.

A restriction on one program does not restrict every way funds can move. A
merchant rule needs all relevant payment routes covered to be merchant-only.
An allowed application can also call other programs internally; the wallet does
not inspect each of those nested calls. “All instructions” is broad trust in that
application, not a safety rating. The app should not label these modes “safe apps.”

## If a transaction is blocked

| What happened | Useful next step |
| --- | --- |
| Allowance would be exceeded | Reduce the amount, wait for the displayed reset, or use the owner key |
| This asset has no allowance | Configure its allowance; check whether wallet-funded SOL is also needed |
| Application is not allowed | Review the action and add an appropriate permission using the owner key |
| Action does not match the rules | Check recipient, asset, amount and application operation; do not silently broaden permissions |
| Request changes token-account control | Review the approval/ownership action using the owner key |
| Settings cannot be read or the request expired | Refresh/rebuild the request, or use owner recovery for invalid settings |

A failed transaction rolls back its wallet actions; network transaction fees may
still apply. Failure does not automatically create an owner-approval inbox entry.
That would be an app feature, not a service supplied by this v2 program.

## Owner transactions and recovery

The owner can make a separate transaction outside the accessory policy. It does
not change your settings or deduct from the accessory allowance. It still has to
satisfy the called programs and the wallet's structural checks.

If the accessory is unavailable, the owner key can move funds without it. This
program does not provide a dedicated lost-accessory freeze, account-recovery
service, or replacement accessory flow.

| Setting change | Consequence |
| --- | --- |
| Remove spending limits | Keeps application rules; supported spending amounts become unlimited |
| Restore standard settings | Removes limits and custom rules, including custom blocks |
| Turn off accessory protections | Removes the policy but keeps the owner; the tap stays enabled without baseline program/control checks |
| Remove owner controls | Removes owner authority and policy and **disables the accessory tap**; tapping stays off until a new owner is set (re-set with the accessory) |

Removing owner controls disables tapping but does not disconnect a browser session,
close the wallet, empty it, or change the accessory token's ownership. To keep the
tap working while dropping spending limits, turn off accessory protections instead.
Those are different actions.

[Back to program overview](../README.md) · [Integration details](policy-reference.md)
