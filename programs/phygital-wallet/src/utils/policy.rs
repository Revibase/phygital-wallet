use anchor_lang::prelude::*;
use solana_instructions_sysvar::load_instruction_at_checked;
use solana_sdk_ids::system_program::ID as SYSTEM_PROGRAM_ID;

use crate::constants::{is_wsol_mint, AUTHORITY_SEED, SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID};
use crate::error::PhygitalError;
use crate::state::AuthorityHeader;
use crate::Authority;

use crate::utils::spending_limit::charge_cap;

// System `AdvanceNonceAccount` discriminant (u32 LE), used by `reject_durable_nonce`.
const SYS_ADVANCE_NONCE: u32 = 4;

// SPL token-account layout (classic + Token-2022 base share the first 129 bytes).
const TOKEN_ACCOUNT_LEN: usize = 165;
const TA_MINT: core::ops::Range<usize> = 0..32;
const TA_OWNER: core::ops::Range<usize> = 32..64;
const TA_AMOUNT: core::ops::Range<usize> = 64..72;
const TA_DELEGATE_TAG: core::ops::Range<usize> = 72..76;
const TA_DELEGATE_KEY: core::ops::Range<usize> = 76..108;
const TA_DELEGATED_AMOUNT: core::ops::Range<usize> = 121..129;
/// Token-2022 `AccountType` byte at offset 165: `2` = token account, `1` = mint.
const T22_ACCOUNT_TYPE_ACCOUNT: u8 = 2;

/// An account owned by either token program (classic SPL or Token-2022).
fn is_token_program(owner: &Pubkey) -> bool {
    *owner == SPL_TOKEN_PROGRAM_ID || *owner == TOKEN_2022_PROGRAM_ID
}

/// Reject durable-nonce transactions. A tx is durable-nonced only when its first
/// instruction is System `AdvanceNonceAccount`, so inspecting index 0 of the
/// instructions sysvar is sufficient and CU-cheap.
pub(crate) fn reject_durable_nonce(instructions_sysvar: &AccountInfo) -> Result<()> {
    let ix0 = load_instruction_at_checked(0, instructions_sysvar)
        .map_err(|_| error!(PhygitalError::InvalidSysvarDataFormat))?;
    if ix0.program_id == SYSTEM_PROGRAM_ID
        && ix0.data.len() >= 4
        && u32::from_le_bytes([ix0.data[0], ix0.data[1], ix0.data[2], ix0.data[3]])
            == SYS_ADVANCE_NONCE
    {
        return err!(PhygitalError::DurableNonceNotAllowed);
    }
    Ok(())
}

/// Decoded fields of an SPL token account.
struct TokenAccountView {
    mint: Pubkey,
    owner: Pubkey,
    amount: u64,
    delegate: Option<Pubkey>,
    delegated_amount: u64,
    close_authority: Option<Pubkey>,
}

/// Decode a token account, or `None` if the account is not a token account (e.g. a
/// mint, which shares the token program).
fn token_account_view(data: &[u8]) -> Option<TokenAccountView> {
    if data.len() < TOKEN_ACCOUNT_LEN {
        return None;
    }
    // Token-2022 tags extended accounts with an `AccountType` byte at offset 165;
    // reject anything that is not a token account (a padded mint, for instance).
    if data.len() > TOKEN_ACCOUNT_LEN && data[TOKEN_ACCOUNT_LEN] != T22_ACCOUNT_TYPE_ACCOUNT {
        return None;
    }
    if !matches!(data[108], 1 | 2) {
        return None;
    }
    let close_authority = if data[129..133] == [1, 0, 0, 0] {
        Some(Pubkey::try_from(&data[133..165]).ok()?)
    } else {
        None
    };
    let delegate = if data[TA_DELEGATE_TAG] == [1, 0, 0, 0] {
        Some(Pubkey::try_from(&data[TA_DELEGATE_KEY]).ok()?)
    } else {
        None
    };
    Some(TokenAccountView {
        mint: Pubkey::try_from(&data[TA_MINT]).ok()?,
        owner: Pubkey::try_from(&data[TA_OWNER]).ok()?,
        amount: u64::from_le_bytes(data[TA_AMOUNT].try_into().ok()?),
        delegate,
        delegated_amount: u64::from_le_bytes(data[TA_DELEGATED_AMOUNT].try_into().ok()?),
        close_authority,
    })
}

/// A single tracked token account and its pre-CPI balance.
///
/// `cap_slot` is `Some` for a capped mint the wallet can spend (metered by delta);
/// `wallet_owned` marks an account the wallet owns (checked post-CPI for control
/// changes); `is_sol` marks a wallet-owned wrapped-SOL account whose balance folds
/// into the SOL cap (metered via the combined lamports+WSOL total, not per-mint). An
/// account is tracked when any applies.
#[derive(Clone, Copy, Default)]
struct TrackedAccount {
    remaining_index: usize,
    cap_slot: Option<usize>,
    amount_before: u64,
    wallet_owned: bool,
    is_sol: bool,
    mint: Pubkey,
    close_authority: Option<Pubkey>,
}

/// Pre-CPI measurement carried across the inner CPIs to the post-CPI charge. Holds
/// no account borrow; the transaction-sized tracked-account list lives on the heap to avoid
/// exceeding the SBF stack frame limit.
pub(crate) struct PolicySnapshot {
    sol_before: u64,
    charge_sol: bool,
    spending_limits_active: bool,
    tracked: Vec<TrackedAccount>,
    /// Explicit per-program overrides, including restrictions on baseline programs.
    /// Captured pre-CPI so the execute loop needs no further policy-account borrow.
    pub(crate) program_permissions: Vec<crate::ProgramPermission>,
}

/// Reads the fixed header (via bytemuck) without decoding the policy tail, so
/// recovery can clear a policy whose version is no longer supported. Used both in
/// `rent_receiver` `address` attribute expressions and in the admin/authority
/// handlers that validate the account by hand. Returns an owned copy because the
/// borrow of account data cannot outlive the `AccountInfo` in attribute contexts.
pub(crate) fn read_authority_header(info: &AccountInfo) -> Result<AuthorityHeader> {
    require_keys_eq!(*info.owner, crate::ID, PhygitalError::InvalidAccountData);
    Ok(*Authority::read_header(&info.try_borrow_data()?)?)
}

/// Validate that `info` is the canonical authority PDA for the token bound in its
/// header. Used by the admin/authority paths in place of Anchor `seeds` (whose
/// self-referential, `?`-using expressions cannot be expressed in the IDL).
pub(crate) fn require_canonical_authority(
    info: &AccountInfo,
    header: &AuthorityHeader,
    program_id: &Pubkey,
) -> Result<()> {
    let canonical = Pubkey::create_program_address(
        &[
            AUTHORITY_SEED,
            header.phygital_token.as_ref(),
            &[header.bump],
        ],
        program_id,
    )
    .map_err(|_| error!(PhygitalError::AuthorityTokenMismatch))?;
    require_keys_eq!(*info.key, canonical, PhygitalError::AuthorityTokenMismatch);
    Ok(())
}

/// Validate that `info` is the canonical authority PDA and that `signer` is its
/// configured authority. Returns the decoded header for any further field checks.
/// Shared by the admin/authority handlers that authorize an ed25519 owner signer.
pub(crate) fn authorize_authority_signer(
    info: &AccountInfo,
    signer: &Pubkey,
    program_id: &Pubkey,
) -> Result<AuthorityHeader> {
    let header = read_authority_header(info)?;
    require_keys_eq!(header.authority, *signer, PhygitalError::AuthorityMismatch);
    require_canonical_authority(info, &header, program_id)?;
    Ok(header)
}

/// Resolve the canonical authority account and whether a spending policy is active.
///
/// The accessory tap REQUIRES a present owner: an absent authority account (never
/// set up, or removed by `clear_authority`, which closes it) disables the tap. This
/// is what makes "removing the owner disables the accessory" true — the owner is the
/// escape hatch that (re)enables and constrains the tap. An owner may still turn
/// spending protections off with `clear_wallet_policy` (policy absent, owner present)
/// while keeping the tap enabled. Unknown layouts fail closed.
///
/// Program-ownership (an absent/closed PDA is system-owned) is enforced upstream by
/// the caller's `#[account(owner = crate::ID @ AccessoryDisabled)]` constraint, so
/// this only decodes the header and validates the token binding + canonical PDA.
pub(crate) fn resolve_authority(
    info: &AccountInfo,
    token_key: &Pubkey,
    program_id: &Pubkey,
) -> Result<(u8, bool)> {
    let data = info.try_borrow_data()?;
    let (header, policy_present) = Authority::read(&data)?;
    // Validate both the stored token binding and the canonical PDA address.
    require_keys_eq!(
        header.phygital_token,
        *token_key,
        PhygitalError::AuthorityTokenMismatch
    );
    require_canonical_authority(info, header, program_id)?;
    Ok((header.wallet_bump, policy_present))
}

/// Pre-CPI balance snapshot.
///
/// Runs BEFORE `execute_compact_instructions`: records the wallet's lamport
/// balance, the balance of every wallet-owned / wallet-delegated token account of a
/// capped mint, and every wallet-owned token account (for the post-CPI
/// standing-delegate check). `charge_policy_deltas` later charges the actual spend
/// (before − after) against the caps and enforces the control invariants. Amounts
/// for this meter are not read from instruction data. Losses of tracked assets
/// caused by nested CPIs are included; arbitrary application assets are not covered.
pub(crate) fn check_policy_and_snapshot<'info>(
    policy_info: &AccountInfo<'info>,
    wallet: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<PolicySnapshot> {
    let data = policy_info.try_borrow_data()?;
    let (sol_cap, mint_caps, program_permissions) = Authority::read_policy(&data)?;
    let mint_n = mint_caps.len();
    let charge_sol = sol_cap.is_active();
    let spending_limits_active = charge_sol || mint_n > 0;

    // Snapshot balances that the caps meter. `sol_before` folds native lamports and
    // wallet-owned wrapped SOL into one SOL total (see `is_sol` tracking below).
    let mut snapshot = PolicySnapshot {
        sol_before: wallet.lamports(),
        charge_sol,
        spending_limits_active,
        tracked: Vec::with_capacity(remaining_accounts.len()),
        program_permissions,
    };

    for (idx, acc) in remaining_accounts.iter().enumerate() {
        if remaining_accounts[..idx]
            .iter()
            .any(|other| other.key == acc.key)
        {
            continue;
        }
        if !is_token_program(acc.owner) {
            continue;
        }
        let acc_data = acc.try_borrow_data()?;
        let Some(view) = token_account_view(&acc_data) else {
            continue;
        };
        let wallet_owned = view.owner == *wallet.key;
        // Spendable: the wallet owns it, or is its approved delegate.
        let spendable = wallet_owned || view.delegate == Some(*wallet.key);
        // Wallet-owned wrapped SOL folds into the SOL cap (metered by the combined
        // lamports+WSOL total), not as a per-mint delta.
        let is_sol = charge_sol && wallet_owned && is_wsol_mint(&view.mint);
        if is_sol {
            snapshot.sol_before = snapshot.sol_before.saturating_add(view.amount);
        }
        // Capped mint the wallet can spend ⇒ metered by delta. (WSOL is barred from
        // `mint_caps` at config, so it never matches here.)
        let cap_slot = if mint_n > 0 && spendable {
            mint_caps.iter().position(|c| c.mint == view.mint)
        } else {
            None
        };
        // Track for the control invariants (wallet-owned), the SOL fold (is_sol),
        // and/or the per-mint delta (capped).
        if !wallet_owned && !(spending_limits_active && spendable) {
            continue;
        }
        snapshot.tracked.push(TrackedAccount {
            remaining_index: idx,
            cap_slot,
            amount_before: view.amount,
            wallet_owned,
            is_sol,
            mint: view.mint,
            close_authority: view.close_authority,
        });
    }

    Ok(snapshot)
}

/// Post-CPI charge + invariant check: compute actual spend (before − after) and
/// decrement the caps, and reject if any wallet-owned token account was left with a
/// standing delegate (an approval that would authorise a *later*, unmetered drain).
/// A violation rolls back wallet actions (network fees may still apply). This is
/// the execution-time counter writer; settings replacement separately refills caps.
/// No policy-account borrow is held across inner CPIs.
pub(crate) fn charge_policy_deltas<'info>(
    policy_info: &AccountInfo<'info>,
    wallet: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    snapshot: &PolicySnapshot,
    now: i64,
) -> Result<()> {
    // Allocate by accounts touched, not the potentially much larger policy list.
    let mut mint_spent: Vec<(usize, u64)> = Vec::with_capacity(snapshot.tracked.len());
    for tracked in &snapshot.tracked {
        let acc = &remaining_accounts[tracked.remaining_index];
        let acc_data = acc.try_borrow_data()?;
        let view = token_account_view(&acc_data);

        // Closing a tracked account is allowed: SPL requires a zero balance to
        // close (so any tokens already left and were charged), and closing a WSOL
        // account is metered by the SOL delta below. Only ~rent dust can leave
        // unmetered. A *surviving* wallet-owned account must still retain control and
        // identity, even when its amount is unchanged.
        if tracked.wallet_owned {
            if let Some(v) = &view {
                require!(
                    is_token_program(acc.owner)
                        && v.owner == *wallet.key
                        && v.mint == tracked.mint
                        && v.close_authority == tracked.close_authority,
                    PhygitalError::TokenAuthorityChanged
                );
            } else {
                require!(acc.data_is_empty(), PhygitalError::TokenAuthorityChanged);
            }
        }

        let amount_after = view.as_ref().map(|v| v.amount).unwrap_or(0);
        let spent = tracked.amount_before.saturating_sub(amount_after);
        if let Some(cap_slot) = tracked.cap_slot {
            if spent > 0 {
                if let Some((_, total)) = mint_spent.iter_mut().find(|(slot, _)| *slot == cap_slot)
                {
                    *total = total
                        .checked_add(spent)
                        .ok_or_else(|| error!(PhygitalError::SpendLimitExceeded))?;
                } else {
                    mint_spent.push((cap_slot, spent));
                }
            }
        } else if snapshot.spending_limits_active && !tracked.is_sol {
            // is_sol accounts fold into the SOL total instead of the per-mint rule.
            require!(spent == 0, PhygitalError::MintNotAllowed);
        }
    }

    // Final SOL total = native lamports + wallet-owned wrapped SOL (deduped, so a
    // repeated account can't be counted twice). Also scan for control changes: an
    // account initialized during CPI was absent from the snapshot but can still
    // grant future spending.
    let mut sol_after = wallet.lamports();
    for (i, acc) in remaining_accounts.iter().enumerate() {
        if !is_token_program(acc.owner) {
            continue;
        }
        let dup = remaining_accounts[..i].iter().any(|o| o.key == acc.key);
        let data = acc.try_borrow_data()?;
        if let Some(view) = token_account_view(&data) {
            if view.owner == *wallet.key {
                if snapshot.charge_sol && !dup && is_wsol_mint(&view.mint) {
                    sol_after = sol_after.saturating_add(view.amount);
                }
                require!(
                    view.delegated_amount == 0,
                    PhygitalError::DelegationNotAllowed
                );
                let existed = snapshot.tracked.iter().any(|t| {
                    t.wallet_owned && remaining_accounts[t.remaining_index].key == acc.key
                });
                if !existed {
                    require!(
                        view.close_authority.is_none() || view.close_authority == Some(*wallet.key),
                        PhygitalError::TokenAuthorityChanged
                    );
                }
            }
        }
    }
    let sol_spent = snapshot.sol_before.saturating_sub(sol_after);

    let mut data = policy_info.try_borrow_mut_data()?;
    let (sol_cap, mint_caps) = Authority::read_policy_mut(&mut data)?;

    if sol_spent > 0 && snapshot.spending_limits_active {
        require!(snapshot.charge_sol, PhygitalError::MintNotAllowed);
        charge_cap(sol_cap, sol_spent, now)?;
    }
    for (slot, spent) in mint_spent {
        let mint = mint_caps
            .get_mut(slot)
            .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
        charge_cap(&mut mint.cap, spent, now)?;
    }

    Ok(())
}
