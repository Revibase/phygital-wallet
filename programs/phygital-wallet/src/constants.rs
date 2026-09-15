use anchor_lang::prelude::*;

#[constant]
pub const PROGRAM_WALLET_SEED: &[u8] = b"program_wallet";

#[constant]
pub const AUTHORITY_SEED: &[u8] = b"authority";

#[constant]

/// Execute challenge: `SHA256(prefix || slot_hash || instructions_hash || accounts_hash)`.
/// `accounts_hash` binds each referenced remaining-account pubkey plus its
/// signer/writable flags so privilege elevation after signing fails closed.
pub const EXECUTE_CHALLENGE_PREFIX: &[u8] = b"phygital_wallet:execute:v3";

/// Set authority: `SHA256(prefix || slot_hash || phygital_token || authority)`.
pub const SET_AUTHORITY_CHALLENGE_PREFIX: &[u8] = b"phygital_wallet:set_authority:v1";

pub const SPL_TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_PROGRAM_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
/// Re-exported from `solana-sdk-ids` so the value has a single source of truth
/// (shared with `utils::policy`) rather than a hand-typed literal that can drift.
pub use solana_sdk_ids::system_program::ID as SYSTEM_PROGRAM_ID;
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey =
    pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/// Baseline direct-CPI programs when no explicit permission overrides a program.
/// Denied/Restricted entries replace this default. AllInstructions can extend it.
/// Spending caps and token-control checks are enforced separately.
#[inline]
pub fn is_policy_allowed_program(program_id: &Pubkey) -> bool {
    *program_id == SYSTEM_PROGRAM_ID
        || *program_id == SPL_TOKEN_PROGRAM_ID
        || *program_id == TOKEN_2022_PROGRAM_ID
        || *program_id == ASSOCIATED_TOKEN_PROGRAM_ID
}

/// Wrapped-SOL native mints. Both are SOL-equivalent (1 base unit = 1 lamport) and
/// fold into the native SOL spend cap rather than being separately cappable mints.
/// Classic SPL Token native mint:
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
/// Token-2022 native mint:
pub const WSOL_MINT_2022: Pubkey = pubkey!("9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP");

/// A wrapped-SOL mint (either token program's native mint).
#[inline]
pub fn is_wsol_mint(mint: &Pubkey) -> bool {
    *mint == WSOL_MINT || *mint == WSOL_MINT_2022
}
