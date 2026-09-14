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
use crate::utils::phygital_token::locked_controlled;
use crate::utils::policy::{
    read_authority_header, reject_durable_nonce, require_canonical_authority,
};
use crate::utils::slot_hash::fetch_slot_hash;
use crate::PROGRAM_WALLET_SEED;

/// `SHA256("phygital_wallet:set_authority:v1" || slot_hash || phygital_token || authority)`.
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
    /// Fee payer for rent; not an authorization authority.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: owner and locked Controlled state constrained below.
    #[account(
        mut,
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// `init` (not `init_if_needed`) enforces "only if no authority exists yet".
    #[account(
        init,
        payer = payer,
        space = Authority::BASE_LEN,
        seeds = [AUTHORITY_SEED, phygital_token.key().as_ref()],
        bump,
    )]
    pub authority_account: Account<'info, Authority>,

    /// CHECK: SlotHashes sysvar
    #[account(address = SLOT_HASHES_SYSVAR_ID)]
    pub slot_hashes: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// CHECK: phygital-token program for verify CPI
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
    require!(
        authority != Pubkey::default(),
        PhygitalError::InvalidAuthority
    );
    // No durable-nonce guard needed: the passkey verify CPI binds this to a
    // recent slot_hash, which already bounds freshness.
    let token_key = ctx.accounts.phygital_token.key();

    let slot_hash = fetch_slot_hash(&ctx.accounts.slot_hashes, slot_number)?;
    let message_hash = build_set_authority_challenge(slot_hash, &token_key, &authority);

    VerifyCpiBuilder::new(&ctx.accounts.phygital_token_program.to_account_info())
        .phygital_token(&ctx.accounts.phygital_token.to_account_info())
        .instructions_sysvar(&ctx.accounts.instructions_sysvar.to_account_info())
        .secp256r1_verify_args(secp256r1_verify_args.into())
        .message_hash(message_hash)
        .invoke()?;

    let wallet_bump =
        Pubkey::find_program_address(&[PROGRAM_WALLET_SEED, token_key.as_ref()], ctx.program_id).1;

    let account = &mut ctx.accounts.authority_account;
    account.header = AuthorityHeader {
        authority,
        phygital_token: token_key,
        payer: ctx.accounts.payer.key(),
        bump: ctx.bumps.authority_account,
        wallet_bump,
        version: AUTHORITY_VERSION,
        // Default to an active empty policy (no caps, baseline programs only): the
        // passkey is confined to the baseline allow-list and control invariants from
        // creation. Spending amounts are unlimited. The authority adds caps via
        // `set_wallet_policy`. Clearing the policy removes its protections.
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
    /// Current owner key. Clearing removes the policy and disables the accessory tap
    /// (a tap requires a present owner); it does not close the wallet holding funds.
    /// The passkey can re-enable the tap by running `set_authority` again.
    pub authority: Signer<'info>,

    /// CHECK: original rent payer; may be any account type.
    #[account(
        mut,
        address = read_authority_header(&authority_account.to_account_info())?.payer @ PhygitalError::AuthorityPayerMismatch,
    )]
    pub rent_receiver: UncheckedAccount<'info>,

    /// Canonical PDA + authority signer are validated in the handler (Anchor
    /// `seeds`/`has_one` can't be expressed in the IDL here — they'd need `?` and
    /// a self-reference to `authority_account`). `close` refunds `rent_receiver`.
    #[account(mut, close = rent_receiver)]
    pub authority_account: Account<'info, Authority>,

    /// CHECK: instructions sysvar
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn clear_authority_handler(ctx: Context<ClearAuthority>) -> Result<()> {
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;
    let info = ctx.accounts.authority_account.to_account_info();
    let header = &ctx.accounts.authority_account.header;
    require_keys_eq!(
        header.authority,
        ctx.accounts.authority.key(),
        PhygitalError::AuthorityMismatch
    );
    require_canonical_authority(&info, header, ctx.program_id)
}
