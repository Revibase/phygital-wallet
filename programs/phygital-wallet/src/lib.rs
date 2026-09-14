//! Wallet authorization for an NFC accessory, with separate owner controls.
//!
//! After owner setup, the default is no spending limits with standard program
//! and token-account protections. Adding any cap restricts spending to capped
//! assets. Instruction rules and allowances are separate checks.
//! Owner transactions bypass policy; policy saves currently refill all allowances.
//! Removing owner controls does not freeze the wallet or revoke the accessory.
//! See the program README and docs/ for the owner guide and exact semantics.

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

    /// Passkey-gated: set the token's authority (ed25519). Only succeeds when no
    /// authority exists yet. Starts with standard protections and no spending limits.
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

    /// Owner-signed: remove owner controls and policy. The wallet and accessory
    /// remain usable without wallet policy; this is not a freeze or browser logout.
    pub fn clear_authority(ctx: Context<ClearAuthority>) -> Result<()> {
        instructions::authority::clear_authority_handler(ctx)
    }

    /// Owner-signed: replace all settings and refill every allowance, even when
    /// only permissions changed. Empty args restore standard settings, removing
    /// caps AND custom restrictions; they do not disable the policy.
    pub fn set_wallet_policy(ctx: Context<SetWalletPolicy>, args: WalletPolicyArgs) -> Result<()> {
        instructions::wallet_policy::set_wallet_policy_handler(ctx, args)
    }

    /// Authority-signed: explicitly disable all policy protections (authority remains).
    /// To remove only spending limits, submit no caps while preserving program
    /// permissions. Empty/default args also remove custom application restrictions.
    pub fn clear_wallet_policy(ctx: Context<ClearWalletPolicy>) -> Result<()> {
        instructions::wallet_policy::clear_wallet_policy_handler(ctx)
    }

    /// Passkey-authorized execute of compact inner instructions. Enforces the
    /// token's instruction rules, spending allowances and token-control checks
    /// when a policy is present. A valid accessory proof alone does not bypass them.
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

    /// Authority-authorized execute (ed25519 authority signer). Skips the passkey
    /// verify and policy checks for this separate owner transaction. Does not
    /// consume accessory allowances or grant approval to retry a blocked tap.
    pub fn execute_with_authority<'info>(
        ctx: Context<'info, ExecuteWithAuthority<'info>>,
        compact_instructions: Vec<CompactInstruction>,
    ) -> Result<()> {
        instructions::execute::authority_handler(ctx, compact_instructions)
    }

    /// Authority-authorized execute that skips the accessory proof but enforces
    /// and charges the wallet policy exactly like `execute`.
    pub fn execute_with_authority_using_policies<'info>(
        ctx: Context<'info, ExecuteWithAuthorityUsingPolicies<'info>>,
        compact_instructions: Vec<CompactInstruction>,
    ) -> Result<()> {
        instructions::execute::authority_with_policies_handler(ctx, compact_instructions)
    }
}
