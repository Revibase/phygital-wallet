use anchor_lang::prelude::*;
use phygital_token_client::VerifyCpiBuilder;
use solana_sdk_ids::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;
use solana_sdk_ids::sysvar::slot_hashes::ID as SLOT_HASHES_SYSVAR_ID;

use crate::error::PhygitalError;
use crate::state::{Authority, CompactInstruction, Secp256r1VerifyArgs};
use crate::utils::compact::{
    execute_compact_instructions, hash_compact_instructions, hash_execute_challenge,
    hash_referenced_accounts_infos,
};
use crate::utils::phygital_token::{locked_controlled, wallet_matches_owner};
use crate::utils::policy::{
    authorize_authority_signer, charge_policy_deltas, check_policy_and_snapshot,
    reject_durable_nonce, require_canonical_authority_address, require_top_level,
};
use crate::utils::slot_hash::fetch_slot_hash;

#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: locked Controlled phygital-token account.
    #[account(
        mut,
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: wallet PDA matching token owner.
    #[account(
        mut,
        constraint = wallet_matches_owner(&wallet, &phygital_token) @ PhygitalError::WalletOwnerMismatch,
    )]
    pub wallet: UncheckedAccount<'info>,

    /// CHECK: program-owned authority; absent account disables the tap.
    #[account(mut, owner = crate::ID @ PhygitalError::AccessoryDisabled)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: SlotHashes sysvar.
    #[account(address = SLOT_HASHES_SYSVAR_ID)]
    pub slot_hashes: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// CHECK: phygital-token program.
    #[account(address = phygital_token_client::PHYGITAL_TOKEN_ID, executable)]
    pub phygital_token_program: UncheckedAccount<'info>,
}

pub fn handler<'info>(
    ctx: Context<'info, Execute<'info>>,
    mut compact_instructions: Vec<CompactInstruction>,
    secp256r1_verify_args: Secp256r1VerifyArgs,
    slot_number: u64,
) -> Result<()> {
    require_top_level()?;

    let token_key = ctx.accounts.phygital_token.key();
    let authority_data = ctx.accounts.authority_account.try_borrow_data()?;
    let (header, policy_present) = Authority::read(&authority_data)?;
    let header = *header;
    drop(authority_data);
    require_canonical_authority_address(
        ctx.accounts.authority_account.key,
        &header,
        ctx.program_id,
    )?;
    require_keys_eq!(
        header.phygital_token,
        token_key,
        PhygitalError::AuthorityTokenMismatch
    );
    let wallet_bump = header.wallet_bump;

    let slot_hash = fetch_slot_hash(&ctx.accounts.slot_hashes, slot_number)?;
    let instructions_hash = hash_compact_instructions(&compact_instructions)?;
    let accounts_hash =
        hash_referenced_accounts_infos(ctx.remaining_accounts, &compact_instructions)?;
    let message_hash = hash_execute_challenge(&slot_hash, &instructions_hash, &accounts_hash);

    let phygital_token_program = ctx.accounts.phygital_token_program.to_account_info();
    let phygital_token_ai = ctx.accounts.phygital_token.to_account_info();
    let instructions_sysvar_ai = ctx.accounts.instructions_sysvar.to_account_info();
    VerifyCpiBuilder::new(&phygital_token_program)
        .phygital_token(&phygital_token_ai)
        .instructions_sysvar(&instructions_sysvar_ai)
        .secp256r1_verify_args(secp256r1_verify_args.into())
        .message_hash(message_hash)
        .invoke()?;

    let snapshot = if policy_present {
        Some(check_policy_and_snapshot(
            &ctx.accounts.authority_account,
            &ctx.accounts.wallet,
            ctx.remaining_accounts,
        )?)
    } else {
        None
    };

    let protected: [&Pubkey; 2] = [&token_key, ctx.accounts.authority_account.key];
    execute_compact_instructions(
        ctx.program_id,
        ctx.accounts.wallet.as_ref(),
        wallet_bump,
        &token_key,
        &protected,
        ctx.remaining_accounts,
        &mut compact_instructions,
        snapshot.as_ref().map(|s| s.program_permissions.as_slice()),
    )?;

    if let Some(snapshot) = snapshot {
        let now = Clock::get()?.unix_timestamp;
        charge_policy_deltas(
            &ctx.accounts.authority_account,
            &ctx.accounts.wallet,
            ctx.remaining_accounts,
            &snapshot,
            now,
        )?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteWithAuthority<'info> {
    pub authority: Signer<'info>,

    /// CHECK: locked Controlled phygital-token account.
    #[account(
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: validated in handler; not writable (no policy charges).
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: wallet PDA matching token owner.
    #[account(
        mut,
        constraint = wallet_matches_owner(&wallet, &phygital_token) @ PhygitalError::WalletOwnerMismatch,
    )]
    pub wallet: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn authority_handler<'info>(
    ctx: Context<'info, ExecuteWithAuthority<'info>>,
    mut compact_instructions: Vec<CompactInstruction>,
) -> Result<()> {
    require_top_level()?;
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;

    let token_key = ctx.accounts.phygital_token.key();
    let authority_info = ctx.accounts.authority_account.to_account_info();
    let header = authorize_authority_signer(
        &authority_info,
        &ctx.accounts.authority.key(),
        ctx.program_id,
    )?;
    require_keys_eq!(
        header.phygital_token,
        token_key,
        PhygitalError::AuthorityTokenMismatch
    );
    let wallet_bump = header.wallet_bump;
    let authority_account_key = ctx.accounts.authority_account.key();
    let protected: [&Pubkey; 2] = [&token_key, &authority_account_key];

    execute_compact_instructions(
        ctx.program_id,
        ctx.accounts.wallet.as_ref(),
        wallet_bump,
        &token_key,
        &protected,
        ctx.remaining_accounts,
        &mut compact_instructions,
        // Owner execution bypasses policy; structural guards still apply.
        None,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteWithAuthorityUsingPolicies<'info> {
    pub authority: Signer<'info>,

    /// CHECK: locked Controlled phygital-token account.
    #[account(
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: validated in handler; writable for spend counters.
    #[account(mut)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: wallet PDA matching token owner.
    #[account(
        mut,
        constraint = wallet_matches_owner(&wallet, &phygital_token) @ PhygitalError::WalletOwnerMismatch,
    )]
    pub wallet: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn authority_with_policies_handler<'info>(
    ctx: Context<'info, ExecuteWithAuthorityUsingPolicies<'info>>,
    mut compact_instructions: Vec<CompactInstruction>,
) -> Result<()> {
    require_top_level()?;
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;
    let token_key = ctx.accounts.phygital_token.key();
    let authority_info = ctx.accounts.authority_account.to_account_info();
    let data = authority_info.try_borrow_data()?;
    let (header, policy_present) = Authority::read(&data)?;
    let header = *header;
    drop(data);
    require_canonical_authority_address(authority_info.key, &header, ctx.program_id)?;
    require_keys_eq!(
        header.authority,
        ctx.accounts.authority.key(),
        PhygitalError::AuthorityMismatch
    );
    require_keys_eq!(
        header.phygital_token,
        token_key,
        PhygitalError::AuthorityTokenMismatch
    );

    let snapshot = if policy_present {
        Some(check_policy_and_snapshot(
            &ctx.accounts.authority_account,
            &ctx.accounts.wallet,
            ctx.remaining_accounts,
        )?)
    } else {
        None
    };
    let authority_account_key = ctx.accounts.authority_account.key();
    let protected = [&token_key, &authority_account_key];
    execute_compact_instructions(
        ctx.program_id,
        ctx.accounts.wallet.as_ref(),
        header.wallet_bump,
        &token_key,
        &protected,
        ctx.remaining_accounts,
        &mut compact_instructions,
        snapshot.as_ref().map(|s| s.program_permissions.as_slice()),
    )?;

    if let Some(snapshot) = snapshot {
        charge_policy_deltas(
            &ctx.accounts.authority_account,
            &ctx.accounts.wallet,
            ctx.remaining_accounts,
            &snapshot,
            Clock::get()?.unix_timestamp,
        )?;
    }
    Ok(())
}
