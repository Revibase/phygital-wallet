use anchor_lang::prelude::*;

use crate::constants::is_wsol_mint;
use crate::error::PhygitalError;
use crate::state::{Authority, MintCap, SpendCap, WALLET_POLICY_VERSION};
use crate::utils::policy::{
    authorize_authority_signer, read_authority_header, reject_durable_nonce,
};
use crate::utils::spending_limit::{new_spend_cap, preserve_spend_cap};

/// Fixed-interval allowance for SOL and wallet-owned WSOL, in lamports.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct SolCapArg {
    /// Allowance in raw asset units; must be nonzero. Saving refills it only when
    /// the amount or window changes; an unchanged cap keeps its remaining usage.
    pub cap: u64,
    /// 0 => no automatic reset; > 0 => interval in seconds anchored at save time.
    pub window_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct MintCapArg {
    pub mint: Pubkey,
    /// Allowance in raw asset units; must be nonzero. Saving refills it only when
    /// the amount or window changes; an unchanged cap keeps its remaining usage.
    pub cap: u64,
    /// 0 => no automatic reset; > 0 => interval in seconds anchored at save time.
    pub window_seconds: i64,
}

/// Present policy with standard protections and optional spending limits.
/// `Default` restores baseline programs and control invariants with no spending
/// limits and no custom restrictions. It never removes the policy;
/// `clear_wallet_policy` explicitly turns off its protections.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct WalletPolicyArgs {
    /// SOL/WSOL cap on net loss across execute; incoming offsets outgoing. Meters
    /// native lamports AND wallet-owned wrapped SOL (both native mints) as one
    /// budget. Absent => SOL cannot decrease when any spending limit exists.
    pub sol_cap: Option<SolCapArg>,
    /// Each mint may appear once; the WSOL mints are rejected here (they belong to
    /// `sol_cap`). Unlisted mints cannot decrease when any cap exists. No SOL or
    /// mint limits means no amount limits; program/control checks still apply.
    /// Token spending sums each source account decrease, including transfers
    /// between wallet-owned accounts.
    pub mint_caps: Vec<MintCapArg>,
    /// Per-program overrides. Omitted programs fall back to baseline permissions.
    /// Preserve this list when removing only caps; empty removes custom blocks too.
    pub program_permissions: Vec<crate::ProgramPermission>,
}

#[derive(Accounts)]
pub struct SetWalletPolicy<'info> {
    /// The token's authority (ed25519) — the sole authorization for policy admin.
    pub authority: Signer<'info>,

    /// Pays any additional rent when growing the policy.
    pub payer: Signer<'info>,

    /// CHECK: must match the original authority payer; receives rent on shrink.
    #[account(
        mut,
        address = read_authority_header(&authority_account.to_account_info())?.payer @ PhygitalError::AuthorityPayerMismatch,
        constraint = rent_receiver.key() != authority_account.key() @ PhygitalError::InvalidAccountData,
    )]
    pub rent_receiver: UncheckedAccount<'info>,

    /// CHECK: raw account written by hand (resize + bytemuck). Owner, header
    /// version, authority signer and canonical PDA are validated in the handler;
    /// Anchor `seeds`/`has_one` are not used here because their `?`/self-reference
    /// form is not expressible in the IDL.
    #[account(mut)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn set_wallet_policy_handler(
    ctx: Context<SetWalletPolicy>,
    args: WalletPolicyArgs,
) -> Result<()> {
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;

    for (i, cap) in args.mint_caps.iter().enumerate() {
        // WSOL is governed by `sol_cap`, not as a standalone mint cap.
        require!(
            cap.mint != Pubkey::default() && !is_wsol_mint(&cap.mint),
            PhygitalError::InvalidPolicyArgs
        );
        require!(
            !args.mint_caps[..i]
                .iter()
                .any(|other| other.mint == cap.mint),
            PhygitalError::InvalidPolicyArgs
        );
    }

    crate::instruction_policy::validate_permissions(&args.program_permissions)?;
    let mut permission_bytes = Vec::new();
    args.program_permissions.serialize(&mut permission_bytes)?;
    require!(
        permission_bytes.len() <= crate::MAX_PERMISSION_BYTES,
        PhygitalError::InvalidPolicyArgs
    );

    let info = ctx.accounts.authority_account.to_account_info();
    let receiver = ctx.accounts.rent_receiver.to_account_info();
    // Validate the account is our canonical authority PDA and the signer owns it.
    authorize_authority_signer(&info, &ctx.accounts.authority.key(), ctx.program_id)?;
    // Reject unsupported tails (and any version mismatch); the authority can
    // explicitly clear them first. Capture the existing allowances (if a policy is
    // active) so a cap left unchanged keeps its usage across this save.
    let (old_sol, old_mints) = {
        let data = info.try_borrow_data()?;
        let (_, policy_present) = Authority::read(&data)?;
        if policy_present {
            let (sol, mints, _) = Authority::read_policy(&data)?;
            (Some(*sol), mints.to_vec())
        } else {
            (None, Vec::new())
        }
    };
    let now = Clock::get()?.unix_timestamp;

    // Full policy replacement, but usage is preserved for any cap whose amount and
    // window are unchanged: an identical save or a permissions-only edit no longer
    // refills allowances or reanchors intervals. A changed or newly-added cap is
    // freshly anchored at `now`. Build the replacement before changing allocation or
    // balances. A zeroed `sol_cap` (cap == 0) means "no SOL cap"; `SpendCap::is_active`
    // derives that.
    let mut sol_cap = SpendCap::default();
    if let Some(s) = args.sol_cap.as_ref() {
        let fresh = new_spend_cap(s.cap, s.window_seconds, now)?;
        sol_cap = preserve_spend_cap(fresh, old_sol.filter(SpendCap::is_active).as_ref());
    }
    let mint_caps = args
        .mint_caps
        .iter()
        .map(|c| {
            let fresh = new_spend_cap(c.cap, c.window_seconds, now)?;
            let previous = old_mints.iter().find(|m| m.mint == c.mint).map(|m| &m.cap);
            Ok(MintCap {
                mint: c.mint,
                cap: preserve_spend_cap(fresh, previous),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let new_len = Authority::with_mint_count(mint_caps.len())?
        .checked_add(permission_bytes.len() - 4)
        .ok_or_else(|| error!(PhygitalError::InvalidPolicyArgs))?;
    let old_len = info.data_len();
    let minimum = Rent::get()?.minimum_balance(new_len);
    let top_up = minimum.saturating_sub(info.lamports());
    if top_up > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: info.clone(),
                },
            ),
            top_up,
        )?;
    }
    if new_len != old_len {
        info.resize(new_len)?;
    }
    if new_len < old_len {
        let refund = info
            .lamports()
            .checked_sub(minimum)
            .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
        let balance = receiver
            .lamports()
            .checked_add(refund)
            .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
        **info.try_borrow_mut_lamports()? = minimum;
        **receiver.try_borrow_mut_lamports()? = balance;
    }
    let mut data = info.try_borrow_mut_data()?;
    Authority::read_header_mut(&mut data)?.policy_version = WALLET_POLICY_VERSION;
    Authority::write_policy(&mut data, &sol_cap, &mint_caps, &permission_bytes);
    Ok(())
}

#[derive(Accounts)]
pub struct ClearWalletPolicy<'info> {
    /// The token's authority (ed25519).
    pub authority: Signer<'info>,

    /// CHECK: checked against the authority's original payer in the handler.
    #[account(
        mut,
        address = read_authority_header(&authority_account.to_account_info())?.payer @ PhygitalError::AuthorityPayerMismatch,
        constraint = rent_receiver.key() != authority_account.key() @ PhygitalError::InvalidAccountData,
    )]
    pub rent_receiver: UncheckedAccount<'info>,

    /// CHECK: raw account reset by hand. Owner, header version, authority signer
    /// and canonical PDA are validated in the handler (see `SetWalletPolicy`).
    #[account(mut)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn clear_wallet_policy_handler(ctx: Context<ClearWalletPolicy>) -> Result<()> {
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;
    let info = ctx.accounts.authority_account.to_account_info();
    let receiver = ctx.accounts.rent_receiver.to_account_info();
    // Validate ownership/PDA from the header only — clearing stays available for
    // unknown policy versions and malformed tails, so we never decode the tail.
    let header = authorize_authority_signer(&info, &ctx.accounts.authority.key(), ctx.program_id)?;
    // Reject only a genuinely absent policy. Inconsistent no-policy metadata
    // must remain repairable by the authority, even at the base account size.
    let already_absent = header.policy_version == 0
        && info.data_len() == Authority::BASE_LEN
        && info.try_borrow_data()?[Authority::SOL_CAP_OFFSET..]
            .iter()
            .all(|byte| *byte == 0);
    require!(!already_absent, PhygitalError::InvalidAccountData);

    // Remove the policy (unrestricted passkey access), not an active empty policy.
    // Refund the freed rent to the payer.
    let minimum = Rent::get()?.minimum_balance(Authority::BASE_LEN);
    let refund = info
        .lamports()
        .checked_sub(minimum)
        .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
    let receiver_balance = receiver
        .lamports()
        .checked_add(refund)
        .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
    info.resize(Authority::BASE_LEN)?;
    {
        let mut data = info.try_borrow_mut_data()?;
        Authority::read_header_mut(&mut data)?.policy_version = 0;
        // Zero the SOL cap and both (now empty) Vec length prefixes.
        Authority::write_policy(&mut data, &SpendCap::default(), &[], &[0; 4]);
    }
    **info.try_borrow_mut_lamports()? = minimum;
    **receiver.try_borrow_mut_lamports()? = receiver_balance;
    Ok(())
}
