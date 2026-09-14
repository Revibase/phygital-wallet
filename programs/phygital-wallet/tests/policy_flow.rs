mod common;

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::AccountMeta;
use common::{assert_tx_err, mint_cap, policy_args, setup_locked_asset, TestContext, TestPasskey};
use phygital_wallet::{CompactInstruction, SolCapArg, WalletPolicyArgs, WSOL_MINT, WSOL_MINT_2022};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Locked asset + a payment mint with a generous delegate approval so multiple
/// executes can run. Returns (passkey, asset, mint, sender, recipient_token).
fn setup(ctx: &mut TestContext, total: u64) -> (TestPasskey, Pubkey, Pubkey, Pubkey, Pubkey) {
    let (passkey, asset) = setup_locked_asset(ctx);
    let owner = Keypair::new();
    let recipient = Keypair::new().pubkey();
    let mint = ctx.create_payment_mint();
    let sender = ctx.create_token_account(owner.pubkey(), mint);
    let recipient_token = ctx.create_token_account(recipient, mint);
    ctx.mint_tokens(mint, sender, total);
    ctx.approve_delegate(&owner, asset, mint, sender, total, 6);
    (passkey, asset, mint, sender, recipient_token)
}

/// A lifetime cap (zero window): within-cap succeeds, over-cap is denied.
#[test]
fn lifetime_cap_enforced() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, sender, recipient_token) = setup(&mut ctx, 1_000_000);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 0)]),
    );

    let err = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, 200, &mut passkey)
        .expect_err("over cap");
    assert_tx_err(err, &["SpendLimitExceeded", "6023"]);

    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect("within cap");
    assert_eq!(ctx.token_balance(recipient_token), 100);
}

/// The cap is an aggregate across all transfers in one execute.
#[test]
fn aggregate_cap_enforced() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, sender, _recipient_token) = setup(&mut ctx, 1_000_000);
    let recip_a = ctx.create_token_account(Keypair::new().pubkey(), mint);
    let recip_b = ctx.create_token_account(Keypair::new().pubkey(), mint);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 150, 0)]),
    );

    let (remaining, compact) =
        ctx.dual_spl_transfer_compact(asset, mint, sender, recip_a, recip_b, 100, 100, 6);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect_err("aggregate over cap");
    assert_tx_err(err, &["SpendLimitExceeded", "6023"]);

    let (remaining, compact) =
        ctx.dual_spl_transfer_compact(asset, mint, sender, recip_a, recip_b, 50, 50, 6);
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect("aggregate within cap");
    assert_eq!(ctx.token_balance(recip_a), 50);
    assert_eq!(ctx.token_balance(recip_b), 50);
}

/// With at least one spending cap, unlisted mints cannot decrease.
#[test]
fn uncapped_mint_is_rejected() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint_a, _sender_a, _recip_a) = setup(&mut ctx, 1_000_000);
    // Policy caps only mint_a.
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint_a, 1_000, 0)]),
    );

    // A different mint has no allowance.
    let owner = Keypair::new();
    let mint_b = ctx.create_payment_mint();
    let sender_b = ctx.create_token_account(owner.pubkey(), mint_b);
    let recip_b = ctx.create_token_account(Keypair::new().pubkey(), mint_b);
    ctx.mint_tokens(mint_b, sender_b, 1_000);
    ctx.approve_delegate(&owner, asset, mint_b, sender_b, 1_000, 6);

    let err = ctx
        .send_execute_spl_transfer(asset, mint_b, sender_b, recip_b, 500, &mut passkey)
        .expect_err("unlisted mint must fail");
    assert_tx_err(err, &["MintNotAllowed"]);
    assert_eq!(ctx.token_balance(recip_b), 0);
}

/// Fixed intervals refill on a positive charge after the boundary.
#[test]
fn rolling_window_resets() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, sender, recipient_token) = setup(&mut ctx, 1_000_000);
    // Daily window, cap 100.
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 86_400)]),
    );

    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect("first fills the window");

    let err = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect_err("window exhausted");
    assert_tx_err(err, &["SpendLimitExceeded", "6023"]);

    ctx.warp_seconds(86_401);
    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect("window reset");
    assert_eq!(ctx.token_balance(recipient_token), 200);
}

/// A charge at exactly one interval from the anchor refills (`elapsed >= window`).
#[test]
fn interval_refills_at_exact_boundary() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, sender, recipient_token) = setup(&mut ctx, 1_000_000);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 86_400)]),
    );

    // Exhaust the window at the anchor.
    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect("first fills the window");
    let err = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, 1, &mut passkey)
        .expect_err("window exhausted");
    assert_tx_err(err, &["SpendLimitExceeded", "6023"]);

    // Warp exactly one interval: the boundary second itself must refill.
    ctx.warp_seconds(86_400);
    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect("exact boundary refills");
    assert_eq!(ctx.token_balance(recipient_token), 200);
}

/// Re-saving an identical policy (or a permissions-only edit) must not refill an
/// unchanged cap: the already-consumed allowance is preserved across the save.
#[test]
fn identical_save_preserves_usage() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, sender, recipient_token) = setup(&mut ctx, 1_000_000);
    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 0)]),
    );

    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect("exhaust the lifetime cap");

    // Save the same limits again. Usage must carry over, not reset to full.
    ctx.set_wallet_policy(asset, &authority, policy_args(vec![mint_cap(mint, 100, 0)]))
        .expect("re-save identical policy");

    let err = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, 1, &mut passkey)
        .expect_err("identical save must not refill");
    assert_tx_err(err, &["SpendLimitExceeded", "6023"]);
    assert_eq!(ctx.token_balance(recipient_token), 100);
}

/// Changing a cap's amount is a deliberate reconfiguration and does refill it.
#[test]
fn changing_cap_amount_refills() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, sender, recipient_token) = setup(&mut ctx, 1_000_000);
    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 0)]),
    );

    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 100, &mut passkey)
        .expect("exhaust the lifetime cap");

    // Raise the cap. A changed cap is freshly anchored, so the full new allowance
    // is available (not the preserved remainder of the old one).
    ctx.set_wallet_policy(asset, &authority, policy_args(vec![mint_cap(mint, 200, 0)]))
        .expect("raise the cap");

    ctx.send_execute_spl_transfer(asset, mint, sender, recipient_token, 200, &mut passkey)
        .expect("changed cap refills to the full new amount");
    assert_eq!(ctx.token_balance(recipient_token), 300);
}

/// SOL transfers honour the configured SOL cap.
#[test]
fn sol_cap_enforced() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.fund_wallet(asset);

    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .expect("set authority");
    let args = WalletPolicyArgs {
        sol_cap: Some(SolCapArg {
            cap: 100_000,
            window_seconds: 0,
        }),
        mint_caps: vec![],
        program_permissions: vec![],
    };
    ctx.set_wallet_policy(asset, &authority, args)
        .expect("set policy");

    let recipient = Keypair::new().pubkey();
    let err = ctx
        .send_execute_lamport_transfer(asset, recipient, 200_000, &mut passkey)
        .expect_err("over sol cap");
    assert_tx_err(err, &["SpendLimitExceeded", "6023"]);

    ctx.send_execute_lamport_transfer(asset, recipient, 100_000, &mut passkey)
        .expect("within sol cap");
    assert_eq!(ctx.lamports(recipient), 100_000);
}

/// An Approve that leaves a standing delegate on a wallet-owned token account is
/// rejected post-CPI (it would authorise a later, unmetered drain). This catches an
/// approval regardless of how it was introduced, not just a specific discriminant.
#[test]
fn approve_leaving_delegate_denied() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, _sender, _recip) = setup(&mut ctx, 1_000_000);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 1_000, 0)]),
    );

    // A token account the WALLET owns, so it can approve a delegate on it.
    let wallet = ctx.wallet(asset);
    let wallet_ata = ctx.create_token_account(wallet, mint);
    ctx.mint_tokens(mint, wallet_ata, 1_000);

    let (remaining, compact) =
        ctx.approve_compact(asset, mint, wallet_ata, Keypair::new().pubkey(), 100, 6);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect_err("standing delegate denied");
    assert_tx_err(err, &["DelegationNotAllowed", "6026"]);
}

/// Closing a wallet-owned token account is allowed even with limits active: SPL
/// requires a zero balance to close, so nothing but rent dust can leave unmetered.
#[test]
fn close_wallet_ata_allowed_with_limits() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, _sender, _recip) = setup(&mut ctx, 1_000_000);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 1_000, 0)]),
    );

    // An empty wallet-owned token account (balance 0), closed back to the wallet.
    let wallet = ctx.wallet(asset);
    let wallet_ata = ctx.create_token_account(wallet, mint);

    let (remaining, compact) = ctx.close_token_account_compact(asset, wallet_ata, wallet);
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect("closing a wallet-owned account is allowed");
    assert!(!ctx.account_exists(wallet_ata));
}

/// A `System::CreateAccount` funded from the wallet now counts against the SOL cap.
/// This is the regression the balance-delta model fixes — instruction parsing
/// previously left CreateAccount lamport funding uncapped.
#[test]
fn create_account_funding_counts_toward_sol_cap() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.fund_wallet(asset);

    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .expect("set authority");
    // A tiny SOL cap — well below the rent the wallet must pay to create the mint.
    let args = WalletPolicyArgs {
        sol_cap: Some(SolCapArg {
            cap: 1_000,
            window_seconds: 0,
        }),
        mint_caps: vec![],
        program_permissions: vec![],
    };
    ctx.set_wallet_policy(asset, &authority, args)
        .expect("set policy");

    let (result, _mint) = ctx.send_execute_create_mint(asset, &mut passkey, 6);
    let err = result.expect_err("rent funding exceeds sol cap");
    assert_tx_err(err, &["SpendLimitExceeded", "6023"]);
}

/// The SOL cap also governs wrapped SOL: spending a wallet-owned WSOL balance is
/// metered against `sol_cap`, so native SOL and WSOL share one budget.
#[test]
fn wsol_counts_toward_sol_cap() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    ctx.fund_wallet(asset);

    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .expect("set authority");

    // Give the wallet a wrapped-SOL (Token-2022 native mint) balance. The mint must
    // exist for `transfer_checked` decimals validation; native accounts are written
    // directly (native mints reject `MintTo`).
    let wsol = ctx.create_wsol_mint();
    let wallet = ctx.wallet(asset);
    let wallet_wsol = ctx.create_native_wsol_account(wallet, 1_000_000);
    let recipient_wsol = ctx.create_native_wsol_account(Keypair::new().pubkey(), 0);

    // A SOL cap with NO separate WSOL mint cap.
    ctx.set_wallet_policy(
        asset,
        &authority,
        WalletPolicyArgs {
            sol_cap: Some(SolCapArg {
                cap: 100_000,
                window_seconds: 0,
            }),
            mint_caps: vec![],
            program_permissions: vec![],
        },
    )
    .expect("set policy");

    // Sending WSOL over the SOL cap is rejected against that same budget.
    let (remaining, compact) =
        ctx.spl_transfer_compact(asset, wsol, wallet_wsol, recipient_wsol, 200_000, 9);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect_err("wsol over sol cap");
    assert_tx_err(err, &["SpendLimitExceeded"]);

    // Within the SOL cap it goes through.
    let (remaining, compact) =
        ctx.spl_transfer_compact(asset, wsol, wallet_wsol, recipient_wsol, 100_000, 9);
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect("wsol within sol cap");
    assert_eq!(ctx.token_balance(recipient_wsol), 100_000);
}

/// WSOL is governed by `sol_cap`, so it cannot be configured as a standalone mint
/// cap — either native mint is rejected.
#[test]
fn wsol_mint_rejected_in_mint_caps() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(&mut passkey, asset, policy_args(vec![]));

    for wsol in [WSOL_MINT, WSOL_MINT_2022] {
        let err = ctx
            .set_wallet_policy(asset, &authority, policy_args(vec![mint_cap(wsol, 100, 0)]))
            .expect_err("wsol rejected as mint cap");
        assert_tx_err(err, &["InvalidPolicyArgs"]);
    }
}

/// An active policy confines the passkey path to the baseline allow-list, so assets
/// outside the spend-limit meter (Metaplex Core, Bubblegum cNFTs, arbitrary dapps)
/// cannot be moved. The authority path and unpoliced wallets are unaffected.
#[test]
fn active_policy_denies_non_allowlisted_program_cpi() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let authority = ctx.install_policy(
        &mut passkey,
        asset,
        WalletPolicyArgs {
            sol_cap: Some(SolCapArg {
                cap: 1_000_000,
                window_seconds: 0,
            }),
            mint_caps: vec![],
            program_permissions: vec![],
        },
    );
    ctx.fund_wallet(asset);

    // Stand-in for any program the spend-limit meter does not understand.
    let foreign_program = Pubkey::new_unique();
    let wallet = ctx.wallet(asset);
    let remaining = vec![
        AccountMeta::new_readonly(foreign_program, false),
        AccountMeta::new(wallet, false),
    ];
    let compact = vec![CompactInstruction {
        program_id_index: 0,
        account_indexes: vec![1],
        data: vec![],
    }];

    // Passkey + active policy (empty list ⇒ baseline only): rejected before any CPI.
    let err = ctx
        .send_execute(asset, compact.clone(), remaining.clone(), &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["ProgramNotAllowed"]);

    // Restoring the default removes caps but retains the baseline allow-list.
    ctx.set_wallet_policy(asset, &authority, WalletPolicyArgs::default())
        .unwrap();
    let err = ctx
        .send_execute(asset, compact.clone(), remaining.clone(), &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["ProgramNotAllowed"]);

    // Authority path bypasses the allow-list: it reaches the CPI and fails only
    // because the program is not deployed — never with ProgramNotAllowed.
    let err = ctx
        .send_execute_with_authority(asset, compact, remaining, &authority, &[])
        .unwrap_err();
    let msg = format!("{err:?}");
    assert!(
        !msg.contains("ProgramNotAllowed"),
        "authority path must bypass the allow-list, got: {msg}"
    );

    // A wallet with no policy is also unaffected by the allow-list.
    let (mut open_passkey, open_asset) = setup_locked_asset(&mut ctx);
    let open_authority = Keypair::new();
    ctx.set_authority(&mut open_passkey, open_asset, open_authority.pubkey())
        .unwrap();
    ctx.clear_wallet_policy(open_asset, &open_authority)
        .unwrap();
    ctx.fund_wallet(open_asset);
    let open_wallet = ctx.wallet(open_asset);
    let open_remaining = vec![
        AccountMeta::new_readonly(foreign_program, false),
        AccountMeta::new(open_wallet, false),
    ];
    let open_compact = vec![CompactInstruction {
        program_id_index: 0,
        account_indexes: vec![1],
        data: vec![],
    }];
    let err = ctx
        .send_execute(
            open_asset,
            open_compact,
            open_remaining,
            &mut open_passkey,
            &[],
        )
        .unwrap_err();
    let msg = format!("{err:?}");
    assert!(
        !msg.contains("ProgramNotAllowed"),
        "an unpoliced wallet must not enforce the allow-list, got: {msg}"
    );
}

/// A policy can extend the passkey allow-list with specific programs: a listed
/// program passes the gate (and fails later only because it isn't deployed), while
/// an unlisted one is still rejected with `ProgramNotAllowed`.
#[test]
fn configurable_allow_list_permits_listed_program() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let listed = Pubkey::new_unique();
    let unlisted = Pubkey::new_unique();
    ctx.install_policy(
        &mut passkey,
        asset,
        WalletPolicyArgs {
            sol_cap: Some(SolCapArg {
                cap: 1_000_000,
                window_seconds: 0,
            }),
            mint_caps: vec![],
            program_permissions: vec![phygital_wallet::ProgramPermission {
                program_id: listed,
                access: phygital_wallet::ProgramAccess::AllInstructions,
            }],
        },
    );
    ctx.fund_wallet(asset);
    let wallet = ctx.wallet(asset);

    let cpi = |program: Pubkey| {
        (
            vec![
                AccountMeta::new_readonly(program, false),
                AccountMeta::new(wallet, false),
            ],
            vec![CompactInstruction {
                program_id_index: 0,
                account_indexes: vec![1],
                data: vec![],
            }],
        )
    };

    // Listed program clears the allow-list gate (then fails: not deployed).
    let (remaining, compact) = cpi(listed);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[])
        .unwrap_err();
    let msg = format!("{err:?}");
    assert!(
        !msg.contains("ProgramNotAllowed"),
        "configured program must pass the allow-list, got: {msg}"
    );

    // A program not on the (baseline + configured) list is still denied.
    let (remaining, compact) = cpi(unlisted);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[])
        .unwrap_err();
    assert_tx_err(err, &["ProgramNotAllowed"]);
}

/// Fresh defaults allow uncapped spending; restoring defaults removes a cap
/// without disabling the policy.
#[test]
fn default_policy_allows_spending_and_can_be_restored() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset, mint, sender, recipient) = setup(&mut ctx, 1_000);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .unwrap();
    ctx.send_execute_spl_transfer(asset, mint, sender, recipient, 200, &mut passkey)
        .expect("default has no token cap");
    ctx.fund_wallet(asset);
    ctx.send_execute_lamport_transfer(asset, Keypair::new().pubkey(), 100, &mut passkey)
        .expect("default has no SOL cap");
    ctx.set_wallet_policy(
        asset,
        &authority,
        policy_args(vec![mint_cap(mint, 100, 86_400)]),
    )
    .unwrap();
    let err = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient, 200, &mut passkey)
        .expect_err("daily cap enforced");
    assert_tx_err(err, &["SpendLimitExceeded"]);
    ctx.set_wallet_policy(asset, &authority, WalletPolicyArgs::default())
        .unwrap();
    ctx.send_execute_spl_transfer(asset, mint, sender, recipient, 200, &mut passkey)
        .expect("restoring defaults removes spending limits");
    assert_eq!(ctx.token_balance(recipient), 400);
    let account = ctx.svm.get_account(&ctx.authority_pda(asset)).unwrap();
    assert!(phygital_wallet::Authority::read(&account.data).unwrap().1);
}
