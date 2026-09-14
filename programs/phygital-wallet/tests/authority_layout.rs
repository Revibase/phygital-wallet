//! Account-size, rent, fail-closed decoding and extension lifecycle regressions.
mod common;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{InstructionData, ToAccountMetas};
use common::{assert_tx_err, mint_cap, policy_args, setup_locked_asset, TestContext};
use phygital_wallet::{
    Authority, AuthorityHeader, MintCap, AUTHORITY_VERSION, WALLET_POLICY_VERSION,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn read_header(ctx: &TestContext, asset: Pubkey) -> AuthorityHeader {
    let account = ctx.svm.get_account(&ctx.authority_pda(asset)).unwrap();
    bytemuck::pod_read_unaligned(&account.data[8..Authority::SOL_CAP_OFFSET])
}

struct DecodedPolicy {
    mint_caps: Vec<MintCap>,
}

fn read_policy(ctx: &TestContext, asset: Pubkey) -> DecodedPolicy {
    let account = ctx.svm.get_account(&ctx.authority_pda(asset)).unwrap();
    DecodedPolicy {
        mint_caps: Authority::read_policy(&account.data).unwrap().1.to_vec(),
    }
}

fn set_policy_ix(
    ctx: &TestContext,
    asset: Pubkey,
    authority: Pubkey,
    payer: Pubkey,
) -> Instruction {
    Instruction {
        program_id: ctx.program_id,
        accounts: phygital_wallet::accounts::SetWalletPolicy {
            rent_receiver: ctx.payer.pubkey(),
            authority,
            payer,
            phygital_token: asset,
            authority_account: ctx.authority_pda(asset),
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: phygital_wallet::instruction::SetWalletPolicy {
            args: policy_args(vec![]),
        }
        .data(),
    }
}

fn clear_policy_ix(
    ctx: &TestContext,
    asset: Pubkey,
    authority: Pubkey,
    receiver: Pubkey,
) -> Instruction {
    Instruction {
        program_id: ctx.program_id,
        accounts: phygital_wallet::accounts::ClearWalletPolicy {
            authority,
            phygital_token: asset,
            authority_account: ctx.authority_pda(asset),
            rent_receiver: receiver,
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
        }
        .to_account_metas(None),
        data: phygital_wallet::instruction::ClearWalletPolicy {}.data(),
    }
}

#[test]
fn growth_shrink_and_regrowth_preserve_header_and_refund_original_payer() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    let pda = ctx.authority_pda(asset);
    let before = ctx.svm.get_account(&pda).unwrap();
    assert_eq!(before.data.len(), Authority::BASE_LEN);
    let header = read_header(&ctx, asset);
    assert_eq!(header.version, AUTHORITY_VERSION);
    assert_eq!(header.payer, ctx.payer.pubkey());
    assert_eq!(header.phygital_token, asset);

    // The extension sponsor differs from the original account/rent recipient.
    let sponsor = Keypair::new();
    ctx.svm.airdrop(&sponsor.pubkey(), 1_000_000_000).unwrap();
    let ix = set_policy_ix(&ctx, asset, authority.pubkey(), sponsor.pubkey());
    TestContext::send_instruction(&mut ctx.svm, ix, &[sponsor.pubkey(), authority.pubkey()])
        .unwrap();
    let extended = ctx.svm.get_account(&pda).unwrap();
    let rent: Rent = ctx.svm.get_sysvar();
    // Saving empty settings keeps the default policy at BASE_LEN. The comparison
    // below verifies stable owner identity independently of the policy marker.
    assert_eq!(extended.data.len(), Authority::BASE_LEN);
    assert_eq!(&extended.data[..107], &before.data[..107]);
    assert_eq!(
        extended.lamports,
        rent.minimum_balance(Authority::with_mint_count(0).unwrap())
    );

    let wrong = clear_policy_ix(&ctx, asset, authority.pubkey(), sponsor.pubkey());
    let err =
        TestContext::send_instruction(&mut ctx.svm, wrong, &[sponsor.pubkey(), authority.pubkey()])
            .unwrap_err();
    assert_tx_err(err, &["AuthorityPayerMismatch"]);
    assert_eq!(ctx.svm.get_account(&pda).unwrap(), extended);

    let original_balance = ctx.lamports(ctx.payer.pubkey());
    let clear = clear_policy_ix(&ctx, asset, authority.pubkey(), ctx.payer.pubkey());
    TestContext::send_instruction(&mut ctx.svm, clear, &[sponsor.pubkey(), authority.pubkey()])
        .unwrap();
    let shrunk = ctx.svm.get_account(&pda).unwrap();
    // Clearing returns to BASE_LEN with the header preserved, but as `None`
    // (policy_version 0) — the fresh default is an active empty policy (current version),
    // so the only byte that differs from `before` is policy_version (107).
    assert_eq!(shrunk.data.len(), before.data.len());
    assert_eq!(&shrunk.data[..107], &before.data[..107]);
    assert_eq!(shrunk.data[107], 0);
    assert_eq!(before.data[107], WALLET_POLICY_VERSION);
    assert_eq!(shrunk.lamports, rent.minimum_balance(Authority::BASE_LEN));
    assert_eq!(
        ctx.lamports(ctx.payer.pubkey()) - original_balance,
        extended.lamports - shrunk.lamports
    );

    let mint = ctx.create_payment_mint();
    ctx.set_wallet_policy(asset, &authority, policy_args(vec![mint_cap(mint, 42, 0)]))
        .unwrap();
    assert_eq!(
        &ctx.svm.get_account(&pda).unwrap().data[..107],
        &before.data[..107]
    );
    let policy = read_policy(&ctx, asset);
    assert_eq!(
        read_header(&ctx, asset).policy_version,
        WALLET_POLICY_VERSION
    );
    assert_eq!(read_policy(&ctx, asset).mint_caps.len(), 1);
    assert_eq!(policy.mint_caps[0].cap.remaining, 42);
    assert_eq!(policy.mint_caps.len(), 1);
}

#[test]
fn invalid_policy_does_not_grow_account_and_replacement_clears_old_caps() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    let pda = ctx.authority_pda(asset);
    let before = ctx.svm.get_account(&pda).unwrap();
    let mint = ctx.create_payment_mint();
    let err = ctx
        .set_wallet_policy(asset, &authority, policy_args(vec![mint_cap(mint, 0, 0)]))
        .unwrap_err();
    assert_tx_err(err, &["InvalidPolicyArgs"]);
    assert_eq!(ctx.svm.get_account(&pda).unwrap(), before);

    ctx.set_wallet_policy(asset, &authority, policy_args(vec![mint_cap(mint, 42, 0)]))
        .unwrap();
    let balance = ctx.lamports(pda);
    ctx.set_wallet_policy(asset, &authority, policy_args(vec![]))
        .unwrap();
    assert!(ctx.lamports(pda) < balance);
    let policy = read_policy(&ctx, asset);
    assert_eq!(read_policy(&ctx, asset).mint_caps.len(), 0);
    assert!(policy.mint_caps.is_empty());
    assert_eq!(
        ctx.svm.get_account(&pda).unwrap().data.len(),
        Authority::with_mint_count(0).unwrap()
    );
}

#[test]
fn header_only_passkey_execute_works_and_clear_authority_disables_tap() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    ctx.fund_wallet(asset);
    let recipient = Keypair::new().pubkey();
    ctx.send_execute_lamport_transfer(asset, recipient, 100, &mut passkey)
        .unwrap();
    assert_eq!(ctx.lamports(recipient), 100);
    // Removing the owner closes the account and disables the accessory tap.
    ctx.clear_authority(asset, &authority).unwrap();
    assert!(!ctx.account_exists(ctx.authority_pda(asset)));
    let err = ctx
        .send_execute_lamport_transfer(asset, recipient, 100, &mut passkey)
        .expect_err("tap disabled after owner removal");
    assert_tx_err(err, &["AccessoryDisabled"]);
    assert_eq!(ctx.lamports(recipient), 100);
}

#[test]
fn default_policy_enforces_control_until_explicitly_cleared() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    let source = ctx.create_token_account(ctx.wallet(asset), mint);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    let new_owner = Keypair::new().pubkey();
    let (remaining, compact) = ctx.set_authority_compact(asset, source, new_owner);
    let err = ctx
        .send_execute(asset, compact.clone(), remaining.clone(), &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["TokenAuthorityChanged"]);
    ctx.clear_wallet_policy(asset, &authority).unwrap();
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[])
        .unwrap();
}

#[test]
fn substituted_empty_or_other_token_authority_cannot_hide_policy() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let (mut other_passkey, other_asset) = setup_locked_asset(&mut ctx);
    ctx.set_authority(&mut other_passkey, other_asset, Keypair::new().pubkey())
        .unwrap();
    for substitute in [Keypair::new().pubkey(), ctx.authority_pda(other_asset)] {
        let (slot, _) = common::current_slot_entry(&ctx.svm);
        let mut ix = ctx.execute_ix(
            asset,
            vec![],
            vec![],
            phygital_wallet::Secp256r1VerifyArgs {
                verify_args_relative_index: 0,
                signed_message_index: 0,
                client_data_json: vec![],
            },
            slot,
        );
        let meta = ix
            .accounts
            .iter_mut()
            .find(|a| a.pubkey == ctx.authority_pda(asset))
            .unwrap();
        meta.pubkey = substitute;
        // Resolution must reject before attempting passkey verification: a foreign
        // program-owned authority mismatches the token; an absent/non-program account
        // disables the tap. Either way the policy cannot be hidden.
        let err =
            TestContext::send_instruction(&mut ctx.svm, ix, &[ctx.payer.pubkey()]).unwrap_err();
        assert_tx_err(err, &["AuthorityTokenMismatch", "AccessoryDisabled"]);
    }
}

#[test]
fn malformed_authority_and_policy_fail_closed_without_panicking() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let pda = ctx.authority_pda(asset);
    let original = ctx.svm.get_account(&pda).unwrap();
    // Truncated header, truncated/oversized tail, bad discriminator, header version,
    // policy version and cap count, wrong owner and mismatched token binding.
    for variant in 0..9 {
        let mut account = original.clone();
        let expected = match variant {
            0 => {
                account.data.truncate(20);
                "InvalidAccountData"
            }
            1 => {
                account
                    .data
                    .truncate(Authority::with_mint_count(0).unwrap() - 1);
                "InvalidAccountData"
            }
            2 => {
                account.data.push(0);
                "InvalidAccountData"
            }
            3 => {
                account.data[0] ^= 1;
                "InvalidAccountData"
            }
            4 => {
                account.data[8 + core::mem::offset_of!(AuthorityHeader, version)] = 255;
                "UnsupportedAuthorityVersion"
            }
            5 => {
                account.data[8 + core::mem::offset_of!(AuthorityHeader, policy_version)] = 255;
                "UnsupportedPolicyVersion"
            }
            6 => {
                // Header intact but the SOL cap is cut short: too small for a policy.
                account.data.truncate(Authority::SOL_CAP_OFFSET + 1);
                "InvalidAccountData"
            }
            7 => {
                // Not program-owned ⇒ no present owner ⇒ the tap is disabled.
                account.owner = anchor_lang::system_program::ID;
                "AccessoryDisabled"
            }
            _ => {
                // Header intact and program-owned, but bound to a different token:
                // the token-binding check is what identifies the canonical PDA.
                account.data[8 + core::mem::offset_of!(AuthorityHeader, phygital_token)] ^= 1;
                "AuthorityTokenMismatch"
            }
        };
        ctx.svm.set_account(pda, account).unwrap();
        let res = ctx.send_execute(asset, vec![], vec![], &mut passkey, &[]);
        assert!(res.is_err(), "variant {variant} unexpectedly succeeded");
        assert_tx_err(res.unwrap_err(), &[expected]);
    }
}

#[test]
fn unsupported_policy_can_be_bypassed_or_cleared_by_authority() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let pda = ctx.authority_pda(asset);
    let mut account = ctx.svm.get_account(&pda).unwrap();
    account.data[8 + core::mem::offset_of!(AuthorityHeader, policy_version)] = 255;
    ctx.svm.set_account(pda, account).unwrap();
    ctx.send_execute_with_authority(asset, vec![], vec![], &authority, &[])
        .unwrap();
    ctx.clear_wallet_policy(asset, &authority).unwrap();
    ctx.set_wallet_policy(asset, &authority, policy_args(vec![]))
        .unwrap();
    assert_eq!(
        read_header(&ctx, asset).policy_version,
        WALLET_POLICY_VERSION
    );
}

#[test]
fn merged_authority_cannot_be_writable_in_inner_cpi() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    ctx.fund_wallet(asset);
    let (remaining, compact) = ctx.lamport_transfer_compact(asset, ctx.authority_pda(asset), 1);
    let err = ctx
        .send_execute(asset, compact.clone(), remaining.clone(), &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["ProtectedAccountPrivilege"]);
    let err = ctx
        .send_execute_with_authority(asset, compact, remaining, &authority, &[])
        .unwrap_err();
    assert_tx_err(err, &["ProtectedAccountPrivilege"]);
}

#[test]
fn readonly_authority_rejected_before_policy_charge() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let (slot, _) = common::current_slot_entry(&ctx.svm);
    let mut ix = ctx.execute_ix(
        asset,
        vec![],
        vec![],
        phygital_wallet::Secp256r1VerifyArgs {
            verify_args_relative_index: 0,
            signed_message_index: 0,
            client_data_json: vec![],
        },
        slot,
    );
    let meta = ix
        .accounts
        .iter_mut()
        .find(|a| a.pubkey == ctx.authority_pda(asset))
        .unwrap();
    *meta = AccountMeta::new_readonly(meta.pubkey, false);
    let err = TestContext::send_instruction(&mut ctx.svm, ix, &[ctx.payer.pubkey()]).unwrap_err();
    assert_tx_err(err, &["ConstraintMut"]);
}

#[test]
fn more_than_eight_mints_survive_tail_decode_and_charge() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let caps: Vec<_> = (0..12)
        .map(|_| mint_cap(ctx.create_payment_mint(), 100, 0))
        .collect();
    let mint = caps[11].mint;
    let source = ctx.create_token_account(ctx.wallet(asset), mint);
    let recipient = ctx.create_token_account(Keypair::new().pubkey(), mint);
    ctx.mint_tokens(mint, source, 200);
    ctx.install_policy(&mut passkey, asset, policy_args(caps));
    ctx.send_execute_spl_transfer(asset, mint, source, recipient, 100, &mut passkey)
        .unwrap();
    let policy = read_policy(&ctx, asset);
    assert_eq!(read_policy(&ctx, asset).mint_caps.len(), 12);
    assert_eq!(policy.mint_caps[11].cap.remaining, 0);
    assert_eq!(policy.mint_caps[0].cap.remaining, 100);
    let err = ctx
        .send_execute_spl_transfer(asset, mint, source, recipient, 1, &mut passkey)
        .unwrap_err();
    assert_tx_err(err, &["SpendLimitExceeded"]);
}

#[test]
fn malformed_tail_can_be_cleared_and_extended_account_can_be_closed_and_recreated() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let pda = ctx.authority_pda(asset);
    let mut account = ctx.svm.get_account(&pda).unwrap();
    account.data.truncate(Authority::BASE_LEN + 1);
    ctx.svm.set_account(pda, account).unwrap();
    ctx.clear_wallet_policy(asset, &authority).unwrap();
    ctx.set_wallet_policy(asset, &authority, policy_args(vec![]))
        .unwrap();

    // Use a separate fee payer so the refund assertion is independent of fees.
    let fee_payer = Keypair::new();
    ctx.svm.airdrop(&fee_payer.pubkey(), 1_000_000_000).unwrap();
    let original_balance = ctx.lamports(ctx.payer.pubkey());
    let refund = ctx.lamports(pda);
    let ix = Instruction {
        program_id: ctx.program_id,
        accounts: phygital_wallet::accounts::ClearAuthority {
            authority: authority.pubkey(),
            rent_receiver: ctx.payer.pubkey(),
            phygital_token: asset,
            authority_account: pda,
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
        }
        .to_account_metas(None),
        data: phygital_wallet::instruction::ClearAuthority {}.data(),
    };
    TestContext::send_instruction(&mut ctx.svm, ix, &[fee_payer.pubkey(), authority.pubkey()])
        .unwrap();
    assert_eq!(ctx.lamports(ctx.payer.pubkey()), original_balance + refund);
    assert!(!ctx.account_exists(pda));
    ctx.set_authority(&mut passkey, asset, Keypair::new().pubkey())
        .unwrap();
    assert_eq!(
        ctx.svm.get_account(&pda).unwrap().data.len(),
        Authority::BASE_LEN
    );
}

#[test]
fn copied_header_at_another_address_cannot_authorize_policy_changes() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    let canonical = ctx.authority_pda(asset);
    let original = ctx.svm.get_account(&canonical).unwrap();
    let forged = Keypair::new().pubkey();
    ctx.svm.set_account(forged, original.clone()).unwrap();
    let mut ix = set_policy_ix(&ctx, asset, authority.pubkey(), ctx.payer.pubkey());
    ix.accounts
        .iter_mut()
        .find(|a| a.pubkey == canonical)
        .unwrap()
        .pubkey = forged;
    let err =
        TestContext::send_instruction(&mut ctx.svm, ix, &[ctx.payer.pubkey(), authority.pubkey()])
            .unwrap_err();
    // A valid header at a non-canonical address is rejected: the handler derives
    // the canonical PDA from the stored token+bump and it does not match `forged`.
    assert_tx_err(err, &["AuthorityTokenMismatch"]);
    assert_eq!(ctx.svm.get_account(&canonical).unwrap(), original);
    assert_eq!(ctx.svm.get_account(&forged).unwrap(), original);
}

#[test]
fn header_only_account_rejects_nonzero_policy_metadata() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.set_authority(&mut passkey, asset, Keypair::new().pubkey())
        .unwrap();
    let pda = ctx.authority_pda(asset);
    let original = ctx.svm.get_account(&pda).unwrap();
    for offset in [core::mem::offset_of!(AuthorityHeader, policy_version)] {
        let mut account = original.clone();
        account.data[8 + offset] = 1;
        ctx.svm.set_account(pda, account).unwrap();
        let err = ctx
            .send_execute(asset, vec![], vec![], &mut passkey, &[])
            .unwrap_err();
        assert_tx_err(err, &["UnsupportedPolicyVersion"]);
    }
}

#[test]
fn changing_mint_count_resizes_and_refunds_exact_rent() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    let sponsor = Keypair::new();
    ctx.svm.airdrop(&sponsor.pubkey(), 1_000_000_000).unwrap();
    let pda = ctx.authority_pda(asset);
    let rent: Rent = ctx.svm.get_sysvar();
    for count in [0, 1, 4, 12, 2, 0] {
        let caps: Vec<_> = (0..count)
            .map(|_| mint_cap(Keypair::new().pubkey(), 100, 0))
            .collect();
        let old = ctx.svm.get_account(&pda).unwrap();
        let receiver_before = ctx.lamports(ctx.payer.pubkey());
        let mut ix = set_policy_ix(&ctx, asset, authority.pubkey(), sponsor.pubkey());
        ix.data = phygital_wallet::instruction::SetWalletPolicy {
            args: policy_args(caps.clone()),
        }
        .data();
        TestContext::send_instruction(&mut ctx.svm, ix, &[sponsor.pubkey(), authority.pubkey()])
            .unwrap();
        let after = ctx.svm.get_account(&pda).unwrap();
        assert_eq!(after.data.len(), Authority::with_mint_count(count).unwrap());
        assert_eq!(after.lamports, rent.minimum_balance(after.data.len()));
        assert_eq!(&after.data[..107], &old.data[..107]);
        assert_eq!(
            ctx.lamports(ctx.payer.pubkey()) - receiver_before,
            old.lamports.saturating_sub(after.lamports)
        );
        let decoded = read_policy(&ctx, asset);
        assert_eq!(decoded.mint_caps.len(), count);
        for (actual, expected) in decoded.mint_caps.iter().zip(caps) {
            assert_eq!(actual.mint, expected.mint);
            assert_eq!(actual.cap.remaining, 100);
        }
    }
}

#[test]
fn failed_growth_and_wrong_refund_destination_preserve_policy() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let pda = ctx.authority_pda(asset);
    let before = ctx.svm.get_account(&pda).unwrap();
    let mut caps: Vec<_> = (0..12)
        .map(|_| mint_cap(Keypair::new().pubkey(), 100, 0))
        .collect();
    caps[11].window_seconds = -1;
    let err = ctx
        .set_wallet_policy(asset, &authority, policy_args(caps.clone()))
        .unwrap_err();
    assert_tx_err(err, &["InvalidPolicyArgs"]);
    assert_eq!(ctx.svm.get_account(&pda).unwrap(), before);
    caps[11] = caps[0].clone();
    let err = ctx
        .set_wallet_policy(asset, &authority, policy_args(caps))
        .unwrap_err();
    assert_tx_err(err, &["InvalidPolicyArgs"]);
    assert_eq!(ctx.svm.get_account(&pda).unwrap(), before);
    let mut ix = set_policy_ix(&ctx, asset, authority.pubkey(), ctx.payer.pubkey());
    // Generated account ordering has authority, payer, rent receiver, token, PDA.
    ix.accounts[2].pubkey = Keypair::new().pubkey();
    let err =
        TestContext::send_instruction(&mut ctx.svm, ix, &[ctx.payer.pubkey(), authority.pubkey()])
            .unwrap_err();
    assert_tx_err(err, &["AuthorityPayerMismatch"]);
    assert_eq!(ctx.svm.get_account(&pda).unwrap(), before);
}

#[test]
fn policy_snapshot_tracks_more_than_sixteen_token_accounts() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let remaining: Vec<_> = (0..17)
        .map(|_| {
            let source = ctx.create_token_account(ctx.wallet(asset), mint);
            AccountMeta::new_readonly(source, false)
        })
        .collect();
    ctx.send_execute(asset, vec![], remaining.clone(), &mut passkey, &[])
        .unwrap();
    // The last account still participates in post-CPI delegate checks.
    use anchor_lang::solana_program::program_pack::Pack;
    use anchor_spl::token_2022::spl_token_2022::state::Account as TokenAccount;
    let last = remaining[16].pubkey;
    let mut account = ctx.svm.get_account(&last).unwrap();
    let mut token = TokenAccount::unpack(&account.data).unwrap();
    token.delegate = Some(Keypair::new().pubkey()).into();
    token.delegated_amount = 1;
    TokenAccount::pack(token, &mut account.data).unwrap();
    ctx.svm.set_account(last, account).unwrap();
    let err = ctx
        .send_execute(asset, vec![], remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["DelegationNotAllowed"]);
}

#[test]
fn decoding_does_not_truncate_mint_count_to_u8() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    let source = ctx.create_token_account(ctx.wallet(asset), mint);
    let recipient = ctx.create_token_account(Keypair::new().pubkey(), mint);
    ctx.mint_tokens(mint, source, 101);
    ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    // Fixture-inject a large valid policy to test execution independently of the
    // transaction packet limit on submitting a full replacement configuration.
    let pda = ctx.authority_pda(asset);
    let mut account = ctx.svm.get_account(&pda).unwrap();
    let caps: Vec<_> = (0..300)
        .map(|i| MintCap {
            mint: if i == 299 {
                mint
            } else {
                Keypair::new().pubkey()
            },
            cap: phygital_wallet::SpendCap {
                cap: 100,
                remaining: 100,
                last_reset: 0,
                window_seconds: 0,
            },
        })
        .collect();
    account.data.truncate(Authority::MINTS_OFFSET);
    account.data.extend_from_slice(bytemuck::cast_slice(&caps));
    account.data.extend_from_slice(&0u32.to_le_bytes());
    // Update the Borsh Vec length prefix (immediately before the mint array) to
    // match the injected count — this is what the decoder validates against.
    account.data[Authority::MINTS_OFFSET - 4..Authority::MINTS_OFFSET]
        .copy_from_slice(&(caps.len() as u32).to_le_bytes());
    let rent: Rent = ctx.svm.get_sysvar();
    account.lamports = rent.minimum_balance(account.data.len());
    ctx.svm.set_account(pda, account).unwrap();
    ctx.send_execute_spl_transfer(asset, mint, source, recipient, 100, &mut passkey)
        .unwrap();
    let decoded = read_policy(&ctx, asset);
    assert_eq!(decoded.mint_caps.len(), 300);
    assert_eq!(decoded.mint_caps[299].cap.remaining, 0);
    let err = ctx
        .send_execute_spl_transfer(asset, mint, source, recipient, 1, &mut passkey)
        .unwrap_err();
    assert_tx_err(err, &["SpendLimitExceeded"]);
}

#[test]
fn sparse_spend_totals_aggregate_multiple_sources_for_a_late_mint() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let caps: Vec<_> = (0..12)
        .map(|_| mint_cap(ctx.create_payment_mint(), 100, 0))
        .collect();
    let mint = caps[11].mint;
    let first = ctx.create_token_account(ctx.wallet(asset), mint);
    let second = ctx.create_token_account(ctx.wallet(asset), mint);
    let recipient = ctx.create_token_account(Keypair::new().pubkey(), mint);
    ctx.mint_tokens(mint, first, 100);
    ctx.mint_tokens(mint, second, 100);
    ctx.install_policy(&mut passkey, asset, policy_args(caps));
    for amount in [50, 40] {
        let (mut remaining, mut compact) =
            ctx.spl_transfer_compact(asset, mint, first, recipient, 60, 6);
        let (other_accounts, mut other_compact) =
            ctx.spl_transfer_compact(asset, mint, second, recipient, amount, 6);
        let offset = remaining.len() as u8;
        for ix in &mut other_compact {
            ix.program_id_index += offset;
            for index in &mut ix.account_indexes {
                *index += offset;
            }
        }
        remaining.extend(other_accounts);
        compact.extend(other_compact);
        let result = ctx.send_execute(asset, compact, remaining, &mut passkey, &[]);
        if amount == 50 {
            assert_tx_err(result.unwrap_err(), &["SpendLimitExceeded"]);
            assert_eq!(ctx.token_balance(recipient), 0);
            assert_eq!(read_policy(&ctx, asset).mint_caps[11].cap.remaining, 100);
        } else {
            result.unwrap();
            assert_eq!(ctx.token_balance(recipient), 100);
            assert_eq!(read_policy(&ctx, asset).mint_caps[11].cap.remaining, 0);
        }
    }
}

#[test]
fn authority_filter_and_token_slice_work_across_account_sizes() {
    let mut ctx = TestContext::new();
    let authority = Keypair::new();
    let mut accounts = vec![];
    let mut expected = vec![];
    for i in 0..3 {
        let (mut passkey, token) = setup_locked_asset(&mut ctx);
        let signer = if i < 2 {
            authority.pubkey()
        } else {
            Keypair::new().pubkey()
        };
        ctx.set_authority(&mut passkey, token, signer).unwrap();
        if i == 1 {
            ctx.set_wallet_policy(
                token,
                &authority,
                policy_args(vec![mint_cap(Keypair::new().pubkey(), 100, 0)]),
            )
            .unwrap();
        }
        if i < 2 {
            expected.push(token);
        }
        accounts.push(ctx.svm.get_account(&ctx.authority_pda(token)).unwrap());
    }
    assert_eq!(accounts[0].data.len(), Authority::BASE_LEN);
    assert_eq!(
        accounts[1].data.len(),
        Authority::with_mint_count(1).unwrap()
    );
    // Mirror GPA's discriminator and authority memcmp filters, then dataSlice.
    use anchor_lang::Discriminator;
    let tokens: Vec<Pubkey> = accounts
        .iter()
        .filter(|a| {
            a.owner == ctx.program_id
                && &a.data[..8] == Authority::DISCRIMINATOR
                && &a.data[8..40] == authority.pubkey().as_ref()
        })
        .map(|a| Pubkey::try_from(&a.data[40..72]).unwrap())
        .collect();
    assert_eq!(tokens, expected);
}

#[test]
fn corrupted_stored_token_is_rejected_even_at_canonical_pda() {
    let mut ctx = TestContext::new();
    let (mut passkey, token) = setup_locked_asset(&mut ctx);
    ctx.set_authority(&mut passkey, token, Keypair::new().pubkey())
        .unwrap();
    let pda = ctx.authority_pda(token);
    let mut account = ctx.svm.get_account(&pda).unwrap();
    account.data[40..72].copy_from_slice(Keypair::new().pubkey().as_ref());
    ctx.svm.set_account(pda, account).unwrap();
    let err = ctx
        .send_execute(token, vec![], vec![], &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["AuthorityTokenMismatch"]);
}
