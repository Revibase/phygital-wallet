// Regression tests for spending policy accounting and token control invariants.
mod common;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token_2022::spl_token_2022::{
    instruction as token_ix, state::Account as TokenAccount,
};
use common::{mint_cap, policy_args, setup_locked_asset, TestContext};
use phygital_wallet::{CompactInstruction, SolCapArg, WalletPolicyArgs, TOKEN_2022_PROGRAM_ID};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn pack(
    wallet: Pubkey,
    instructions: Vec<Instruction>,
) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
    let mut accounts: Vec<AccountMeta> = vec![];
    let mut compact = vec![];
    for ix in instructions {
        let mut indices = vec![];
        for mut meta in
            std::iter::once(AccountMeta::new_readonly(ix.program_id, false)).chain(ix.accounts)
        {
            if meta.pubkey == wallet {
                meta.is_signer = false;
            }
            let idx = if let Some(idx) = accounts.iter().position(|a| a.pubkey == meta.pubkey) {
                accounts[idx].is_writable |= meta.is_writable;
                accounts[idx].is_signer |= meta.is_signer;
                idx
            } else {
                accounts.push(meta);
                accounts.len() - 1
            };
            indices.push(idx as u8);
        }
        compact.push(CompactInstruction {
            program_id_index: indices[0],
            account_indexes: indices[1..].to_vec(),
            data: ix.data,
        });
    }
    (accounts, compact)
}

#[test]
fn owner_handoff_rejected_with_small_cap() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let wallet = ctx.wallet(asset);
    let mint = ctx.create_payment_mint();
    let source = ctx.create_token_account(wallet, mint);
    ctx.mint_tokens(mint, source, 1_000);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 1, 86_400)]),
    );
    let attacker = Keypair::new().pubkey();
    let (remaining, compact) = ctx.set_authority_compact(asset, source, attacker);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect_err("control handoff must fail");
    common::assert_tx_err(err, &["TokenAuthorityChanged"]);
    let account = ctx.svm.get_account(&source).unwrap();
    let state = TokenAccount::unpack(&account.data).unwrap();
    assert_eq!(state.owner, wallet);
    assert_eq!(state.amount, 1_000);
}

#[test]
fn negative_windows_rejected_for_sol_and_tokens() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    let authority = ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let err = ctx
        .set_wallet_policy(
            asset,
            &authority,
            policy_args(vec![mint_cap(mint, 100, -1)]),
        )
        .expect_err("negative token window");
    common::assert_tx_err(err, &["InvalidPolicyArgs"]);
    let mut args = policy_args(vec![]);
    args.sol_cap = Some(SolCapArg {
        cap: 100,
        window_seconds: -1,
    });
    let err = ctx
        .set_wallet_policy(asset, &authority, args)
        .expect_err("negative SOL window");
    common::assert_tx_err(err, &["InvalidPolicyArgs"]);
}

#[test]
fn duplicate_account_charges_transfer_once() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let wallet = ctx.wallet(asset);
    let mint = ctx.create_payment_mint();
    let source = ctx.create_token_account(wallet, mint);
    let dest = ctx.create_token_account(Keypair::new().pubkey(), mint);
    ctx.mint_tokens(mint, source, 1_000);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 100, 86_400)]),
    );
    let (mut remaining, compact) = ctx.spl_transfer_compact(asset, mint, source, dest, 60, 6);
    for _ in 0..20 {
        remaining.push(AccountMeta::new(source, false));
    }
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect("60 charged once within 100 cap");
    assert_eq!(ctx.token_balance(dest), 60);
    let err = ctx
        .send_execute_spl_transfer(asset, mint, source, dest, 41, &mut passkey)
        .expect_err("only 40 quota remains");
    common::assert_tx_err(err, &["SpendLimitExceeded"]);
    ctx.send_execute_spl_transfer(asset, mint, source, dest, 40, &mut passkey)
        .expect("failed execute preserves quota");
    assert_eq!(ctx.token_balance(dest), 100);
}

#[test]
fn newly_initialized_wallet_account_cannot_leave_standing_delegate() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let wallet = ctx.wallet(asset);
    let mint = ctx.create_payment_mint();
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 1, 86_400)]),
    );
    let fresh = Keypair::new().pubkey();
    // Equivalent pre-state to System::CreateAccount executed earlier in the transaction.
    ctx.svm
        .set_account(
            fresh,
            solana_account::Account {
                lamports: 10_000_000,
                data: vec![0; 165],
                owner: TOKEN_2022_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let delegate = Keypair::new().pubkey();
    let init =
        token_ix::initialize_account3(&TOKEN_2022_PROGRAM_ID, &fresh, &mint, &wallet).unwrap();
    let approve = token_ix::approve_checked(
        &TOKEN_2022_PROGRAM_ID,
        &fresh,
        &mint,
        &delegate,
        &wallet,
        &[],
        1_000_000,
        6,
    )
    .unwrap();
    let (remaining, compact) = pack(wallet, vec![init.clone(), approve.clone()]);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect_err("new account must be checked");
    common::assert_tx_err(err, &["DelegationNotAllowed"]);
    let account = ctx.svm.get_account(&fresh).unwrap();
    assert!(
        account.data.iter().all(|b| *b == 0),
        "failed execute must roll back initialization"
    );
    // Transient approvals remain composable when revoked before execute ends.
    let revoke = token_ix::revoke(&TOKEN_2022_PROGRAM_ID, &fresh, &wallet, &[]).unwrap();
    let (remaining, compact) = pack(wallet, vec![init, approve, revoke]);
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[])
        .expect("init and temporary delegate are allowed");
    let state = TokenAccount::unpack(&ctx.svm.get_account(&fresh).unwrap().data).unwrap();
    assert_eq!(state.owner, wallet);
    assert_eq!(state.delegated_amount, 0);
}

#[test]
fn outgoing_and_incoming_sol_net_to_zero() {
    use anchor_lang::solana_program::system_instruction;
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let wallet = ctx.wallet(asset);
    ctx.fund_wallet(asset);
    ctx.install_policy(
        &mut passkey,
        asset,
        WalletPolicyArgs {
            sol_cap: Some(SolCapArg {
                cap: 1,
                window_seconds: 0,
            }),
            mint_caps: vec![],
            program_permissions: vec![],
        },
    );
    let external = Keypair::new().pubkey();
    ctx.svm.airdrop(&external, 10_000_000).unwrap();
    let (remaining, compact) = pack(
        wallet,
        vec![
            system_instruction::transfer(&wallet, &external, 1_000_000),
            system_instruction::transfer(&external, &wallet, 1_000_000),
        ],
    );
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[external])
        .expect("zero net loss passes small cap");
}

#[test]
fn duplicate_mint_configuration_rejected() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let mint = ctx.create_payment_mint();
    let authority = ctx.install_policy(&mut passkey, asset, policy_args(vec![]));
    let err = ctx
        .set_wallet_policy(
            asset,
            &authority,
            policy_args(vec![mint_cap(mint, 1_000, 0), mint_cap(mint, 1, 86_400)]),
        )
        .expect_err("duplicate mint");
    common::assert_tx_err(err, &["InvalidPolicyArgs"]);
}

#[test]
fn moving_between_own_accounts_consumes_quota() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let wallet = ctx.wallet(asset);
    let mint = ctx.create_payment_mint();
    let source = ctx.create_token_account(wallet, mint);
    let dest = ctx.create_token_account(wallet, mint);
    ctx.mint_tokens(mint, source, 1_000);
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 1, 86_400)]),
    );
    let err = ctx
        .send_execute_spl_transfer(asset, mint, source, dest, 2, &mut passkey)
        .expect_err("internal transfer counted as spend");
    common::assert_tx_err(err, &["SpendLimitExceeded"]);
}

#[test]
fn close_authority_handoff_rejected_for_existing_and_new_accounts() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let wallet = ctx.wallet(asset);
    let mint = ctx.create_payment_mint();
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, 1, 86_400)]),
    );
    for newly_initialized in [false, true] {
        let account = if newly_initialized {
            let key = Keypair::new().pubkey();
            ctx.svm
                .set_account(
                    key,
                    solana_account::Account {
                        lamports: 10_000_000,
                        data: vec![0; 165],
                        owner: TOKEN_2022_PROGRAM_ID,
                        executable: false,
                        rent_epoch: 0,
                    },
                )
                .unwrap();
            key
        } else {
            ctx.create_token_account(wallet, mint)
        };
        let mut instructions = vec![];
        if newly_initialized {
            instructions.push(
                token_ix::initialize_account3(&TOKEN_2022_PROGRAM_ID, &account, &mint, &wallet)
                    .unwrap(),
            );
        }
        instructions.push(
            token_ix::set_authority(
                &TOKEN_2022_PROGRAM_ID,
                &account,
                Some(&Keypair::new().pubkey()),
                token_ix::AuthorityType::CloseAccount,
                &wallet,
                &[],
            )
            .unwrap(),
        );
        let (remaining, compact) = pack(wallet, instructions);
        let err = ctx
            .send_execute(asset, compact, remaining, &mut passkey, &[])
            .expect_err("external close authority must fail");
        common::assert_tx_err(err, &["TokenAuthorityChanged"]);
    }
}

/// Mock a swap: in one execute, spend a capped input mint and receive an uncapped
/// output mint. Confirms an unlisted mint may INCREASE freely (only its DECREASE is
/// blocked), so swaps that route INTO an uncapped token work.
#[test]
fn mock_swap_spends_capped_input_receives_uncapped_output() {
    let mut ctx = TestContext::new();
    let (mut passkey, asset) = setup_locked_asset(&mut ctx);
    let wallet = ctx.wallet(asset);

    // Wallet holds the (capped) input mint; will receive the (uncapped) output mint.
    let mint_in = ctx.create_payment_mint();
    let mint_out = ctx.create_payment_mint();
    let wallet_in = ctx.create_token_account(wallet, mint_in);
    let wallet_out = ctx.create_token_account(wallet, mint_out);
    ctx.mint_tokens(mint_in, wallet_in, 1_000);

    // The "pool": an external party that takes the input and returns the output.
    let pool = Keypair::new();
    let pool_in = ctx.create_token_account(pool.pubkey(), mint_in);
    let pool_out = ctx.create_token_account(pool.pubkey(), mint_out);
    ctx.mint_tokens(mint_out, pool_out, 1_000);

    // Cap only the input mint; the output mint is unlisted.
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint_in, 500, 0)]),
    );

    let swap = |amount_in: u64, amount_out: u64| {
        pack(
            wallet,
            vec![
                token_ix::transfer_checked(
                    &TOKEN_2022_PROGRAM_ID,
                    &wallet_in,
                    &mint_in,
                    &pool_in,
                    &wallet,
                    &[],
                    amount_in,
                    6,
                )
                .unwrap(),
                token_ix::transfer_checked(
                    &TOKEN_2022_PROGRAM_ID,
                    &pool_out,
                    &mint_out,
                    &wallet_out,
                    &pool.pubkey(),
                    &[],
                    amount_out,
                    6,
                )
                .unwrap(),
            ],
        )
    };

    // Within the input cap: spend 100 input, receive 50 unlisted output. Succeeds.
    let (remaining, compact) = swap(100, 50);
    ctx.send_execute(asset, compact, remaining, &mut passkey, &[pool.pubkey()])
        .expect("swap within cap");
    assert_eq!(ctx.token_balance(wallet_in), 900);
    assert_eq!(ctx.token_balance(wallet_out), 50);

    // Over the input cap: rejected on the capped input side.
    let (remaining, compact) = swap(600, 50);
    let err = ctx
        .send_execute(asset, compact, remaining, &mut passkey, &[pool.pubkey()])
        .expect_err("input over cap");
    common::assert_tx_err(err, &["SpendLimitExceeded"]);
}
