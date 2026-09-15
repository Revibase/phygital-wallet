use anchor_lang::prelude::*;
use phygital_token_client::VerifyCpiBuilder;
use solana_sdk_ids::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;
use solana_sdk_ids::sysvar::slot_hashes::ID as SLOT_HASHES_SYSVAR_ID;
use solana_sha256_hasher::hashv;

use crate::constants::{AUTHORITY_SEED, SET_AUTHORITY_CHALLENGE_PREFIX};
use crate::error::PhygitalError;
use crate::state::{
    Authority, AuthorityHeader, Secp256r1VerifyArgs, SpendCap, AUTHORITY_VERSION,
    WALLET_POLICY_VERSION,
};
use crate::utils::phygital_token::{locked_controlled, wallet_matches_owner};
use crate::utils::policy::{
    authorize_authority_signer, read_authority_header, reject_durable_nonce, require_top_level,
};
use crate::utils::slot_hash::fetch_slot_hash;
use crate::PROGRAM_WALLET_SEED;

pub fn build_set_authority_challenge(
    slot_hash: [u8; 32],
    phygital_token: &Pubkey,
    authority: &Pubkey,
) -> [u8; 32] {
    hashv(&[
        SET_AUTHORITY_CHALLENGE_PREFIX,
        &slot_hash,
        phygital_token.as_ref(),
        authority.as_ref(),
    ])
    .to_bytes()
}

#[derive(Accounts)]
pub struct SetAuthority<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: locked Controlled phygital-token account.
    #[account(
        mut,
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: canonical wallet PDA for this token.
    #[account(
        seeds = [PROGRAM_WALLET_SEED, phygital_token.key().as_ref()],
        bump,
        constraint = wallet_matches_owner(&wallet, &phygital_token) @ PhygitalError::WalletOwnerMismatch,
    )]
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = Authority::BASE_LEN,
        seeds = [AUTHORITY_SEED, phygital_token.key().as_ref()],
        bump,
    )]
    pub authority_account: Account<'info, Authority>,

    /// CHECK: SlotHashes sysvar.
    #[account(address = SLOT_HASHES_SYSVAR_ID)]
    pub slot_hashes: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// CHECK: phygital-token program.
    #[account(address = phygital_token_client::PHYGITAL_TOKEN_ID, executable)]
    pub phygital_token_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn set_authority_handler(
    ctx: Context<SetAuthority>,
    authority: Pubkey,
    secp256r1_verify_args: Secp256r1VerifyArgs,
    slot_number: u64,
) -> Result<()> {
    require_top_level()?;
    require!(
        authority != Pubkey::default(),
        PhygitalError::InvalidAuthority
    );

    let token_key = ctx.accounts.phygital_token.key();

    let slot_hash = fetch_slot_hash(&ctx.accounts.slot_hashes, slot_number)?;
    let message_hash = build_set_authority_challenge(slot_hash, &token_key, &authority);

    VerifyCpiBuilder::new(&ctx.accounts.phygital_token_program.to_account_info())
        .phygital_token(&ctx.accounts.phygital_token.to_account_info())
        .instructions_sysvar(&ctx.accounts.instructions_sysvar.to_account_info())
        .secp256r1_verify_args(secp256r1_verify_args.into())
        .message_hash(message_hash)
        .invoke()?;

    let account = &mut ctx.accounts.authority_account;
    account.header = AuthorityHeader {
        authority,
        phygital_token: token_key,
        payer: ctx.accounts.payer.key(),
        bump: ctx.bumps.authority_account,
        wallet_bump: ctx.bumps.wallet,
        version: AUTHORITY_VERSION,
        policy_version: WALLET_POLICY_VERSION,
        _padding: [0; 4],
    };
    account.sol_cap = SpendCap::default();
    account.policy_padding = 0;
    account.program_permissions = Vec::new();
    account.mint_caps = Vec::new();

    Ok(())
}

#[derive(Accounts)]
pub struct ClearAuthority<'info> {
    pub authority: Signer<'info>,

    /// CHECK: locked Controlled phygital-token account.
    #[account(
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
        constraint = read_authority_header(&authority_account.to_account_info())?.phygital_token == phygital_token.key(),
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: original authority rent payer.
    #[account(
        mut,
        address = read_authority_header(&authority_account.to_account_info())?.payer @ PhygitalError::AuthorityPayerMismatch,
        constraint = rent_receiver.key() != authority_account.key() @ PhygitalError::InvalidAccountData,
    )]
    pub rent_receiver: UncheckedAccount<'info>,

    /// CHECK: closed from header in handler.
    #[account(mut)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn clear_authority_handler(ctx: Context<ClearAuthority>) -> Result<()> {
    require_top_level()?;
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;
    let info = ctx.accounts.authority_account.to_account_info();
    let receiver = ctx.accounts.rent_receiver.to_account_info();

    authorize_authority_signer(&info, &ctx.accounts.authority.key(), ctx.program_id)?;

    let lamports = info.lamports();
    let receiver_balance = receiver
        .lamports()
        .checked_add(lamports)
        .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
    **info.try_borrow_mut_lamports()? = 0;
    **receiver.try_borrow_mut_lamports()? = receiver_balance;
    info.assign(&anchor_lang::system_program::ID);
    info.resize(0)?;
    Ok(())
}
