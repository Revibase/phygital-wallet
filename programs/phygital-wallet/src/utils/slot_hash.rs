use anchor_lang::prelude::*;

use crate::error::PhygitalError;

/// Entry stride in the SlotHashes sysvar: `slot` (u64) + `hash` ([u8; 32]).
const ENTRY_LEN: usize = 40;

/// Binary-search `slot_number` in the SlotHashes sysvar (same layout as SPL/token).
///
/// Entries are sorted by slot descending (most recent first). The account is pinned
/// to the real sysvar address by the caller's `#[account(address = ...)]`, so its
/// length and entry count are trusted; one up-front bounds check lets the loop index
/// directly instead of re-validating every probe.
pub(crate) fn fetch_slot_hash(
    slot_hashes_account: &UncheckedAccount,
    slot_number: u64,
) -> Result<[u8; 32]> {
    let data = slot_hashes_account
        .try_borrow_data()
        .map_err(|_| error!(PhygitalError::InvalidSysvarDataFormat))?;

    require!(data.len() >= 8, PhygitalError::InvalidSysvarDataFormat);
    let count = u64::from_le_bytes(data[..8].try_into().unwrap()) as usize;
    // Every entry the count claims must fit; then `8 + mid * ENTRY_LEN` for any
    // `mid < count` is in bounds without further checks.
    require!(
        count > 0 && 8 + count * ENTRY_LEN <= data.len(),
        PhygitalError::InvalidSysvarDataFormat
    );

    let (mut left, mut right) = (0usize, count);
    while left < right {
        let mid = left + (right - left) / 2;
        let pos = 8 + mid * ENTRY_LEN;
        let slot = u64::from_le_bytes(data[pos..pos + 8].try_into().unwrap());
        match slot.cmp(&slot_number) {
            core::cmp::Ordering::Equal => return Ok(data[pos + 8..pos + 40].try_into().unwrap()),
            core::cmp::Ordering::Greater => left = mid + 1,
            core::cmp::Ordering::Less => right = mid,
        }
    }

    err!(PhygitalError::InvalidSlotHash)
}
