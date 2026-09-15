//! Direct-CPI instruction permissions. Overrides replace baseline; nested CPIs
//! inside a permitted program are not inspected. Independent of spend counters.
use crate::{constants::is_policy_allowed_program, error::PhygitalError, CompactInstruction};
use anchor_lang::prelude::*;

pub const MAX_PERMISSION_BYTES: usize = 4096;
pub const MAX_PERMISSION_HEAP_BYTES: usize = 8192;
pub const MAX_PROGRAM_PERMISSIONS: usize = 16;
pub const MAX_INSTRUCTION_RULES: usize = 16;
pub const MAX_RULE_CONSTRAINTS: usize = 16;
pub const MAX_MATCH_BYTES: usize = 64;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProgramPermission {
    pub program_id: Pubkey,
    pub access: ProgramAccess,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum ProgramAccess {
    Denied,
    AllInstructions,
    Restricted(Vec<InstructionRule>),
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct InstructionRule {
    pub selector: Vec<u8>,
    pub data_length: Option<u16>,
    pub account_count: Option<u8>,
    pub accounts: Vec<AccountConstraint>,
    pub arguments: Vec<DataConstraint>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum AccountKeyConstraint {
    Any,
    Address(Pubkey),
    Wallet,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct AccountConstraint {
    pub index: u8,
    pub key: AccountKeyConstraint,
    pub owner: Option<Pubkey>,
    pub is_signer: Option<bool>,
    pub is_writable: Option<bool>,
    pub data: Vec<DataConstraint>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Comparison {
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumericWidth {
    U8,
    U16,
    U32,
    U64,
}

impl NumericWidth {
    fn bytes(self) -> usize {
        match self {
            Self::U8 => 1,
            Self::U16 => 2,
            Self::U32 => 4,
            Self::U64 => 8,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum DataPredicate {
    BytesEqual(Vec<u8>),
    Unsigned {
        width: NumericWidth,
        comparison: Comparison,
        value: u64,
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct DataConstraint {
    pub offset: u16,
    pub predicate: DataPredicate,
}

impl DataConstraint {
    fn width(&self) -> usize {
        match &self.predicate {
            DataPredicate::BytesEqual(bytes) => bytes.len(),
            DataPredicate::Unsigned { width, .. } => width.bytes(),
        }
    }
    fn validate(&self) -> Result<()> {
        match &self.predicate {
            DataPredicate::BytesEqual(bytes) => require!(
                !bytes.is_empty() && bytes.len() <= MAX_MATCH_BYTES,
                PhygitalError::InvalidPolicyArgs
            ),
            DataPredicate::Unsigned { width, value, .. } => {
                let bits = width.bytes() * 8;
                require!(
                    bits == 64 || *value < (1u64 << bits),
                    PhygitalError::InvalidPolicyArgs
                );
            }
        }
        Ok(())
    }
    fn matches(&self, data: &[u8]) -> bool {
        let start = usize::from(self.offset);
        let Some(bytes) = data.get(start..start + self.width()) else {
            return false;
        };
        match &self.predicate {
            DataPredicate::BytesEqual(expected) => bytes == expected,
            DataPredicate::Unsigned {
                comparison, value, ..
            } => {
                let mut padded = [0u8; 8];
                padded[..bytes.len()].copy_from_slice(bytes);
                let actual = u64::from_le_bytes(padded);
                match comparison {
                    Comparison::Equal => actual == *value,
                    Comparison::NotEqual => actual != *value,
                    Comparison::LessThan => actual < *value,
                    Comparison::LessThanOrEqual => actual <= *value,
                    Comparison::GreaterThan => actual > *value,
                    Comparison::GreaterThanOrEqual => actual >= *value,
                }
            }
        }
    }
}

pub(crate) fn validate_permissions(permissions: &[ProgramPermission]) -> Result<()> {
    require!(
        permissions.len() <= MAX_PROGRAM_PERMISSIONS,
        PhygitalError::InvalidPolicyArgs
    );
    let mut heap_bytes = core::mem::size_of_val(permissions);
    for (i, permission) in permissions.iter().enumerate() {
        // System's real program ID is the all-zero pubkey and must be configurable.
        require!(
            !permissions[..i]
                .iter()
                .any(|p| p.program_id == permission.program_id),
            PhygitalError::InvalidPolicyArgs
        );
        require!(
            permission.program_id != crate::ID
                && permission.program_id != phygital_token_client::PHYGITAL_TOKEN_ID,
            PhygitalError::InvalidPolicyArgs
        );
        if let ProgramAccess::Restricted(rules) = &permission.access {
            require!(
                !rules.is_empty() && rules.len() <= MAX_INSTRUCTION_RULES,
                PhygitalError::InvalidPolicyArgs
            );
            heap_bytes += core::mem::size_of_val(rules.as_slice());
            for rule in rules {
                heap_bytes += rule.selector.len()
                    + core::mem::size_of_val(rule.accounts.as_slice())
                    + core::mem::size_of_val(rule.arguments.as_slice());
                require!(
                    !rule.selector.is_empty() && rule.selector.len() <= MAX_MATCH_BYTES,
                    PhygitalError::InvalidPolicyArgs
                );
                require!(
                    rule.accounts.len() <= MAX_RULE_CONSTRAINTS
                        && rule.arguments.len() <= MAX_RULE_CONSTRAINTS,
                    PhygitalError::InvalidPolicyArgs
                );
                if let Some(length) = rule.data_length {
                    require!(
                        usize::from(length) >= rule.selector.len(),
                        PhygitalError::InvalidPolicyArgs
                    );
                }
                for argument in &rule.arguments {
                    argument.validate()?;
                    if let DataPredicate::BytesEqual(bytes) = &argument.predicate {
                        heap_bytes += bytes.len();
                    }
                    if let Some(length) = rule.data_length {
                        require!(
                            usize::from(argument.offset) + argument.width() <= usize::from(length),
                            PhygitalError::InvalidPolicyArgs
                        );
                    }
                }
                for account in &rule.accounts {
                    if let Some(count) = rule.account_count {
                        require!(account.index < count, PhygitalError::InvalidPolicyArgs);
                    }
                    require!(
                        account.data.len() <= MAX_RULE_CONSTRAINTS,
                        PhygitalError::InvalidPolicyArgs
                    );
                    require!(
                        account.data.is_empty() || account.owner.is_some(),
                        PhygitalError::InvalidPolicyArgs
                    );
                    heap_bytes += core::mem::size_of_val(account.data.as_slice());
                    for predicate in &account.data {
                        predicate.validate()?;
                        if let DataPredicate::BytesEqual(bytes) = &predicate.predicate {
                            heap_bytes += bytes.len();
                        }
                    }
                }
            }
        }
    }
    require!(
        heap_bytes <= MAX_PERMISSION_HEAP_BYTES,
        PhygitalError::InvalidPolicyArgs
    );
    Ok(())
}

impl InstructionRule {
    fn matches(&self, ix: &CompactInstruction, remaining: &[AccountInfo], wallet: &Pubkey) -> bool {
        if !ix.data.starts_with(&self.selector)
            || self
                .data_length
                .is_some_and(|len| usize::from(len) != ix.data.len())
            || self
                .account_count
                .is_some_and(|len| usize::from(len) != ix.account_indexes.len())
            || !self.arguments.iter().all(|c| c.matches(&ix.data))
        {
            return false;
        }
        for constraint in &self.accounts {
            let Some(index) = ix.account_indexes.get(usize::from(constraint.index)) else {
                return false;
            };
            let Some(account) = remaining.get(usize::from(*index)) else {
                return false;
            };
            let key_matches = match &constraint.key {
                AccountKeyConstraint::Any => true,
                AccountKeyConstraint::Address(key) => account.key == key,
                AccountKeyConstraint::Wallet => account.key == wallet,
            };
            if !key_matches
                || constraint
                    .owner
                    .is_some_and(|owner| account.owner != &owner)
                || constraint
                    .is_signer
                    .is_some_and(|signer| signer != (account.is_signer || account.key == wallet))
                || constraint
                    .is_writable
                    .is_some_and(|writable| writable != account.is_writable)
            {
                return false;
            }
            if !constraint.data.is_empty() {
                let Ok(data) = account.try_borrow_data() else {
                    return false;
                };
                if !constraint.data.iter().all(|c| c.matches(&data)) {
                    return false;
                }
            }
        }
        true
    }
}

/// Run immediately before each CPI so account predicates see preceding CPI effects.
pub(crate) fn check_instruction(
    permissions: &[ProgramPermission],
    program: &Pubkey,
    ix: &CompactInstruction,
    remaining: &[AccountInfo],
    wallet: &Pubkey,
) -> Result<()> {
    match permissions
        .iter()
        .find(|p| &p.program_id == program)
        .map(|p| &p.access)
    {
        Some(ProgramAccess::Denied) => err!(PhygitalError::ProgramNotAllowed),
        Some(ProgramAccess::AllInstructions) => Ok(()),
        Some(ProgramAccess::Restricted(rules)) => {
            require!(
                rules.iter().any(|rule| rule.matches(ix, remaining, wallet)),
                PhygitalError::InstructionNotAllowed
            );
            Ok(())
        }
        None => {
            require!(
                is_policy_allowed_program(program),
                PhygitalError::ProgramNotAllowed
            );
            Ok(())
        }
    }
}

/// Bounded decoding prevents malformed account lengths from requesting huge Vec
/// allocations. Primitive/enum decoding is Borsh; every variable collection is bounded.
fn value<T: AnchorDeserialize>(input: &mut &[u8]) -> Result<T> {
    T::deserialize(input).map_err(|_| error!(PhygitalError::InvalidAccountData))
}
fn list<T>(
    input: &mut &[u8],
    budget: &mut usize,
    max: usize,
    mut item: impl FnMut(&mut &[u8], &mut usize) -> Result<T>,
) -> Result<Vec<T>> {
    let count: u32 = value(input)?;
    require!(
        count as usize <= max && count as usize <= input.len(),
        PhygitalError::InvalidAccountData
    );
    let cost = (count as usize)
        .checked_mul(core::mem::size_of::<T>())
        .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
    *budget = budget
        .checked_sub(cost)
        .ok_or_else(|| error!(PhygitalError::InvalidAccountData))?;
    let mut result = Vec::with_capacity(count as usize);
    for _ in 0..count {
        result.push(item(input, budget)?);
    }
    Ok(result)
}
fn bytes(input: &mut &[u8], budget: &mut usize) -> Result<Vec<u8>> {
    list(input, budget, MAX_MATCH_BYTES, |input, _| {
        value::<u8>(input)
    })
}
fn constraint(input: &mut &[u8], budget: &mut usize) -> Result<DataConstraint> {
    let offset = value(input)?;
    let predicate = match value::<u8>(input)? {
        0 => DataPredicate::BytesEqual(bytes(input, budget)?),
        1 => DataPredicate::Unsigned {
            width: value(input)?,
            comparison: value(input)?,
            value: value(input)?,
        },
        _ => return err!(PhygitalError::InvalidAccountData),
    };
    Ok(DataConstraint { offset, predicate })
}
fn rule(input: &mut &[u8], budget: &mut usize) -> Result<InstructionRule> {
    Ok(InstructionRule {
        selector: bytes(input, budget)?,
        data_length: value(input)?,
        account_count: value(input)?,
        accounts: list(input, budget, MAX_RULE_CONSTRAINTS, |input, budget| {
            Ok(AccountConstraint {
                index: value(input)?,
                key: value(input)?,
                owner: value(input)?,
                is_signer: value(input)?,
                is_writable: value(input)?,
                data: list(input, budget, MAX_RULE_CONSTRAINTS, constraint)?,
            })
        })?,
        arguments: list(input, budget, MAX_RULE_CONSTRAINTS, constraint)?,
    })
}
pub(crate) fn decode_permissions(mut input: &[u8]) -> Result<Vec<ProgramPermission>> {
    require!(
        input.len() <= MAX_PERMISSION_BYTES,
        PhygitalError::InvalidAccountData
    );
    let mut budget = MAX_PERMISSION_HEAP_BYTES;
    let permissions = list(
        &mut input,
        &mut budget,
        MAX_PROGRAM_PERMISSIONS,
        |input, budget| {
            let program_id = value(input)?;
            let access = match value::<u8>(input)? {
                0 => ProgramAccess::Denied,
                1 => ProgramAccess::AllInstructions,
                2 => ProgramAccess::Restricted(list(input, budget, MAX_INSTRUCTION_RULES, rule)?),
                _ => return err!(PhygitalError::InvalidAccountData),
            };
            Ok(ProgramPermission { program_id, access })
        },
    )?;
    require!(input.is_empty(), PhygitalError::InvalidAccountData);
    validate_permissions(&permissions).map_err(|_| error!(PhygitalError::InvalidAccountData))?;
    Ok(permissions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeric_widths_comparisons_and_short_reads() {
        for width in [
            NumericWidth::U8,
            NumericWidth::U16,
            NumericWidth::U32,
            NumericWidth::U64,
        ] {
            for comparison in [
                Comparison::Equal,
                Comparison::NotEqual,
                Comparison::LessThan,
                Comparison::LessThanOrEqual,
                Comparison::GreaterThan,
                Comparison::GreaterThanOrEqual,
            ] {
                let check = DataConstraint {
                    offset: 1,
                    predicate: DataPredicate::Unsigned {
                        width,
                        comparison,
                        value: 42,
                    },
                };
                for actual in [41u64, 42, 43] {
                    let mut data = vec![255];
                    data.extend_from_slice(&actual.to_le_bytes()[..width.bytes()]);
                    let expected = match comparison {
                        Comparison::Equal => actual == 42,
                        Comparison::NotEqual => actual != 42,
                        Comparison::LessThan => actual < 42,
                        Comparison::LessThanOrEqual => actual <= 42,
                        Comparison::GreaterThan => actual > 42,
                        Comparison::GreaterThanOrEqual => actual >= 42,
                    };
                    assert_eq!(check.matches(&data), expected);
                    data.pop();
                    assert!(!check.matches(&data));
                }
            }
        }
        let bytes = DataConstraint {
            offset: u16::MAX,
            predicate: DataPredicate::BytesEqual(vec![1]),
        };
        assert!(!bytes.matches(&[1]));
    }

    #[test]
    fn bounded_decoder_matches_borsh_and_rejects_every_truncation() {
        let rule = InstructionRule {
            selector: vec![1, 2, 3, 4, 5, 6, 7, 8],
            data_length: None,
            account_count: None,
            accounts: vec![AccountConstraint {
                index: 0,
                key: AccountKeyConstraint::Wallet,
                owner: Some(Pubkey::new_unique()),
                is_signer: Some(true),
                is_writable: Some(false),
                data: vec![DataConstraint {
                    offset: 3,
                    predicate: DataPredicate::BytesEqual(vec![4, 5]),
                }],
            }],
            arguments: vec![DataConstraint {
                offset: 8,
                predicate: DataPredicate::Unsigned {
                    width: NumericWidth::U16,
                    comparison: Comparison::GreaterThan,
                    value: 5,
                },
            }],
        };
        let permissions = vec![
            ProgramPermission {
                program_id: Pubkey::new_unique(),
                access: ProgramAccess::Denied,
            },
            ProgramPermission {
                program_id: Pubkey::new_unique(),
                access: ProgramAccess::AllInstructions,
            },
            ProgramPermission {
                program_id: Pubkey::new_unique(),
                access: ProgramAccess::Restricted(vec![rule]),
            },
        ];
        let mut encoded = vec![];
        permissions.serialize(&mut encoded).unwrap();
        assert_eq!(decode_permissions(&encoded).unwrap(), permissions);
        for length in 0..encoded.len() {
            assert!(
                decode_permissions(&encoded[..length]).is_err(),
                "length {length}"
            );
        }
        encoded.extend_from_slice(&[0]);
        assert!(decode_permissions(&encoded).is_err());
        assert!(decode_permissions(&u32::MAX.to_le_bytes()).is_err());
    }

    #[test]
    fn matcher_resolves_instruction_positions_and_effective_privileges() {
        let key = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut lamports = 0;
        let mut data = [7, 8];
        let account = AccountInfo::new(&key, false, true, &mut lamports, &mut data, &owner, false);
        let remaining = [account];
        let ix = CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![0],
            data: vec![1],
        };
        let mut rule = InstructionRule {
            selector: vec![1],
            data_length: None,
            account_count: None,
            accounts: vec![AccountConstraint {
                index: 0,
                key: AccountKeyConstraint::Wallet,
                owner: Some(owner),
                is_signer: Some(true),
                is_writable: Some(true),
                data: vec![],
            }],
            arguments: vec![],
        };
        assert!(rule.matches(&ix, &remaining, &key)); // PDA gains its signature.
        rule.accounts[0].is_signer = Some(false);
        assert!(!rule.matches(&ix, &remaining, &key));
        rule.accounts[0].is_signer = Some(true);
        rule.accounts[0].is_writable = Some(false);
        assert!(!rule.matches(&ix, &remaining, &key));
        rule.accounts[0].is_writable = Some(true);
        rule.accounts[0].owner = Some(Pubkey::new_unique());
        assert!(!rule.matches(&ix, &remaining, &key));
        rule.accounts[0].owner = Some(owner);
        rule.accounts[0].index = 1;
        assert!(!rule.matches(&ix, &remaining, &key));
        rule.accounts[0].index = 0;
        let invalid = CompactInstruction {
            account_indexes: vec![255],
            ..ix
        };
        assert!(!rule.matches(&invalid, &remaining, &key));
    }
    #[test]
    fn compact_encoding_cannot_exceed_decoded_heap_budget() {
        // Small wire values can expand into large Rust enums/structs. Bound that
        // expansion independently of the encoded byte limit.
        let account = AccountConstraint {
            index: 0,
            key: AccountKeyConstraint::Any,
            owner: None,
            is_signer: None,
            is_writable: None,
            data: vec![],
        };
        let rule = InstructionRule {
            selector: vec![1],
            data_length: None,
            account_count: None,
            accounts: vec![account; MAX_RULE_CONSTRAINTS],
            arguments: vec![],
        };
        let permissions = vec![ProgramPermission {
            program_id: crate::SYSTEM_PROGRAM_ID,
            access: ProgramAccess::Restricted(vec![rule; MAX_INSTRUCTION_RULES]),
        }];
        let mut encoded = vec![];
        permissions.serialize(&mut encoded).unwrap();
        assert!(encoded.len() < MAX_PERMISSION_BYTES);
        assert!(validate_permissions(&permissions).is_err());
        assert!(decode_permissions(&encoded).is_err());
    }
}
