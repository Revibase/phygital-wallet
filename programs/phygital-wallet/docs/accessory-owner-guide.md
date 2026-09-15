# Using your accessory wallet

The accessory authorizes everyday transactions. The **owner key** changes settings
and can make transactions outside accessory limits. The program verifies the signed
request; it cannot verify what a screen showed.

## Setup

`set_authority` enables the tap and starts **No spending limits · Standard
protections**. Before that — or after `clear_authority` — taps fail
(`AccessoryDisabled`). Linking owner controls is not the same as connecting a
browser session.

## Starting settings

- Ordinary SOL and supported token payments have no amount cap through permitted
  operations.
- Other applications need an explicit permission (swaps, lending, many collectibles).
- Supported token-account checks block leaving a standing delegate or changing
  control of a wallet-owned account.

“Standard protections” is not a merchant allow-list or a guarantee every asset is
safe.

## Spending limits choose which assets can be spent

Any configured cap turns missing assets into **blocked** for accessory spending:

| Settings | Accessory can spend |
| --- | --- |
| No caps | SOL / tokens through permitted ops, uncapped |
| USDC capped only | USDC up to allowance; SOL and other tokens blocked |
| SOL + USDC capped | Those two up to allowance; other tokens blocked |

Token payments may need wallet-funded SOL for ATA rent — that needs a SOL
allowance while caps are on. Removing one of several caps **blocks** that asset;
removing the last cap removes all amount limits. Zero allowances are invalid.

## When allowances reset

Positive windows are fixed intervals on the Unix-epoch grid (daily → 00:00 UTC),
not rolling 24h totals and not anchored to save time. Refill happens on the first
positive spend at or after the next boundary. A zero window never auto-resets.

Saving policy **keeps usage** for any cap whose amount and window are unchanged
(including permission-only edits). Changing a cap’s amount/window, or adding a
cap, refills and re-anchors that cap.

## What counts as spending

- Native SOL and wallet-owned WSOL share one budget; wrap/unwrap nets within a tap.
- Token loss is summed per source account (internal transfers can consume allowance).
- Several instructions in one tap share the remaining allowance.
- Later deposits do not restore already-consumed allowance.

## Application permissions

| Mode | Meaning |
| --- | --- |
| Blocked | No direct calls to that program |
| All instructions | Any ix in that program; caps and control checks still apply |
| Specific actions | One complete rule must match (selector, accounts, args) |

Rules cover **direct** CPIs only. Nested calls inside an allowed program are not
inspected. Restricting one route does not block every payment path.

## If a tap is blocked

| Cause | Next step |
| --- | --- |
| Over allowance | Lower amount, wait for reset, or owner execute |
| Asset uncapped while caps exist | Add its allowance (and SOL if ATA rent is wallet-funded) |
| Program / rule mismatch | Adjust permissions; don’t silently broaden |
| Token control change | Review approve/ownership with owner key |
| Stale / unreadable settings | Rebuild request, or clear/recreate policy |

Failed wallet actions roll back; network fees may still apply. There is no
on-chain “approve this tap” inbox — owner execute is a separate transaction.

## Owner recovery

| Change | Result |
| --- | --- |
| Remove spending limits | Unlimited amounts; keep program rules |
| Restore standard settings | Baseline programs; no caps or custom blocks |
| Turn off protections | Drop policy; owner remains; tap stays on |
| Remove owner controls | Disable tap until a new owner is set |

[Program overview](../README.md) · [Integration details](policy-reference.md)
