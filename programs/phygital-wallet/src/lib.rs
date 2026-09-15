//! NFC accessory authorization with separate owner controls.
//!
//! After owner setup: no spending limits, baseline program access, and
//! token-account control checks. Any cap restricts decreases to capped assets.
//! Instruction permissions are independent of allowances. Owner execute bypasses
//! policy; saving policy preserves usage for unchanged caps. Clearing the owner
//! disables the accessory tap. See `programs/phygital-wallet/README.md`.

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub(crate) mod utils;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use utils::instruction_policy::*;

declare_id!("Fjbi9JrRAmSBdxQxbkcxYDp6JUwnLbFhU2GsieWQBLSg");

#[program]
pub mod phygital_wallet {
    use super::*;

    pub fn set_authority(
        ctx: Context<SetAuthority>,
        authority: Pubkey,
        secp256r1_verify_args: Secp256r1VerifyArgs,
        slot_number: u64,
    ) -> Result<()> {
        instructions::authority::set_authority_handler(
            ctx,
            authority,
            secp256r1_verify_args,
            slot_number,
        )
    }

    pub fn clear_authority(ctx: Context<ClearAuthority>) -> Result<()> {
        instructions::authority::clear_authority_handler(ctx)
    }

    pub fn set_wallet_policy(ctx: Context<SetWalletPolicy>, args: WalletPolicyArgs) -> Result<()> {
        instructions::wallet_policy::set_wallet_policy_handler(ctx, args)
    }

    pub fn clear_wallet_policy(ctx: Context<ClearWalletPolicy>) -> Result<()> {
        instructions::wallet_policy::clear_wallet_policy_handler(ctx)
    }

    pub fn execute<'info>(
        ctx: Context<'info, Execute<'info>>,
        compact_instructions: Vec<CompactInstruction>,
        secp256r1_verify_args: Secp256r1VerifyArgs,
        slot_number: u64,
    ) -> Result<()> {
        instructions::execute::handler(
            ctx,
            compact_instructions,
            secp256r1_verify_args,
            slot_number,
        )
    }

    pub fn execute_with_authority<'info>(
        ctx: Context<'info, ExecuteWithAuthority<'info>>,
        compact_instructions: Vec<CompactInstruction>,
    ) -> Result<()> {
        instructions::execute::authority_handler(ctx, compact_instructions)
    }

    pub fn execute_with_authority_using_policies<'info>(
        ctx: Context<'info, ExecuteWithAuthorityUsingPolicies<'info>>,
        compact_instructions: Vec<CompactInstruction>,
    ) -> Result<()> {
        instructions::execute::authority_with_policies_handler(ctx, compact_instructions)
    }
}
