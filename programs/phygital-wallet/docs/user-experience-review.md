# Does the program match an accessory owner's expectations?

Reviewed against the local v2 program (policy version 8), 2026-09-14.
This is a product-behavior review, not a security audit.

**Update:** three program-level recommendations are now implemented — usage is
preserved for unchanged caps on save (no longer refills on an identical or
permissions-only save), interval refill uses the `>=` boundary, and removing the
owner now disables the accessory tap (the tap requires a present owner). The
remaining rows are app, wording, or larger design changes and are unchanged.
Implemented rows are marked ✅ below.

## Assessment

The central model is understandable: **use the accessory for everyday actions;
use the owner key to manage it or go beyond its permissions**. Default ordinary
payments, explicit application permissions, separate owner access and transaction
rollback are useful foundations.

The program is not yet fully intuitive as a consumer product. Several actions
have wider effects than their likely button labels suggest. Better wording can
explain these effects, but it cannot remove the underlying surprises.

## Where expectations differ

| User expectation | Current behavior | Recommended product or program change |
| --- | --- | --- |
| “My accessory starts protected.” | Protections begin only when `set_authority` succeeds; absent authority means no policy. | Complete owner setup before presenting the wallet as protected; consider enforcing setup before accessory spending. |
| “Limit USDC; leave my other settings alone.” | Any cap activates an asset allowlist. Missing SOL/token caps block their spending. | Present “Assets the accessory can spend” alongside allowances; evaluate explicit blocked/unlimited/capped state per asset. |
| “Changing an app permission won't refill my budget.” | ✅ Implemented: a save now preserves `remaining` and the interval anchor for any cap whose amount and window are unchanged; only a changed or newly-added cap refills. | Preserve usage for unchanged caps; make allowance reset an explicit owner action. This is the highest-priority behavior change. |
| “Daily resets at the time displayed.” | ✅ Implemented: refill uses `elapsed >= window`, and intervals are now aligned to the Unix-epoch grid (`last_reset = now - now % window`) instead of save time — a daily cap resets at 00:00 UTC. Weekly resets on the epoch weekday (Thursday) and “monthly” is a fixed 30 days (not civil months); the app shows the actual next reset date. | Use `>=` at the boundary and test exact-boundary behavior; show the actual next reset time. Do not call it a rolling window. |
| “Moving my own tokens isn't spending.” | Positive losses are summed per source token account, so internal transfers use allowance. | Either explain as a transfer allowance or design a complete per-mint net-balance model with security tests. |
| “The payment amount is the only cost.” | Wallet-funded token-account setup also consumes SOL allowance. | Preview account-creation costs and the funding source; explain missing SOL allowance. |
| “Removing a limit makes that asset unlimited.” | Removing one of several caps blocks that asset; removing the final cap makes all supported assets unlimited. | Show the resulting asset states before save; avoid a generic delete-cap action without context. |
| “Restore defaults restores my old restrictions.” | It clears custom blocks as well as caps and returns to baseline program access. | Label “Restore standard settings” and explicitly show which permissions broaden. |
| “Unlinking or removing the owner disables the accessory.” | ✅ Implemented: the passkey tap now requires a present owner, so `clear_authority` (which closes the owner account) disables the tap; re-enable by setting an owner again with the accessory. `clear_wallet_policy` remains the distinct "keep the owner, drop spending limits" flow. | Keep browser disconnect, transfer of ownership, pause and owner-control removal as distinct flows; design a dedicated pause if needed. |
| “Approve once lets me retry this tap.” | Owner execution is a separate transaction; it bypasses limits without consuming allowance. | Say “Use owner key for this transaction.” Add a real grant flow only if the product needs one. |
| “Allow this merchant means no other recipient can receive funds.” | Rules cover specific direct program instructions. Other baseline routes remain available. | Build complete, reviewed payment presets spanning all relevant routes; don't expose raw program IDs as the main UX. |
| “A blocked transaction costs nothing.” | Wallet state rolls back; network fees may still apply. | Say the payment failed, not that there was no charge of any kind. |

## Recommended language

| Technical term | Owner-facing wording |
| --- | --- |
| Passkey `execute` | Authorize with accessory |
| Authority | Owner key / owner controls |
| Active empty policy | No spending limits · Standard protections |
| Mint cap | Asset allowance, with asset and reset interval shown |
| `Denied` | Blocked |
| `AllInstructions` | All instructions — advanced permission |
| `Restricted` | Specific actions, summarized by operation, asset and recipient |
| `clear_wallet_policy` | Turn off accessory protections |
| `clear_authority` | Remove owner controls |
| `execute_with_authority` | Use owner key for this transaction |

These labels describe actual behavior, not implemented app strings. The existing
app has a different verifier-backed policy model and needs its own migration.

## What the app should show before authorization

Show the action, recipient, asset amount, extra actions and wallet-funded setup
costs. Where available, show remaining allowance and the effective reset time.
For a batch, explain all actions; don't describe a per-instruction amount check as
a per-tap budget. A generic instruction rejection does not identify the exact
failed predicate; a preview can add context but must not claim unavailable on-chain
diagnostics or bypass enforcement.

For settings changes, show which assets become blocked or unlimited, which
application permissions broaden, and that saving currently refills all allowances.
Keep byte offsets, discriminators and account indexes in advanced developer tools.
The program cannot prove that a user's screen accurately described signed bytes.

## Evidence in the implementation

- [Authority setup and removal](../src/instructions/authority.rs)
- [Policy replacement and clearing](../src/instructions/wallet_policy.rs)
- [Interval reset boundary](../src/utils/spending_limit.rs)
- [Balance metering and account controls](../src/utils/policy.rs)
- [Direct-instruction permissions](../src/instruction_policy.rs)
- [Owner bypass](../src/instructions/execute.rs)

[Owner guide](accessory-owner-guide.md) · [Integration reference](policy-reference.md)
