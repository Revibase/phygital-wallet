use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use solana_sha256_hasher::{hash, hashv};

use crate::constants::{EXECUTE_CHALLENGE_PREFIX, PROGRAM_WALLET_SEED};
use crate::error::PhygitalError;
use crate::state::CompactInstruction;
use crate::utils::instruction_policy::{check_instruction, ProgramPermission};

/// Packed compact format used for `instructions_hash`:
/// ```text
/// [num_instructions(1)]
/// for each: [program_id_index(1)][num_accounts(1)][indexes...][data_len(2 LE)][data...]
/// ```
fn pack_compact_instructions(instructions: &[CompactInstruction]) -> Result<Vec<u8>> {
    require!(
        instructions.len() <= u8::MAX as usize,
        PhygitalError::InvalidAccountData
    );

    let mut size = 1usize;
    for ix in instructions {
        require!(
            ix.account_indexes.len() <= u8::MAX as usize,
            PhygitalError::InvalidAccountData
        );
        require!(
            ix.data.len() <= u16::MAX as usize,
            PhygitalError::InvalidAccountData
        );
        size = size
            .checked_add(1 + 1 + ix.account_indexes.len() + 2 + ix.data.len())
            .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
    }

    let mut bytes = Vec::with_capacity(size);
    bytes.push(instructions.len() as u8);
    for ix in instructions {
        bytes.push(ix.program_id_index);
        bytes.push(ix.account_indexes.len() as u8);
        bytes.extend_from_slice(&ix.account_indexes);
        bytes.extend_from_slice(&(ix.data.len() as u16).to_le_bytes());
        bytes.extend_from_slice(&ix.data);
    }
    debug_assert_eq!(bytes.len(), size);
    Ok(bytes)
}

pub(crate) fn hash_compact_instructions(instructions: &[CompactInstruction]) -> Result<[u8; 32]> {
    Ok(hash(&pack_compact_instructions(instructions)?).to_bytes())
}

/// Outer execute challenge: `SHA256(prefix || slot_hash || instructions_hash || accounts_hash)`.
pub(crate) fn hash_execute_challenge(
    slot_hash: &[u8; 32],
    instructions_hash: &[u8; 32],
    accounts_hash: &[u8; 32],
) -> [u8; 32] {
    hashv(&[
        EXECUTE_CHALLENGE_PREFIX,
        slot_hash,
        instructions_hash,
        accounts_hash,
    ])
    .to_bytes()
}

/// Privilege flags packed into `accounts_hash`: bit0 = signer, bit1 = writable.
#[inline]
pub(crate) fn account_privilege_byte(is_signer: bool, is_writable: bool) -> u8 {
    u8::from(is_signer) | (u8::from(is_writable) << 1)
}

/// Static slices for `hashv` (avoids contiguous pubkey copies on the hot path).
const PRIVILEGE_SLICES: [&[u8]; 4] = [&[0], &[1], &[2], &[3]];

/// Hot-path `accounts_hash` from remaining `AccountInfo` keys and privilege flags.
/// Elevating signer/writable after the passkey signs changes this digest.
pub(crate) fn hash_referenced_accounts_infos<'info>(
    remaining: &[AccountInfo<'info>],
    instructions: &[CompactInstruction],
) -> Result<[u8; 32]> {
    let entry_count: usize = instructions
        .iter()
        .map(|ix| 1 + ix.account_indexes.len())
        .sum();
    let mut parts: Vec<&[u8]> = Vec::with_capacity(entry_count.saturating_mul(2));
    for ix in instructions {
        let program = remaining
            .get(ix.program_id_index as usize)
            .ok_or_else(|| error!(PhygitalError::InvalidAccountIndex))?;
        parts.push(program.key.as_ref());
        parts.push(
            PRIVILEGE_SLICES
                [account_privilege_byte(program.is_signer, program.is_writable) as usize],
        );
        for &idx in &ix.account_indexes {
            let ai = remaining
                .get(idx as usize)
                .ok_or_else(|| error!(PhygitalError::InvalidAccountIndex))?;
            parts.push(ai.key.as_ref());
            parts.push(
                PRIVILEGE_SLICES[account_privilege_byte(ai.is_signer, ai.is_writable) as usize],
            );
        }
    }
    Ok(hashv(&parts).to_bytes())
}

/// `invoke_signed` batch with the wallet PDA. Protected accounts may only appear
/// non-signer/non-writable in direct metas. Permissions do not cover nested CPIs.
#[allow(clippy::too_many_arguments)]
pub(crate) fn execute_compact_instructions<'info>(
    program_id: &Pubkey,
    wallet: &AccountInfo<'info>,
    wallet_bump: u8,
    phygital_token_key: &Pubkey,
    protected_accounts: &[&Pubkey],
    remaining_accounts: &[AccountInfo<'info>],
    compact_instructions: &mut [CompactInstruction],
    // None is the explicit authority/no-policy bypass. Some(empty) is baseline.
    program_permissions: Option<&[ProgramPermission]>,
) -> Result<()> {
    let wallet_owner_before = *wallet.owner;
    let wallet_data_len_before = wallet.data_len();

    let bump_seed = [wallet_bump];
    let seeds: &[&[u8]] = &[
        PROGRAM_WALLET_SEED,
        phygital_token_key.as_ref(),
        bump_seed.as_ref(),
    ];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let mut metas = Vec::new();

    for compact in compact_instructions.iter_mut() {
        let program_ai = remaining_accounts
            .get(compact.program_id_index as usize)
            .ok_or_else(|| error!(PhygitalError::InvalidAccountIndex))?;
        let target_program = *program_ai.key;

        require_keys_neq!(
            target_program,
            *program_id,
            PhygitalError::SelfReentrancyNotAllowed
        );
        require_keys_neq!(
            target_program,
            phygital_token_client::PHYGITAL_TOKEN_ID,
            PhygitalError::PhygitalTokenCpiNotAllowed
        );
        if let Some(permissions) = program_permissions {
            check_instruction(
                permissions,
                &target_program,
                compact,
                remaining_accounts,
                wallet.key,
            )?;
        }

        metas.clear();
        metas.reserve(compact.account_indexes.len());
        for &idx in &compact.account_indexes {
            let ai = remaining_accounts
                .get(idx as usize)
                .ok_or_else(|| error!(PhygitalError::InvalidAccountIndex))?;

            let is_protected = protected_accounts.iter().any(|k| *ai.key == **k);
            if is_protected {
                require!(
                    !ai.is_signer && !ai.is_writable,
                    PhygitalError::ProtectedAccountPrivilege
                );
            }

            let is_wallet = ai.key == wallet.key;
            metas.push(AccountMeta {
                pubkey: *ai.key,
                is_signer: ai.is_signer || is_wallet,
                is_writable: ai.is_writable,
            });
        }

        let ix = Instruction {
            program_id: target_program,
            accounts: core::mem::take(&mut metas),
            data: core::mem::take(&mut compact.data),
        };

        invoke_signed(&ix, remaining_accounts, signer_seeds)?;
        metas = ix.accounts;
    }

    require!(
        *wallet.owner == wallet_owner_before && wallet.data_len() == wallet_data_len_before,
        PhygitalError::WalletInvariantViolated
    );

    Ok(())
}
