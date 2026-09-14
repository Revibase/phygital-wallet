mod common;

use anchor_lang::solana_program::system_instruction;
use common::{
    assert_tx_err, build_execute_challenge, current_slot_entry, mint_cap, policy_args,
    setup_locked_asset, setup_locked_execute, TestContext, TEST_RP_ID,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Passkey execute with an owner set but no spending caps is open: an SPL transfer
/// succeeds. (The tap requires a present owner; caps are optional.)
#[test]
fn passkey_execute_no_policy_transfers() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);
    ctx.set_authority(&mut passkey, asset, Keypair::new().pubkey())
        .expect("set owner");

    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, amount, &mut passkey)
        .expect("execute");

    assert_eq!(ctx.token_balance(recipient_token), amount);
    assert_eq!(ctx.token_balance(sender), 0);
}

/// Passkey execute of a wallet-funded SOL transfer (owner set, no SOL cap).
#[test]
fn passkey_execute_lamport_transfer() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.set_authority(&mut passkey, asset, Keypair::new().pubkey())
        .expect("set owner");
    ctx.fund_wallet(asset);
    let recipient = Keypair::new().pubkey();

    ctx.send_execute_lamport_transfer(asset, recipient, 100_000, &mut passkey)
        .expect("execute");

    assert_eq!(ctx.lamports(recipient), 100_000);
}

/// With no owner set, the accessory tap is disabled: passkey execute is rejected.
#[test]
fn passkey_execute_without_owner_disabled() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);

    let err = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, amount, &mut passkey)
        .expect_err("no owner disables the tap");
    assert_tx_err(err, &["AccessoryDisabled"]);
    assert_eq!(ctx.token_balance(recipient_token), 0);
}

/// Removing the owner disables the accessory: a tap that worked before `clear_authority`
/// fails afterwards, even though the wallet still holds funds and allowance.
#[test]
fn clear_authority_disables_accessory() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);
    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, amount, 0)]),
    );

    // Works while the owner is set.
    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 1, &mut passkey)
        .expect("tap works with owner");
    assert_eq!(ctx.token_balance(recipient_token), 1);

    // Remove the owner; the tap is now disabled (funds and allowance still remain).
    ctx.clear_authority(asset, &authority).expect("clear owner");
    let err = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, 1, &mut passkey)
        .expect_err("removing the owner disables the tap");
    assert_tx_err(err, &["AccessoryDisabled"]);
    assert_eq!(ctx.token_balance(recipient_token), 1);
}

/// Passkey execute without the secp256r1 precompile instruction is rejected by
/// the verify CPI (no valid accessory proof).
#[test]
fn execute_without_passkey_proof_fails() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);

    let (remaining, compact) =
        ctx.spl_transfer_compact(asset, mint, sender, recipient_token, amount, 6);
    // include_secp_ix = false → the phygital-token verify CPI cannot find a proof.
    let err = ctx
        .send_execute_opts(
            asset,
            compact,
            remaining,
            &mut passkey,
            &[],
            false,
            None,
            None,
            TEST_RP_ID,
            common::TEST_ORIGIN,
        )
        .expect_err("must fail without a passkey proof");
    // Any hard failure is acceptable; the transfer must not land.
    let _ = err;
    assert_eq!(ctx.token_balance(recipient_token), 0);
}

/// Replaying the same passkey proof (same signCount) is rejected on-chain by the
/// phygital-token verify CPI — no verifier co-signer needed for replay safety.
#[test]
fn passkey_execute_replay_rejected() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);
    ctx.set_authority(&mut passkey, asset, Keypair::new().pubkey())
        .expect("set owner");

    let (remaining, compact) = ctx.spl_transfer_compact(asset, mint, sender, recipient_token, 1, 6);
    let (slot_number, slot_hash) = current_slot_entry(&ctx.svm);
    let remaining_keys: Vec<_> = remaining.iter().map(|m| m.pubkey).collect();
    let challenge = build_execute_challenge(slot_hash, &compact, &remaining_keys);
    let (secp_ix, verify_args) =
        passkey.verify_asset_secp256r1_instruction_with_rp_id(challenge, TEST_RP_ID);

    let exec_ix = ctx.execute_ix(
        asset,
        compact.clone(),
        remaining.clone(),
        verify_args.clone(),
        slot_number,
    );
    TestContext::send_instructions(
        &mut ctx.svm,
        &[secp_ix.clone(), exec_ix],
        &[ctx.payer.pubkey()],
    )
    .expect("first execute");

    // Reuse the identical passkey proof (same signCount) → stale.
    let exec_ix2 = ctx.execute_ix(asset, compact, remaining, verify_args, slot_number);
    let err =
        TestContext::send_instructions(&mut ctx.svm, &[secp_ix, exec_ix2], &[ctx.payer.pubkey()])
            .expect_err("replay must fail");
    assert_tx_err(err, &["signCount", "6007", "0x1777"]);
}

/// A durable-nonce transaction is rejected on the authority path (which relies on
/// blockhash freshness). The passkey path is exempt — it is bounded by slot_hash.
#[test]
fn durable_nonce_rejected_on_authority_path() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);
    let authority =
        ctx.install_policy(&mut passkey, asset, policy_args(vec![mint_cap(mint, 1, 0)]));

    // Create + initialize a durable nonce account (authority = payer).
    let nonce = Keypair::new();
    let rent: anchor_lang::prelude::Rent = ctx.svm.get_sysvar();
    let nonce_lamports = rent.minimum_balance(80).max(2_000_000);
    let create_ixs = system_instruction::create_nonce_account(
        &ctx.payer.pubkey(),
        &nonce.pubkey(),
        &ctx.payer.pubkey(),
        nonce_lamports,
    );
    TestContext::send_instructions(
        &mut ctx.svm,
        &create_ixs,
        &[ctx.payer.pubkey(), nonce.pubkey()],
    )
    .expect("create nonce");

    // Authority execute with an AdvanceNonceAccount prepended as instruction 0.
    let (remaining, compact) =
        ctx.spl_transfer_compact(asset, mint, sender, recipient_token, amount, 6);
    let exec_ix = ctx.execute_authority_ix(asset, authority.pubkey(), compact, remaining);
    let advance = system_instruction::advance_nonce_account(&nonce.pubkey(), &ctx.payer.pubkey());
    let err = TestContext::send_instructions(
        &mut ctx.svm,
        &[advance, exec_ix],
        &[ctx.payer.pubkey(), authority.pubkey()],
    )
    .expect_err("durable nonce must be rejected");
    assert_tx_err(err, &["DurableNonceNotAllowed", "6011"]);
}

/// The authority signature skips policy: an over-cap transfer still lands.
#[test]
fn authority_execute_bypasses_policy() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);

    // Cap far below the transfer.
    let authority =
        ctx.install_policy(&mut passkey, asset, policy_args(vec![mint_cap(mint, 1, 0)]));

    let (remaining, compact) =
        ctx.spl_transfer_compact(asset, mint, sender, recipient_token, amount, 6);
    ctx.send_execute_with_authority(asset, compact, remaining, &authority, &[])
        .expect("authority execute");

    assert_eq!(ctx.token_balance(recipient_token), amount);
}

/// A non-authority signer on the authority path is rejected.
#[test]
fn authority_execute_wrong_key_fails() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);
    ctx.install_policy(&mut passkey, asset, policy_args(vec![mint_cap(mint, 1, 0)]));

    let (remaining, compact) =
        ctx.spl_transfer_compact(asset, mint, sender, recipient_token, amount, 6);
    let imposter = Keypair::new();
    let err = ctx
        .send_execute_with_authority(asset, compact, remaining, &imposter, &[])
        .expect_err("imposter must fail");
    assert_tx_err(
        err,
        &["AuthorityMismatch", "6018", "ConstraintSeeds", "2006"],
    );
}
