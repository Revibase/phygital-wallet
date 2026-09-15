use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

use crate::error::PhygitalError;
use crate::utils::instruction_policy::decode_permissions;
use crate::utils::instruction_policy::ProgramPermission;

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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct CompactInstruction {
    pub program_id_index: u8,
    pub account_indexes: Vec<u8>,
    pub data: Vec<u8>,
}

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
    pub authority: Pubkey,
    pub phygital_token: Pubkey,
    pub payer: Pubkey,
    pub bump: u8,
    pub wallet_bump: u8,
    pub version: u8,
    pub policy_version: u8,
    pub _padding: [u8; 4],
}

pub const AUTHORITY_VERSION: u8 = 1;
const _: () = assert!(core::mem::size_of::<AuthorityHeader>() == 104);
const _: () = assert!(core::mem::align_of::<AuthorityHeader>() == 1);

#[account]
#[derive(Debug)]
pub struct Authority {
    pub header: AuthorityHeader,
    pub sol_cap: SpendCap,
    pub policy_padding: u32,
    pub mint_caps: Vec<MintCap>,
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

    pub fn read_policy(data: &[u8]) -> Result<(&SpendCap, &[MintCap], Vec<ProgramPermission>)> {
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

const _: () = assert!(Authority::DISCRIMINATOR_LEN == Authority::DISCRIMINATOR.len());
const _: () = assert!(Authority::SOL_CAP_OFFSET % core::mem::align_of::<SpendCap>() == 0);
const _: () = assert!(Authority::MINTS_OFFSET % core::mem::align_of::<MintCap>() == 0);

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
    pub cap: u64,
    pub remaining: u64,
    pub last_reset: i64,
    pub window_seconds: i64,
}

const _: () = assert!(core::mem::size_of::<SpendCap>() == 32);

impl SpendCap {
    #[inline]
    pub fn is_active(&self) -> bool {
        self.cap != 0
    }
}

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
