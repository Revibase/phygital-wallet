//! Fixed-interval allowances for accessory execution, anchored at policy save.
//! Not a trailing time window or a calendar-day allowance.
//! Per-use is the aggregate measured decrease charged against a cap in one execute.
use anchor_lang::prelude::*;

use crate::{error::PhygitalError, state::SpendCap};

pub(crate) fn new_spend_cap(cap: u64, window_seconds: i64, now: i64) -> Result<SpendCap> {
    require!(
        cap > 0 && window_seconds >= 0,
        PhygitalError::InvalidPolicyArgs
    );
    Ok(SpendCap {
        cap,
        remaining: cap,
        last_reset: now,
        window_seconds,
    })
}

/// Carry a re-saved cap's usage forward instead of refilling it. When the new cap
/// matches the previous one in both amount and interval, its consumed allowance and
/// interval anchor are kept, so an identical save or a permissions-only edit does
/// NOT refill the allowance or reset the clock. Any change to the cap amount or the
/// window is a deliberate reconfiguration and takes the freshly-anchored `new`.
pub(crate) fn preserve_spend_cap(new: SpendCap, previous: Option<&SpendCap>) -> SpendCap {
    if let Some(prev) = previous {
        if prev.cap == new.cap && prev.window_seconds == new.window_seconds {
            return SpendCap {
                cap: new.cap,
                remaining: prev.remaining,
                last_reset: prev.last_reset,
                window_seconds: new.window_seconds,
            };
        }
    }
    new
}

/// Charge measured loss. Refill at or after the interval boundary
/// (`elapsed >= window_seconds`), so an exact-boundary charge uses the fresh
/// allowance. Zero windows never reset automatically. Reads/zero charges do not
/// refresh state; UI must derive effective allowance from chain time, not only
/// stored remaining.
pub(crate) fn charge_cap(cap: &mut SpendCap, amount: u64, now: i64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    if cap.window_seconds > 0 {
        let elapsed = now
            .checked_sub(cap.last_reset)
            .ok_or_else(|| error!(PhygitalError::InvalidPolicyArgs))?;
        // Advance by whole periods so the original period phase is preserved.
        if elapsed >= cap.window_seconds {
            let periods = elapsed / cap.window_seconds;
            cap.last_reset = cap
                .last_reset
                .checked_add(
                    periods
                        .checked_mul(cap.window_seconds)
                        .ok_or_else(|| error!(PhygitalError::InvalidPolicyArgs))?,
                )
                .ok_or_else(|| error!(PhygitalError::InvalidPolicyArgs))?;
            cap.remaining = cap.cap;
        }
    }

    require!(amount <= cap.remaining, PhygitalError::SpendLimitExceeded);
    cap.remaining = cap
        .remaining
        .checked_sub(amount)
        .ok_or_else(|| error!(PhygitalError::SpendLimitExceeded))?;
    Ok(())
}
