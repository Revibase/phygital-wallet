use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

use crate::error::PhygitalError;
use crate::utils::instruction_policy::ProgramPermission;
use crate::utils::instruction_policy::decode_permissions;

/// Instruction-arg mirror of `phygital_token_client::Secp256r1VerifyArgs`.
///
/// The crates.io client only derives Borsh for this type, which breaks Anchor's
/// `idl-build` (`IdlBuild` methods). Keep a same-layout Anchor type here for the
/// program interface and convert at the CPI boundary.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct Secp256r1VerifyArgs {
    pub verify_args_relative_index: i64,
    pub signed_message_index: u8,
    pub client_data_json: Vec<u8>,
}

impl From<Secp256r1VerifyArgs> for phygital_token_client::Secp256r1VerifyArgs {
    fn from(value: Secp256r1VerifyArgs) -> Self {
        Self {
            verify_args_relative_index: value.verify_args_relative_index,
            signed_message_index: value.signed_message_index,
            client_data_json: value.client_data_json,
        }
    }
}

/// Index-based inner instruction for execute.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct CompactInstruction {
    /// Index into `remaining_accounts` for the target program id.
    pub program_id_index: u8,
    /// Indexes into `remaining_accounts` for the instruction's accounts.
    pub account_indexes: Vec<u8>,
    pub data: Vec<u8>,
}

/// Fixed 104-byte header of the [`Authority`] account, laid out immediately after
/// the 8-byte Anchor discriminator. Kept as its own `#[repr(C)]` Pod type so the
/// hot path can `bytemuck`-read it in place, and reused as the first field of the
/// Borsh `Authority` so the IDL and the on-chain bytes share one definition
/// (Borsh serializes a nested struct inline, byte-for-byte with its Pod layout).
#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    bytemuck::Pod,
    bytemuck::Zeroable,
)]
#[repr(C)]
pub struct AuthorityHeader {
    /// Owner admin key: changes settings and executes outside accessory policy.
    pub authority: Pubkey,
    /// Token governed by this account, retained for authority-filtered GPA discovery.
    pub phygital_token: Pubkey,
    /// Account that paid init rent; close refunds this pubkey.
    pub payer: Pubkey,
    pub bump: u8,
    pub wallet_bump: u8,
    pub version: u8,
    /// Zero => no policy configured (unrestricted). `WALLET_POLICY_VERSION` => the
    /// inline policy below is active (and enforces token-control invariants even
    /// with no spend caps set).
    pub policy_version: u8,
    pub _padding: [u8; 4],
}

pub const AUTHORITY_VERSION: u8 = 1;
const _: () = assert!(core::mem::size_of::<AuthorityHeader>() == 104);
const _: () = assert!(core::mem::align_of::<AuthorityHeader>() == 1);

/// Per-token authority: an ed25519 key set once by the passkey. It administers
/// policy, may bypass policy on execute, and may drive the wallet without the
/// accessory passkey. Cleared only by its own signature.
///
/// The fixed header and aligned spending counters are read with bytemuck.
/// A bounded Borsh program-permission tail follows the mint array. The complete
/// account remains decodable by standard Anchor clients.
#[account]
#[derive(Debug)]
pub struct Authority {
    pub header: AuthorityHeader,
    /// Native SOL spend cap. Meters native lamports AND wallet-owned wrapped SOL
    /// (both WSOL native mints) together — one asset to the user. Active when
    /// `cap != 0` and `header.policy_version == WALLET_POLICY_VERSION`.
    pub sol_cap: SpendCap,
    /// Must be zero; aligns the following mint array for zero-copy reads.
    pub policy_padding: u32,
    /// Per-asset allowances. Any configured cap blocks decreases of uncapped
    /// assets; no caps means no amount limits. WSOL belongs to sol_cap.
    pub mint_caps: Vec<MintCap>,
    /// Explicit per-program overrides of the fixed baseline.
    pub program_permissions: Vec<ProgramPermission>,
}

impl Authority {
    /// Anchor account discriminator, prepended before the header.
    pub const DISCRIMINATOR_LEN: usize = 8;
    /// First byte of the SOL cap (== end of the discriminator + header).
    pub const SOL_CAP_OFFSET: usize =
        Self::DISCRIMINATOR_LEN + core::mem::size_of::<AuthorityHeader>();
    const SOL_CAP_END: usize = Self::SOL_CAP_OFFSET + core::mem::size_of::<SpendCap>();
    const PADDING_OFFSET: usize = Self::SOL_CAP_END;
    const MINT_LEN_OFFSET: usize = Self::PADDING_OFFSET + 4;
    pub const MINTS_OFFSET: usize = Self::MINT_LEN_OFFSET + 4;
    /// Empty mint and permission vectors; policy presence is still header-driven.
    pub const BASE_LEN: usize = Self::MINTS_OFFSET + 4;

    pub fn with_mint_count(mint_count: usize) -> Result<usize> {
        mint_count
            .checked_mul(core::mem::size_of::<MintCap>())
            .and_then(|bytes| Self::BASE_LEN.checked_add(bytes))
            .ok_or_else(|| error!(PhygitalError::InvalidPolicyArgs))
    }

    /// Zero-copy borrow of the header, verifying the discriminator and authority
    /// version. Rejects any account that is not our current layout.
    #[inline]
    pub fn read_header(data: &[u8]) -> Result<&AuthorityHeader> {
        require!(
            data.len() >= Self::SOL_CAP_OFFSET,
            PhygitalError::InvalidAccountData
        );
        require!(
            &data[..Self::DISCRIMINATOR_LEN] == Self::DISCRIMINATOR,
            PhygitalError::InvalidAccountData
        );
        let header: &AuthorityHeader =
            bytemuck::try_from_bytes(&data[Self::DISCRIMINATOR_LEN..Self::SOL_CAP_OFFSET])
                .map_err(|_| error!(PhygitalError::InvalidAccountData))?;
        require!(
            header.version == AUTHORITY_VERSION,
            PhygitalError::UnsupportedAuthorityVersion
        );
        Ok(header)
    }

    /// Mutable header borrow. The version is not re-checked: callers reach this
    /// only after a load that already validated the account, and only mutate
    /// `policy_version`.
    #[inline]
    pub fn read_header_mut(data: &mut [u8]) -> Result<&mut AuthorityHeader> {
        require!(
            data.len() >= Self::SOL_CAP_OFFSET,
            PhygitalError::InvalidAccountData
        );
        require!(
            &data[..Self::DISCRIMINATOR_LEN] == Self::DISCRIMINATOR,
            PhygitalError::InvalidAccountData
        );
        bytemuck::try_from_bytes_mut(&mut data[Self::DISCRIMINATOR_LEN..Self::SOL_CAP_OFFSET])
            .map_err(|_| error!(PhygitalError::InvalidAccountData))
    }

    /// Header plus whether the inline policy is active. Presence is driven by
    /// `policy_version` (not length), cross-checked against the layout so a stale
    /// or corrupt marker fails closed rather than silently reading as "no policy".
    #[inline]
    pub fn read(data: &[u8]) -> Result<(&AuthorityHeader, bool)> {
        let header = Self::read_header(data)?;
        match header.policy_version {
            0 => {
                require!(
                    data.len() == Self::BASE_LEN
                        && data[Self::SOL_CAP_OFFSET..].iter().all(|byte| *byte == 0),
                    PhygitalError::InvalidAccountData
                );
                Ok((header, false))
            }
            WALLET_POLICY_VERSION => {
                // Validate the layout cheaply without decoding/allocating the
                // permission tail; the sole authoritative decode happens in the
                // caller (`check_policy_and_snapshot`), which still aborts before
                // any CPI if the tail is malformed.
                Self::parse_layout(data)?;
                Ok((header, true))
            }
            _ => err!(PhygitalError::UnsupportedPolicyVersion),
        }
    }

    /// Locate the mint array and permission tail without allocating.
    fn parse_layout(data: &[u8]) -> Result<usize> {
        require!(
            data.len() >= Self::BASE_LEN,
            PhygitalError::InvalidAccountData
        );
        require!(
            data[Self::PADDING_OFFSET..Self::MINT_LEN_OFFSET] == [0; 4],
            PhygitalError::InvalidAccountData
        );
        let count = u32::from_le_bytes(
            data[Self::MINT_LEN_OFFSET..Self::MINTS_OFFSET]
                .try_into()
                .unwrap(),
        ) as usize;
        let end = count
            .checked_mul(core::mem::size_of::<MintCap>())
            .and_then(|bytes| Self::MINTS_OFFSET.checked_add(bytes))
            .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
        require!(
            end <= data.len() && data.len() - end >= 4,
            PhygitalError::InvalidAccountData
        );
        Ok(end)
    }

    pub fn read_policy(
        data: &[u8],
    ) -> Result<(&SpendCap, &[MintCap], Vec<ProgramPermission>)> {
        let end = Self::parse_layout(data)?;
        let sol = bytemuck::try_from_bytes(&data[Self::SOL_CAP_OFFSET..Self::SOL_CAP_END])
            .map_err(|_| error!(PhygitalError::InvalidAccountData))?;
        let mints = bytemuck::try_cast_slice(&data[Self::MINTS_OFFSET..end])
            .map_err(|_| error!(PhygitalError::InvalidAccountData))?;
        let permissions = decode_permissions(&data[end..])?;
        Ok((sol, mints, permissions))
    }

    pub fn read_policy_mut(data: &mut [u8]) -> Result<(&mut SpendCap, &mut [MintCap])> {
        let end = Self::parse_layout(data)?;
        let (head, tail) = data.split_at_mut(Self::MINTS_OFFSET);
        let sol = bytemuck::try_from_bytes_mut(&mut head[Self::SOL_CAP_OFFSET..Self::SOL_CAP_END])
            .map_err(|_| error!(PhygitalError::InvalidAccountData))?;
        let mints = bytemuck::try_cast_slice_mut(&mut tail[..end - Self::MINTS_OFFSET])
            .map_err(|_| error!(PhygitalError::InvalidAccountData))?;
        Ok((sol, mints))
    }

    /// Caller serializes and validates the permissions before resizing the account.
    pub fn write_policy(data: &mut [u8], sol: &SpendCap, mints: &[MintCap], permissions: &[u8]) {
        data[Self::SOL_CAP_OFFSET..Self::SOL_CAP_END].copy_from_slice(bytemuck::bytes_of(sol));
        data[Self::PADDING_OFFSET..Self::MINT_LEN_OFFSET].fill(0);
        data[Self::MINT_LEN_OFFSET..Self::MINTS_OFFSET]
            .copy_from_slice(&(mints.len() as u32).to_le_bytes());
        let end = Self::MINTS_OFFSET + core::mem::size_of_val(mints);
        data[Self::MINTS_OFFSET..end].copy_from_slice(bytemuck::cast_slice(mints));
        data[end..].copy_from_slice(permissions);
    }
}

/// Discriminator length assumption must match what Anchor actually prepends, and
/// the mint-cap array must be 8-aligned on-chain (`cast_slice` requires it).
const _: () = assert!(Authority::DISCRIMINATOR_LEN == Authority::DISCRIMINATOR.len());
const _: () = assert!(Authority::SOL_CAP_OFFSET % core::mem::align_of::<SpendCap>() == 0);
const _: () = assert!(Authority::MINTS_OFFSET % core::mem::align_of::<MintCap>() == 0);
/// A fixed-interval allowance in raw units. `window_seconds == 0` never resets
/// automatically. Positive windows refill on a charge at or after the boundary;
/// `last_reset` anchors the interval. Saving policy preserves usage for a cap left
/// unchanged; changing a cap's amount or window refills and reanchors that cap.
/// Used directly as the SOL cap and embedded (with a mint) in `MintCap`. Derives
/// both Borsh (for the IDL / clients) and `bytemuck::Pod` (for on-chain reads); the
/// padding-free `#[repr(C)]` layout makes those two encodings byte-identical.
#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    bytemuck::Pod,
    bytemuck::Zeroable,
)]
#[repr(C)]
pub struct SpendCap {
    /// Maximum allowance per period (or lifetime for a zero window).
    pub cap: u64,
    /// Stored allowance; reads do not refill it when an interval passes.
    pub remaining: u64,
    /// Chain timestamp anchoring this interval, not the time of the last payment.
    pub last_reset: i64,
    pub window_seconds: i64,
}

const _: () = assert!(core::mem::size_of::<SpendCap>() == 32);

impl SpendCap {
    /// A SOL cap is active exactly when one was configured. `new_spend_cap` requires
    /// a nonzero `cap`, and an unset cap is left zeroed, so the cap value is a
    /// faithful "is set" marker with no separate flag to keep in sync.
    #[inline]
    pub fn is_active(&self) -> bool {
        self.cap != 0
    }
}

/// A spending allowance bound to a specific SPL/Token-2022 mint. Same dual Borsh +
/// Pod derivation and padding-free layout as [`SpendCap`].
#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    bytemuck::Pod,
    bytemuck::Zeroable,
)]
#[repr(C)]
pub struct MintCap {
    pub mint: Pubkey,
    pub cap: SpendCap,
}

pub const WALLET_POLICY_VERSION: u8 = 8;
const _: () = assert!(core::mem::size_of::<MintCap>() == 64);
