use anchor_lang::prelude::*;

#[error_code]
pub enum PhygitalError {
    #[msg("Token must be lockable and currently locked")]
    TokenIsCurrentlyUnLocked,
    #[msg("Slot not found in SlotHashes sysvar — signature has expired or is being replayed")]
    InvalidSlotHash,
    #[msg("Invalid SlotHashes sysvar data format")]
    InvalidSysvarDataFormat,
    #[msg("Account data is missing or malformed")]
    InvalidAccountData,
    #[msg("Compact instruction account index out of bounds")]
    InvalidAccountIndex,
    #[msg("Self-reentrancy via CPI into this program is not allowed")]
    SelfReentrancyNotAllowed,
    #[msg("CPI into the phygital-token program is not allowed")]
    PhygitalTokenCpiNotAllowed,
    #[msg("Wallet PDA must equal phygital_token.owner")]
    WalletOwnerMismatch,
    #[msg("Execute must be a top-level instruction (CPI into execute is not allowed)")]
    ExecuteViaCpiNotAllowed,
    #[msg("Wallet PDA owner or data length changed during inner CPI")]
    WalletInvariantViolated,
    #[msg("Protected account may not be a signer or writable in inner instructions")]
    ProtectedAccountPrivilege,
    #[msg("Durable-nonce transactions are not allowed")]
    DurableNonceNotAllowed,

    // --- authority ---
    #[msg("Authority signer does not match the token's configured authority")]
    AuthorityMismatch,
    #[msg("Authority account does not match the phygital token")]
    AuthorityTokenMismatch,
    #[msg("Authority pubkey must be a non-default key")]
    InvalidAuthority,
    #[msg("Rent receiver must match the authority account creator")]
    AuthorityPayerMismatch,

    // --- policy ---
    #[msg("Mint has no configured spend cap")]
    MintNotAllowed,
    #[msg("Transfer exceeds the configured spending limit")]
    SpendLimitExceeded,
    #[msg("Policy arguments or requested account size are invalid")]
    InvalidPolicyArgs,
    #[msg("Execute may not leave a standing delegate on a wallet-owned token account")]
    DelegationNotAllowed,
    #[msg("Wallet-owned token account control changed during execute")]
    TokenAuthorityChanged,
    #[msg("Unsupported policy layout: authority must clear and recreate the policy")]
    UnsupportedPolicyVersion,
    #[msg("Passkey execute may only invoke allow-listed programs while a policy is active")]
    ProgramNotAllowed,
    #[msg("Unsupported authority header layout")]
    UnsupportedAuthorityVersion,
    #[msg("Instruction does not satisfy the configured program rules")]
    InstructionNotAllowed,
    // Appended at the end to keep existing error codes stable.
    #[msg("Accessory tap is disabled: an owner must be set before tapping (removing the owner disables it)")]
    AccessoryDisabled,
}
