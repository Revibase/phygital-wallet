mod common;

use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use common::{assert_tx_err, mint_cap, setup_locked_asset, TestContext};
use phygital_wallet::{
    AccountConstraint, AccountKeyConstraint, Authority, Comparison, DataConstraint, DataPredicate,
    InstructionRule, NumericWidth, ProgramAccess, ProgramPermission, SolCapArg, WalletPolicyArgs,
    SYSTEM_PROGRAM_ID, TOKEN_2022_PROGRAM_ID,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn account(index: u8, key: AccountKeyConstraint) -> AccountConstraint {
    AccountConstraint {
        index,
        key,
        owner: None,
        is_signer: None,
        is_writable: None,
        data: vec![],
    }
}
fn numeric(offset: u16, value: u64, comparison: Comparison) -> DataConstraint {
    DataConstraint {
        offset,
        predicate: DataPredicate::Unsigned {
            width: NumericWidth::U64,
            comparison,
            value,
        },
    }
}
fn system_rule(recipient: Pubkey, max: u64) -> InstructionRule {
    InstructionRule {
        selector: 2u32.to_le_bytes().to_vec(), // SystemInstruction::Transfer
        data_length: Some(12),
        account_count: Some(2),
        accounts: vec![
            AccountConstraint {
                is_signer: Some(true),
                is_writable: Some(true),
                ..account(0, AccountKeyConstraint::Wallet)
            },
            account(1, AccountKeyConstraint::Address(recipient)),
        ],
        arguments: vec![numeric(4, max, Comparison::LessThanOrEqual)],
    }
}
fn policy(program_id: Pubkey, access: ProgramAccess) -> WalletPolicyArgs {
    WalletPolicyArgs {
        program_permissions: vec![ProgramPermission { program_id, access }],
        ..Default::default()
    }
}

#[test]
fn restricted_system_replaces_baseline_and_authority_can_bypass() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let merchant = Pubkey::new_unique();
    let stranger = Pubkey::new_unique();
    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        policy(
            SYSTEM_PROGRAM_ID,
            ProgramAccess::Restricted(vec![system_rule(merchant, 100)]),
        ),
    );
    ctx.fund_wallet(asset);
    ctx.send_execute_lamport_transfer(asset, merchant, 100, &mut passkey)
        .unwrap();
    for (recipient, amount) in [(stranger, 1), (merchant, 101)] {
        let err = ctx
            .send_execute_lamport_transfer(asset, recipient, amount, &mut passkey)
            .unwrap_err();
        assert_tx_err(err, &["InstructionNotAllowed"]);
    }
    let (remaining, mut ix) = ctx.lamport_transfer_compact(asset, merchant, 1);
    ix[0].data[..4].copy_from_slice(&1u32.to_le_bytes()); // Assign is never authorized.
    let err = ctx
        .send_execute(asset, ix, remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["InstructionNotAllowed"]);
    let (remaining, ix) = ctx.lamport_transfer_compact(asset, stranger, 1);
    ctx.send_execute_with_authority(asset, ix, remaining, &authority, &[])
        .unwrap();
    assert_eq!(ctx.lamports(merchant), 100);
    assert_eq!(ctx.lamports(stranger), 1);
}

#[test]
fn denied_baseline_and_restore_defaults() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        policy(SYSTEM_PROGRAM_ID, ProgramAccess::Denied),
    );
    ctx.fund_wallet(asset);
    let recipient = Pubkey::new_unique();
    let err = ctx
        .send_execute_lamport_transfer(asset, recipient, 1, &mut passkey)
        .unwrap_err();
    assert_tx_err(err, &["ProgramNotAllowed"]);
    ctx.set_wallet_policy(asset, &authority, WalletPolicyArgs::default())
        .unwrap();
    ctx.send_execute_lamport_transfer(asset, recipient, 1, &mut passkey)
        .unwrap();
}

#[test]
fn rules_are_or_conditions_are_and_and_batch_failure_rolls_back() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let a = Pubkey::new_unique();
    let b = Pubkey::new_unique();
    ctx.install_policy(
        &mut passkey,
        asset,
        policy(
            SYSTEM_PROGRAM_ID,
            ProgramAccess::Restricted(vec![system_rule(a, 100), system_rule(b, 10)]),
        ),
    );
    ctx.fund_wallet(asset);
    ctx.send_execute_lamport_transfer(asset, b, 10, &mut passkey)
        .unwrap();
    // Cannot combine the recipient from rule B with the larger amount from rule A.
    let err = ctx
        .send_execute_lamport_transfer(asset, b, 50, &mut passkey)
        .unwrap_err();
    assert_tx_err(err, &["InstructionNotAllowed"]);
    let (remaining, mut batch) = ctx.lamport_transfer_compact(asset, a, 10);
    let mut bad = batch[0].clone();
    bad.data[4..].copy_from_slice(&101u64.to_le_bytes());
    batch.push(bad);
    let err = ctx
        .send_execute(asset, batch, remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["InstructionNotAllowed"]);
    assert_eq!(ctx.lamports(a), 0);
}

#[test]
fn instruction_permission_never_bypasses_aggregate_spending_cap() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let merchant = Pubkey::new_unique();
    let mut args = policy(
        SYSTEM_PROGRAM_ID,
        ProgramAccess::Restricted(vec![system_rule(merchant, 100)]),
    );
    args.sol_cap = Some(SolCapArg {
        cap: 100,
        window_seconds: 86_400,
    });
    ctx.install_policy(&mut passkey, asset, args);
    ctx.fund_wallet(asset);
    let (remaining, mut batch) = ctx.lamport_transfer_compact(asset, merchant, 60);
    batch.push(batch[0].clone());
    let err = ctx
        .send_execute(asset, batch, remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["SpendLimitExceeded"]);
    assert_eq!(ctx.lamports(merchant), 0);
}

#[test]
fn token_rules_check_mint_destination_owner_and_account_data() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    let source = ctx.create_token_account(ctx.wallet(asset), mint);
    let merchant = Pubkey::new_unique();
    let destination = ctx.create_token_account(merchant, mint);
    let stranger = ctx.create_token_account(Pubkey::new_unique(), mint);
    ctx.mint_tokens(mint, source, 500);
    let owner_check = AccountConstraint {
        owner: Some(TOKEN_2022_PROGRAM_ID),
        data: vec![DataConstraint {
            offset: 32,
            predicate: DataPredicate::BytesEqual(merchant.to_bytes().to_vec()),
        }],
        ..account(2, AccountKeyConstraint::Any)
    };
    let rule = InstructionRule {
        selector: vec![12], // TransferChecked
        data_length: Some(10),
        account_count: Some(4),
        accounts: vec![
            account(1, AccountKeyConstraint::Address(mint)),
            owner_check,
            AccountConstraint {
                is_signer: Some(true),
                ..account(3, AccountKeyConstraint::Wallet)
            },
        ],
        arguments: vec![numeric(1, 100, Comparison::LessThanOrEqual)],
    };
    let mut args = policy(TOKEN_2022_PROGRAM_ID, ProgramAccess::Restricted(vec![rule]));
    args.mint_caps = vec![mint_cap(mint, 300, 0)];
    let authority = ctx.install_policy(&mut passkey, asset, args);
    ctx.send_execute_spl_transfer(asset, mint, source, destination, 100, &mut passkey)
        .unwrap();
    let err = ctx
        .send_execute_spl_transfer(asset, mint, source, stranger, 1, &mut passkey)
        .unwrap_err();
    assert_tx_err(err, &["InstructionNotAllowed"]);
    let (remaining, ix) = ctx.approve_compact(asset, mint, source, merchant, 1, 6);
    let err = ctx
        .send_execute(asset, ix, remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["InstructionNotAllowed"]);
    // Even explicitly broad access cannot disable the standing-delegate invariant.
    ctx.set_wallet_policy(
        asset,
        &authority,
        policy(TOKEN_2022_PROGRAM_ID, ProgramAccess::AllInstructions),
    )
    .unwrap();
    let (remaining, ix) = ctx.approve_compact(asset, mint, source, merchant, 1, 6);
    let err = ctx
        .send_execute(asset, ix, remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["DelegationNotAllowed"]);
    assert_eq!(ctx.token_balance(destination), 100);
}

#[test]
fn truncated_payload_and_missing_or_extra_accounts_fail_closed() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let merchant = Pubkey::new_unique();
    ctx.install_policy(
        &mut passkey,
        asset,
        policy(
            SYSTEM_PROGRAM_ID,
            ProgramAccess::Restricted(vec![system_rule(merchant, 100)]),
        ),
    );
    ctx.fund_wallet(asset);
    for variant in 0..4 {
        let (remaining, mut ix) = ctx.lamport_transfer_compact(asset, merchant, 1);
        match variant {
            0 => {
                ix[0].data.truncate(3);
            }
            1 => {
                ix[0].data.truncate(8);
            }
            2 => {
                ix[0].account_indexes.pop();
            }
            _ => {
                ix[0].account_indexes.push(1);
            }
        }
        let err = ctx
            .send_execute(asset, ix, remaining, &mut passkey, &[])
            .unwrap_err();
        assert_tx_err(err, &["InstructionNotAllowed"]);
    }
}

#[test]
fn invalid_configuration_is_atomic() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    let original = ctx.svm.get_account(&ctx.authority_pda(asset)).unwrap();
    for variant in 0..7 {
        let mut rule = system_rule(Pubkey::new_unique(), 100);
        match variant {
            0 => rule.selector.clear(),
            1 => rule.selector = vec![0; 65],
            2 => rule.data_length = Some(3),
            3 => rule.accounts[0].index = 2,
            4 => rule.arguments[0].offset = u16::MAX,
            5 => rule.accounts[0].data.push(numeric(0, 1, Comparison::Equal)), // missing owner
            _ => {
                rule.arguments[0].predicate = DataPredicate::Unsigned {
                    width: NumericWidth::U8,
                    comparison: Comparison::Equal,
                    value: 256,
                }
            }
        }
        let err = ctx
            .set_wallet_policy(
                asset,
                &authority,
                policy(SYSTEM_PROGRAM_ID, ProgramAccess::Restricted(vec![rule])),
            )
            .unwrap_err();
        assert_tx_err(err, &["InvalidPolicyArgs"]);
        assert_eq!(
            ctx.svm.get_account(&ctx.authority_pda(asset)).unwrap(),
            original
        );
    }
    for mut args in [
        policy(SYSTEM_PROGRAM_ID, ProgramAccess::Restricted(vec![])),
        policy(phygital_wallet::ID, ProgramAccess::AllInstructions),
        policy(SYSTEM_PROGRAM_ID, ProgramAccess::Denied),
    ] {
        if args.program_permissions[0].access == ProgramAccess::Denied {
            args.program_permissions
                .push(args.program_permissions[0].clone());
        }
        let err = ctx.set_wallet_policy(asset, &authority, args).unwrap_err();
        assert_tx_err(err, &["InvalidPolicyArgs"]);
        assert_eq!(
            ctx.svm.get_account(&ctx.authority_pda(asset)).unwrap(),
            original
        );
    }
}

#[test]
fn borsh_roundtrip_rent_refund_and_malformed_rule_recovery() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let args = policy(
        SYSTEM_PROGRAM_ID,
        ProgramAccess::Restricted(vec![system_rule(Pubkey::new_unique(), 100)]),
    );
    let expected = args.program_permissions.clone();
    let authority = ctx.install_policy(&mut passkey, asset, args);
    let pda = ctx.authority_pda(asset);
    let original = ctx.svm.get_account(&pda).unwrap();
    let decoded = Authority::try_deserialize(&mut original.data.as_slice()).unwrap();
    assert_eq!(decoded.program_permissions, expected);
    assert_eq!(Authority::read_policy(&original.data).unwrap().2, expected);
    for variant in 0..4 {
        let mut broken = original.clone();
        match variant {
            0 => broken.data[Authority::MINTS_OFFSET..Authority::MINTS_OFFSET + 4]
                .copy_from_slice(&u32::MAX.to_le_bytes()),
            1 => broken.data[Authority::MINTS_OFFSET + 4 + 32] = 255, // permission enum
            2 => {
                broken.data.pop();
            }
            _ => broken.data.push(0),
        }
        ctx.svm.set_account(pda, broken).unwrap();
        let err = ctx
            .send_execute(asset, vec![], vec![], &mut passkey, &[])
            .unwrap_err();
        assert_tx_err(err, &["InvalidAccountData"]);
        ctx.send_execute_with_authority(asset, vec![], vec![], &authority, &[])
            .unwrap();
    }
    ctx.clear_wallet_policy(asset, &authority).unwrap();
    let cleared = ctx.svm.get_account(&pda).unwrap();
    assert_eq!(cleared.data.len(), Authority::BASE_LEN);
    assert!(cleared.lamports < original.lamports);
    assert!(!Authority::read(&cleared.data).unwrap().1);
    ctx.set_wallet_policy(asset, &authority, WalletPolicyArgs::default())
        .unwrap();
    assert!(
        Authority::read(&ctx.svm.get_account(&pda).unwrap().data)
            .unwrap()
            .1
    );
}

#[test]
fn account_predicates_see_previous_instruction_effects() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    let source = ctx.create_token_account(ctx.wallet(asset), mint);
    let dest = ctx.create_token_account(Pubkey::new_unique(), mint);
    ctx.mint_tokens(mint, source, 100);
    let rule = InstructionRule {
        selector: vec![12],
        data_length: Some(10),
        account_count: Some(4),
        accounts: vec![AccountConstraint {
            owner: Some(TOKEN_2022_PROGRAM_ID),
            data: vec![numeric(64, 100, Comparison::GreaterThanOrEqual)],
            ..account(0, AccountKeyConstraint::Address(source))
        }],
        arguments: vec![],
    };
    ctx.install_policy(
        &mut passkey,
        asset,
        policy(TOKEN_2022_PROGRAM_ID, ProgramAccess::Restricted(vec![rule])),
    );
    let (remaining, mut batch) = ctx.spl_transfer_compact(asset, mint, source, dest, 10, 6);
    batch.push(batch[0].clone());
    let err = ctx
        .send_execute(asset, batch, remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["InstructionNotAllowed"]);
    assert_eq!(ctx.token_balance(source), 100);
    assert_eq!(ctx.token_balance(dest), 0);
}

#[test]
fn legacy_version_and_inconsistent_absent_policy_fail_closed_but_can_be_cleared() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(&mut passkey, asset, WalletPolicyArgs::default());
    let pda = ctx.authority_pda(asset);
    let original = ctx.svm.get_account(&pda).unwrap();
    for version in [7, 0] {
        let mut broken = original.clone();
        Authority::read_header_mut(&mut broken.data)
            .unwrap()
            .policy_version = version;
        if version == 0 {
            broken.data[Authority::SOL_CAP_OFFSET] = 1;
        }
        ctx.svm.set_account(pda, broken).unwrap();
        let err = ctx
            .send_execute(asset, vec![], vec![], &mut passkey, &[])
            .unwrap_err();
        assert_tx_err(
            err,
            &[if version == 7 {
                "UnsupportedPolicyVersion"
            } else {
                "InvalidAccountData"
            }],
        );
        ctx.clear_wallet_policy(asset, &authority).unwrap();
        assert!(
            !Authority::read(&ctx.svm.get_account(&pda).unwrap().data)
                .unwrap()
                .1
        );
    }
}
