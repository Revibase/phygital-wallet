use anchor_lang::prelude::*;

use crate::constants::is_wsol_mint;
use crate::error::PhygitalError;
use crate::state::{Authority, MintCap, SpendCap, WALLET_POLICY_VERSION};
use crate::utils::instruction_policy::{
    validate_permissions, ProgramPermission, MAX_PERMISSION_BYTES,
};
use crate::utils::phygital_token::locked_controlled;
use crate::utils::policy::{
    authorize_authority_signer, read_authority_header, reject_durable_nonce, require_top_level,
};
use crate::utils::spending_limit::{new_spend_cap, preserve_spend_cap};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct SolCapArg {
    pub cap: u64,
    pub window_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct MintCapArg {
    pub mint: Pubkey,
    pub cap: u64,
    pub window_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct WalletPolicyArgs {
    pub sol_cap: Option<SolCapArg>,
    pub mint_caps: Vec<MintCapArg>,
    pub program_permissions: Vec<ProgramPermission>,
}

#[derive(Accounts)]
pub struct SetWalletPolicy<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: original authority rent payer.
    #[account(
        mut,
        address = read_authority_header(&authority_account.to_account_info())?.payer @ PhygitalError::AuthorityPayerMismatch,
        constraint = rent_receiver.key() != authority_account.key() @ PhygitalError::InvalidAccountData,
    )]
    pub rent_receiver: UncheckedAccount<'info>,

    /// CHECK: locked Controlled phygital-token account.
    #[account(
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
        constraint = read_authority_header(&authority_account.to_account_info())?.phygital_token == phygital_token.key(),
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: rewritten in handler.
    #[account(mut)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar.
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn set_wallet_policy_handler(
    ctx: Context<SetWalletPolicy>,
    args: WalletPolicyArgs,
) -> Result<()> {
    require_top_level()?;
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

    validate_permissions(&args.program_permissions)?;
    let mut permission_bytes = Vec::new();
    args.program_permissions.serialize(&mut permission_bytes)?;
    require!(
        permission_bytes.len() <= MAX_PERMISSION_BYTES,
        PhygitalError::InvalidPolicyArgs
    );

    let info = ctx.accounts.authority_account.to_account_info();
    let receiver = ctx.accounts.rent_receiver.to_account_info();

    authorize_authority_signer(&info, &ctx.accounts.authority.key(), ctx.program_id)?;

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
    pub authority: Signer<'info>,

    /// CHECK: original authority rent payer.
    #[account(
        mut,
        address = read_authority_header(&authority_account.to_account_info())?.payer @ PhygitalError::AuthorityPayerMismatch,
        constraint = rent_receiver.key() != authority_account.key() @ PhygitalError::InvalidAccountData,
    )]
    pub rent_receiver: UncheckedAccount<'info>,

    /// CHECK: locked Controlled phygital-token account.
    #[account(
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
        constraint = read_authority_header(&authority_account.to_account_info())?.phygital_token == phygital_token.key(),
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: rewritten in handler.
    #[account(mut)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar.
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn clear_wallet_policy_handler(ctx: Context<ClearWalletPolicy>) -> Result<()> {
    require_top_level()?;
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;
    let info = ctx.accounts.authority_account.to_account_info();
    let receiver = ctx.accounts.rent_receiver.to_account_info();

    let header = authorize_authority_signer(&info, &ctx.accounts.authority.key(), ctx.program_id)?;

    let already_absent = header.policy_version == 0
        && info.data_len() == Authority::BASE_LEN
        && info.try_borrow_data()?[Authority::SOL_CAP_OFFSET..]
            .iter()
            .all(|byte| *byte == 0);
    require!(!already_absent, PhygitalError::InvalidAccountData);

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
