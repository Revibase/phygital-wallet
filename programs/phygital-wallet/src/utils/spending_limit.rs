use anchor_lang::prelude::*;

use crate::{error::PhygitalError, state::SpendCap};

pub(crate) fn align_to_window(now: i64, window_seconds: i64) -> Result<i64> {
    if window_seconds <= 0 {
        return Ok(now);
    }
    let offset = now
        .checked_rem(window_seconds)
        .ok_or_else(|| error!(PhygitalError::InvalidPolicyArgs))?;
    now.checked_sub(offset)
        .ok_or_else(|| error!(PhygitalError::InvalidPolicyArgs))
}

pub(crate) fn new_spend_cap(cap: u64, window_seconds: i64, now: i64) -> Result<SpendCap> {
    require!(
        cap > 0 && window_seconds >= 0,
        PhygitalError::InvalidPolicyArgs
    );
    Ok(SpendCap {
        cap,
        remaining: cap,
        last_reset: align_to_window(now, window_seconds)?,
        window_seconds,
    })
}

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
