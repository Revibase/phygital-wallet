use anchor_lang::prelude::*;

#[constant]
pub const PROGRAM_WALLET_SEED: &[u8] = b"program_wallet";

#[constant]
pub const AUTHORITY_SEED: &[u8] = b"authority";

#[constant]
pub const EXECUTE_CHALLENGE_PREFIX: &[u8] = b"phygital_wallet:execute:v3";

pub const SET_AUTHORITY_CHALLENGE_PREFIX: &[u8] = b"phygital_wallet:set_authority:v1";

pub const SPL_TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_PROGRAM_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub use solana_sdk_ids::system_program::ID as SYSTEM_PROGRAM_ID;
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey =
    pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/// Baseline direct-CPI allow-list when no explicit permission overrides a program.
#[inline]
pub fn is_policy_allowed_program(program_id: &Pubkey) -> bool {
    *program_id == SYSTEM_PROGRAM_ID
        || *program_id == SPL_TOKEN_PROGRAM_ID
        || *program_id == TOKEN_2022_PROGRAM_ID
        || *program_id == ASSOCIATED_TOKEN_PROGRAM_ID
}

/// SPL Token and Token-2022 wrapped-SOL mints (fold into `sol_cap`, not mint caps).
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
pub const WSOL_MINT_2022: Pubkey = pubkey!("9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP");

#[inline]
pub fn is_wsol_mint(mint: &Pubkey) -> bool {
    *mint == WSOL_MINT || *mint == WSOL_MINT_2022
}
