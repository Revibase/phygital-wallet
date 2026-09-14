mod common;

use common::{setup_locked_execute, TestContext};
use phygital_wallet::{
    InstructionRule, ProgramAccess, ProgramPermission, WalletPolicyArgs, TOKEN_2022_PROGRAM_ID,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// A permissive `TransferChecked` rule for the token program — enough to exercise
/// the instruction-policy match path on the CU hot path without restricting it.
fn transfer_permission() -> ProgramPermission {
    ProgramPermission {
        program_id: TOKEN_2022_PROGRAM_ID,
        access: ProgramAccess::Restricted(vec![InstructionRule {
            selector: vec![12], // TransferChecked
            data_length: Some(10),
            account_count: Some(4),
            accounts: vec![],
            arguments: vec![],
        }]),
    }
}

/// Ceiling for the execute program CU. The measurement is dominated by the
/// passkey secp256r1 verify CPI, whose cost swings run-to-run with the random test
/// keys (observed ~20k–33k on BOTH the policy and no-policy paths), so this guard is
/// a loose regression ceiling, not a tight budget. Policy enforcement (balance
/// snapshot + delta charge + delegate check) adds only a small, roughly constant
/// overhead and is frequently cheaper than the no-policy path in the same window.
const MAX_EXECUTE_CU: u64 = 45_000;

/// Hot-path CU for a passkey execute with an owner set but NO active spending policy
/// (protections turned off). Establishes the baseline the on-chain policy enforcement
/// adds to. The tap requires a present owner, so this is the lightest live path.
#[test]
fn reports_hot_path_compute_units_no_policy() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);
    let authority = Keypair::new();
    ctx.set_authority(&mut passkey, asset, authority.pubkey())
        .expect("set owner");
    ctx.clear_wallet_policy(asset, &authority)
        .expect("turn off protections");

    let execute_meta = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, amount, &mut passkey)
        .expect("execute");

    let execute_cu = TestContext::program_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute program CU");
    let self_cu = TestContext::program_self_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute self CU");
    eprintln!("execute (no policy): program={execute_cu} self(excl CPIs)={self_cu}");
    assert!(execute_cu < MAX_EXECUTE_CU, "execute used {execute_cu} CU");
}

/// Hot-path CU for a passkey execute WITH an enforced per-mint policy.
#[test]
fn reports_hot_path_compute_units_with_policy() {
    use common::{mint_cap, policy_args};

    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);

    // Fixed 24-hour allowance comfortably above the transfer.
    ctx.install_policy(
        &mut passkey,
        asset,
        policy_args(vec![mint_cap(mint, amount * 10, 86_400)]),
    );

    let execute_meta = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, amount, &mut passkey)
        .expect("execute");

    let execute_cu = TestContext::program_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute program CU");
    let self_cu = TestContext::program_self_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute self CU");
    eprintln!("execute (policy): program={execute_cu} self(excl CPIs)={self_cu}");
    assert!(execute_cu < MAX_EXECUTE_CU, "execute used {execute_cu} CU");
}

/// Hot-path CU for a passkey execute WITH an instruction policy (per-program rule)
/// but NO spending caps. Exercises the permission match path without the balance
/// snapshot/delta charge of a mint cap.
#[test]
fn reports_hot_path_compute_units_instruction_policy() {
    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);

    ctx.install_policy(
        &mut passkey,
        asset,
        WalletPolicyArgs {
            sol_cap: None,
            mint_caps: vec![],
            program_permissions: vec![transfer_permission()],
        },
    );

    let execute_meta = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, amount, &mut passkey)
        .expect("execute");

    let execute_cu = TestContext::program_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute program CU");
    let self_cu = TestContext::program_self_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute self CU");
    eprintln!("execute (instruction policy): program={execute_cu} self(excl CPIs)={self_cu}");
    assert!(execute_cu < MAX_EXECUTE_CU, "execute used {execute_cu} CU");
}

/// Hot-path CU for a passkey execute WITH both an instruction policy and a mint
/// spending cap — the heaviest enforced path.
#[test]
fn reports_hot_path_compute_units_instruction_and_spend_policy() {
    use common::mint_cap;

    let mut ctx = TestContext::new();
    let amount = 1_000_000u64;
    let (mut passkey, _owner, _recipient, asset, mint, sender, recipient_token) =
        setup_locked_execute(&mut ctx, amount);

    ctx.install_policy(
        &mut passkey,
        asset,
        WalletPolicyArgs {
            sol_cap: None,
            mint_caps: vec![mint_cap(mint, amount * 10, 86_400)],
            program_permissions: vec![transfer_permission()],
        },
    );

    let execute_meta = ctx
        .send_execute_spl_transfer(asset, mint, sender, recipient_token, amount, &mut passkey)
        .expect("execute");

    let execute_cu = TestContext::program_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute program CU");
    let self_cu = TestContext::program_self_compute_units(&execute_meta.logs, &ctx.program_id)
        .expect("execute self CU");
    eprintln!("execute (instruction+spend): program={execute_cu} self(excl CPIs)={self_cu}");
    assert!(execute_cu < MAX_EXECUTE_CU, "execute used {execute_cu} CU");
}
