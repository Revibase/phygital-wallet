mod common;

use common::{assert_tx_err, mint_cap, policy_args, setup_locked_asset, TestContext};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// `set_authority` succeeds once; a second attempt collides (init-once).
#[test]
fn set_authority_is_once_only() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();

    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .expect("first set");

    let err = ctx
        .set_authority(&mut passkey, asset, Keypair::new().pubkey())
        .expect_err("second set must fail");
    assert_tx_err(err, &["already in use", "0x0", "custom program error"]);
}

/// `clear_authority` requires the current authority key.
#[test]
fn clear_authority_wrong_key_fails() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .expect("set");

    let imposter = Keypair::new();
    let err = ctx
        .clear_authority(asset, &imposter)
        .expect_err("imposter clear must fail");
    assert_tx_err(
        err,
        &["AuthorityMismatch", "ConstraintSeeds", "6015", "2006"],
    );
}

/// Clearing the authority closes the header and its policy extension.
#[test]
fn clear_authority_closes_policy() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();

    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 0)]),
    );

    assert!(ctx.account_exists(ctx.authority_pda(asset)));
    assert_eq!(
        ctx.svm
            .get_account(&ctx.authority_pda(asset))
            .unwrap()
            .data
            .len(),
        phygital_wallet::Authority::with_mint_count(1).unwrap()
    );

    ctx.clear_authority(asset, &authority).expect("clear");

    assert!(!ctx.account_exists(ctx.authority_pda(asset)));
}

/// `clear_wallet_policy` shrinks to the authority header.
#[test]
fn clear_wallet_policy_keeps_authority() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();

    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 0)]),
    );

    ctx.clear_wallet_policy(asset, &authority)
        .expect("clear policy");

    assert!(ctx.account_exists(ctx.authority_pda(asset)));

    assert_eq!(
        ctx.svm
            .get_account(&ctx.authority_pda(asset))
            .unwrap()
            .data
            .len(),
        phygital_wallet::Authority::BASE_LEN
    );

    // Authority can re-create a policy afterwards.
    ctx.set_wallet_policy(asset, &authority, policy_args(vec![mint_cap(mint, 200, 0)]))
        .expect("re-set policy");
    assert_eq!(
        ctx.svm
            .get_account(&ctx.authority_pda(asset))
            .unwrap()
            .data
            .len(),
        phygital_wallet::Authority::with_mint_count(1).unwrap()
    );
}

/// Only the authority may set a policy.
#[test]
fn set_wallet_policy_requires_authority() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .expect("set authority");

    let imposter = Keypair::new();
    let err = ctx
        .set_wallet_policy(asset, &imposter, policy_args(vec![mint_cap(mint, 100, 0)]))
        .expect_err("imposter policy must fail");
    assert_tx_err(
        err,
        &["AuthorityMismatch", "6015", "ConstraintSeeds", "2006"],
    );
}
