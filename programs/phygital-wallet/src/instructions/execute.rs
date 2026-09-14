use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT};
use phygital_token_client::VerifyCpiBuilder;
use solana_sdk_ids::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;
use solana_sdk_ids::sysvar::slot_hashes::ID as SLOT_HASHES_SYSVAR_ID;

use crate::error::PhygitalError;
use crate::state::{CompactInstruction, Secp256r1VerifyArgs};
use crate::utils::compact::{
    execute_compact_instructions, hash_compact_instructions, hash_execute_challenge,
    hash_referenced_accounts_infos,
};
use crate::utils::phygital_token::{locked_controlled, wallet_matches_owner};
use crate::utils::policy::{
    authorize_authority_signer, charge_policy_deltas, check_policy_and_snapshot,
    reject_durable_nonce, resolve_authority,
};
use crate::utils::slot_hash::fetch_slot_hash;

fn build_execute_challenge<'info>(
    slot_hash: [u8; 32],
    compact_instructions: &[CompactInstruction],
    remaining: &[AccountInfo<'info>],
) -> Result<[u8; 32]> {
    let instructions_hash = hash_compact_instructions(compact_instructions)?;
    let accounts_hash = hash_referenced_accounts_infos(remaining, compact_instructions)?;
    Ok(hash_execute_challenge(
        &slot_hash,
        &instructions_hash,
        &accounts_hash,
    ))
}

/// Accessory authorization: signed request plus current policy checks. Requires a
/// present owner (authority): with none set — or after `clear_authority` removes it
/// — the tap is disabled (`AccessoryDisabled`). With an owner but no spending
/// policy (`clear_wallet_policy`), execution has only structural guards.
#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: owned by phygital-token; fields read by offset (no Borsh round-trip).
    #[account(
        mut,
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: wallet PDA that signs inner CPIs; validated by `wallet_matches_owner`
    /// (`wallet.key == phygital_token.owner`, the canonical wallet PDA).
    #[account(
        constraint = wallet_matches_owner(&wallet, &phygital_token) @ PhygitalError::WalletOwnerMismatch,
    )]
    pub wallet: UncheckedAccount<'info>,

    /// CHECK: the owner account. `owner = crate::ID` enforces that it is present and
    /// program-owned (an absent/closed PDA is system-owned) — this is what disables
    /// the tap once the owner is removed. Token binding, canonical PDA and policy tail
    /// are validated in the handler (they need the header, so they cannot be Anchor
    /// constraints). Writable for spend counters.
    #[account(mut, owner = crate::ID @ PhygitalError::AccessoryDisabled)]
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: validated as the SlotHashes sysvar address
    #[account(address = SLOT_HASHES_SYSVAR_ID)]
    pub slot_hashes: UncheckedAccount<'info>,

    /// CHECK: validated as the instructions sysvar address
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// CHECK: phygital-token program for verify CPI
    #[account(address = phygital_token_client::PHYGITAL_TOKEN_ID, executable)]
    pub phygital_token_program: UncheckedAccount<'info>,
}

pub fn handler<'info>(
    ctx: Context<'info, Execute<'info>>,
    mut compact_instructions: Vec<CompactInstruction>,
    secp256r1_verify_args: Secp256r1VerifyArgs,
    slot_number: u64,
) -> Result<()> {
    // Top-level only — reject auth via CPI wrappers.
    require!(
        get_stack_height() == TRANSACTION_LEVEL_STACK_HEIGHT,
        PhygitalError::ExecuteViaCpiNotAllowed
    );

    let token_key = ctx.accounts.phygital_token.key();
    let (wallet_bump, policy_present) =
        resolve_authority(&ctx.accounts.authority_account, &token_key)?;

    let slot_hash = fetch_slot_hash(&ctx.accounts.slot_hashes, slot_number)?;
    let message_hash =
        build_execute_challenge(slot_hash, &compact_instructions, ctx.remaining_accounts)?;

    let phygital_token_program = ctx.accounts.phygital_token_program.to_account_info();
    let phygital_token_ai = ctx.accounts.phygital_token.to_account_info();
    let instructions_sysvar_ai = ctx.accounts.instructions_sysvar.to_account_info();
    VerifyCpiBuilder::new(&phygital_token_program)
        .phygital_token(&phygital_token_ai)
        .instructions_sysvar(&instructions_sysvar_ai)
        .secp256r1_verify_args(secp256r1_verify_args.into())
        .message_hash(message_hash)
        .invoke()?;

    // Snapshot balances before the CPIs; spend is metered from the actual balance
    // delta, not instruction data (see `charge_policy_deltas`).
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

/// Separate owner transaction: no accessory proof or policy checks. This does
/// not update accessory allowances or issue a grant for a later accessory retry.
#[derive(Accounts)]
pub struct ExecuteWithAuthority<'info> {
    /// The token's authority (ed25519) — the sole authorization; policy is skipped.
    pub authority: Signer<'info>,

    /// CHECK: owned by phygital-token; must be locked Controlled.
    #[account(
        owner = phygital_token_client::PHYGITAL_TOKEN_ID,
        constraint = locked_controlled(&phygital_token) @ PhygitalError::TokenIsCurrentlyUnLocked,
    )]
    pub phygital_token: UncheckedAccount<'info>,

    /// CHECK: header read by offset; authority signer, token binding and canonical
    /// PDA validated in the handler (not via Anchor `seeds`/`has_one`, whose
    /// `?`/self-referential form is not expressible in the IDL). Not writable: the
    /// authority path never touches policy counters.
    pub authority_account: UncheckedAccount<'info>,

    /// CHECK: wallet PDA that signs inner CPIs. Validated by `wallet_matches_owner`;
    /// the wallet bump comes from the validated authority header.
    #[account(
        constraint = wallet_matches_owner(&wallet, &phygital_token) @ PhygitalError::WalletOwnerMismatch,
    )]
    pub wallet: UncheckedAccount<'info>,

    /// CHECK: validated as the instructions sysvar address
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn authority_handler<'info>(
    ctx: Context<'info, ExecuteWithAuthority<'info>>,
    mut compact_instructions: Vec<CompactInstruction>,
) -> Result<()> {
    // Top-level only — reject auth via CPI wrappers.
    require!(
        get_stack_height() == TRANSACTION_LEVEL_STACK_HEIGHT,
        PhygitalError::ExecuteViaCpiNotAllowed
    );

    // No durable nonces anywhere in the program.
    reject_durable_nonce(&ctx.accounts.instructions_sysvar)?;

    let token_key = ctx.accounts.phygital_token.key();
    // Validate the authority header by offset (no Borsh round-trip): signer owns
    // it and it is the canonical PDA, then confirm it is bound to this token.
    let authority_info = ctx.accounts.authority_account.to_account_info();
    let header =
        authorize_authority_signer(&authority_info, &ctx.accounts.authority.key(), ctx.program_id)?;
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
