#![allow(dead_code)] // shared across the integration test crates

mod secp256r1;

pub use secp256r1::{current_slot_entry, TestPasskey, TEST_ORIGIN, TEST_RP_ID};

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::token_2022::spl_token_2022::instruction::{
    approve_checked, burn_checked, close_account, initialize_account3, initialize_mint2, mint_to,
    set_authority, transfer_checked, AuthorityType,
};
use anchor_spl::token_2022::spl_token_2022::state::{Account as TokenAccountState, Mint};
use anchor_spl::token_2022::ID as TOKEN_2022_ID;
use borsh::BorshDeserialize;
use litesvm::LiteSVM;
use phygital_token_client::{PhygitalToken, PhygitalTokenType, PHYGITAL_TOKEN_DISCRIMINATOR};
use phygital_wallet::{
    CompactInstruction, MintCapArg, Secp256r1VerifyArgs, WalletPolicyArgs, AUTHORITY_SEED,
    PROGRAM_WALLET_SEED,
};
use sha2::{Digest, Sha256};
use solana_account::Account as SolanaAccount;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_sdk_ids::sysvar::{
    instructions::ID as INSTRUCTIONS_SYSVAR_ID, slot_hashes::ID as SLOT_HASHES_SYSVAR_ID,
};
use solana_signature::Signature;
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

pub const TOKEN_SEED: &[u8] = b"token";
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const EXECUTE_CHALLENGE_PREFIX: &[u8] = b"phygital_wallet:execute:v2";

/// Offline pack — mirrors on-chain `instructions_hash` preimage layout.
pub fn pack_compact_instructions(instructions: &[CompactInstruction]) -> Vec<u8> {
    assert!(instructions.len() <= u8::MAX as usize);
    let mut bytes = Vec::new();
    bytes.push(instructions.len() as u8);
    for ix in instructions {
        assert!(ix.account_indexes.len() <= u8::MAX as usize);
        assert!(ix.data.len() <= u16::MAX as usize);
        bytes.push(ix.program_id_index);
        bytes.push(ix.account_indexes.len() as u8);
        bytes.extend_from_slice(&ix.account_indexes);
        bytes.extend_from_slice(&(ix.data.len() as u16).to_le_bytes());
        bytes.extend_from_slice(&ix.data);
    }
    bytes
}

pub fn hash_compact_instructions(instructions: &[CompactInstruction]) -> [u8; 32] {
    Sha256::digest(&pack_compact_instructions(instructions)).into()
}

/// Offline `accounts_hash` over remaining pubkeys (tests have no AccountInfo).
pub fn hash_referenced_accounts(
    remaining_keys: &[Pubkey],
    instructions: &[CompactInstruction],
) -> [u8; 32] {
    let mut buf = Vec::new();
    for ix in instructions {
        let program = remaining_keys
            .get(ix.program_id_index as usize)
            .expect("program_id_index");
        buf.extend_from_slice(program.as_ref());
        for &idx in &ix.account_indexes {
            let key = remaining_keys.get(idx as usize).expect("account index");
            buf.extend_from_slice(key.as_ref());
        }
    }
    Sha256::digest(&buf).into()
}

pub fn hash_execute_challenge(
    slot_hash: &[u8; 32],
    instructions_hash: &[u8; 32],
    accounts_hash: &[u8; 32],
) -> [u8; 32] {
    let mut preimage = Vec::with_capacity(EXECUTE_CHALLENGE_PREFIX.len() + 96);
    preimage.extend_from_slice(EXECUTE_CHALLENGE_PREFIX);
    preimage.extend_from_slice(slot_hash);
    preimage.extend_from_slice(instructions_hash);
    preimage.extend_from_slice(accounts_hash);
    Sha256::digest(&preimage).into()
}

/// Offline execute challenge over remaining pubkeys (tests have no AccountInfo).
pub fn build_execute_challenge(
    slot_hash: [u8; 32],
    compact_instructions: &[CompactInstruction],
    remaining_keys: &[Pubkey],
) -> [u8; 32] {
    let instructions_hash = hash_compact_instructions(compact_instructions);
    let accounts_hash = hash_referenced_accounts(remaining_keys, compact_instructions);
    hash_execute_challenge(&slot_hash, &instructions_hash, &accounts_hash)
}

/// Assert a LiteSVM/Anchor failure mentions at least one expected needle.
pub fn assert_tx_err(err: impl std::fmt::Debug, needles: &[&str]) {
    let err_str = format!("{err:?}");
    assert!(
        needles.iter().any(|n| err_str.contains(n)),
        "expected one of {needles:?}, got: {err:?}"
    );
}

/// Locked phygital token only (no payment mint / ATAs).
pub fn setup_locked_asset(ctx: &mut TestContext) -> (TestPasskey, Pubkey) {
    let passkey = TestPasskey::generate();
    let asset = ctx.asset_pda(&passkey.compressed_pubkey);
    ctx.write_locked_asset(
        asset,
        TestContext::unique_identifier(),
        passkey.compressed_pubkey,
        0,
    );
    (passkey, asset)
}

/// Mint + ATAs + approve wallet as delegate. Does not fund the wallet PDA with SOL.
pub fn setup_delegated_payment(
    ctx: &mut TestContext,
    owner: &Keypair,
    asset: Pubkey,
    recipient: Pubkey,
    amount: u64,
) -> (Pubkey, Pubkey, Pubkey) {
    let payment_mint = ctx.create_payment_mint();
    let sender_token = ctx.create_token_account(owner.pubkey(), payment_mint);
    let recipient_token = ctx.create_token_account(recipient, payment_mint);
    ctx.mint_tokens(payment_mint, sender_token, amount);
    ctx.approve_delegate(owner, asset, payment_mint, sender_token, amount, 6);
    (payment_mint, sender_token, recipient_token)
}

/// Locked asset + delegated SPL payment ready for execute.
pub fn setup_locked_execute(
    ctx: &mut TestContext,
    amount: u64,
) -> (TestPasskey, Keypair, Pubkey, Pubkey, Pubkey, Pubkey, Pubkey) {
    let (passkey, asset) = setup_locked_asset(ctx);
    let owner = Keypair::new();
    let recipient = Keypair::new().pubkey();
    let (payment_mint, sender_token, recipient_token) =
        setup_delegated_payment(ctx, &owner, asset, recipient, amount);
    (
        passkey,
        owner,
        recipient,
        asset,
        payment_mint,
        sender_token,
        recipient_token,
    )
}

pub struct TestContext {
    pub svm: LiteSVM,
    pub payer: Keypair,
    pub program_id: Pubkey,
    pub mint_authority: Keypair,
}

impl TestContext {
    pub fn new() -> Self {
        let program_id = phygital_wallet::ID;
        let mut svm = LiteSVM::new().with_precompiles().with_sigverify(false);
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));

        Self::deploy_program(
            &mut svm,
            program_id,
            &program_artifact_paths(manifest_dir, "phygital_wallet"),
            "phygital_wallet",
        );
        Self::deploy_program(
            &mut svm,
            phygital_token_client::PHYGITAL_TOKEN_ID,
            &phygital_token_artifact_paths(manifest_dir),
            "phygital_token",
        );

        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 100 * LAMPORTS_PER_SOL)
            .expect("airdrop payer");

        Self {
            svm,
            payer,
            program_id,
            mint_authority: Keypair::new(),
        }
    }

    // --- PDAs ---

    pub fn wallet(&self, asset: Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[PROGRAM_WALLET_SEED, asset.as_ref()], &self.program_id).0
    }

    pub fn authority_pda(&self, asset: Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[AUTHORITY_SEED, asset.as_ref()], &self.program_id).0
    }

    // --- authority admin ---

    /// Passkey-gated: set the token's authority (ed25519).
    pub fn set_authority(
        &mut self,
        passkey: &mut TestPasskey,
        asset: Pubkey,
        authority: Pubkey,
    ) -> litesvm::types::TransactionResult {
        let (slot_number, slot_hash) = current_slot_entry(&self.svm);
        let challenge = phygital_wallet::instructions::authority::build_set_authority_challenge(
            slot_hash, &asset, &authority,
        );
        let (secp_ix, verify_args) =
            passkey.verify_asset_secp256r1_instruction_with_rp_id(challenge, TEST_RP_ID);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: phygital_wallet::accounts::SetAuthority {
                payer: self.payer.pubkey(),
                phygital_token: asset,
                authority_account: self.authority_pda(asset),
                slot_hashes: SLOT_HASHES_SYSVAR_ID,
                instructions_sysvar: INSTRUCTIONS_SYSVAR_ID,
                phygital_token_program: phygital_token_client::PHYGITAL_TOKEN_ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: phygital_wallet::instruction::SetAuthority {
                authority,
                secp256r1_verify_args: verify_args,
                slot_number,
            }
            .data(),
        };
        Self::send_instructions(&mut self.svm, &[secp_ix, ix], &[self.payer.pubkey()])
    }

    /// Authority-signed: clear the token's authority (and its policy).
    pub fn clear_authority(
        &mut self,
        asset: Pubkey,
        authority: &Keypair,
    ) -> litesvm::types::TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: phygital_wallet::accounts::ClearAuthority {
                authority: authority.pubkey(),
                rent_receiver: self.payer.pubkey(),
                authority_account: self.authority_pda(asset),
                instructions_sysvar: INSTRUCTIONS_SYSVAR_ID,
            }
            .to_account_metas(None),
            data: phygital_wallet::instruction::ClearAuthority {}.data(),
        };
        Self::send_instructions(
            &mut self.svm,
            &[ix],
            &[self.payer.pubkey(), authority.pubkey()],
        )
    }

    // --- policy admin ---

    pub fn set_wallet_policy(
        &mut self,
        asset: Pubkey,
        authority: &Keypair,
        args: WalletPolicyArgs,
    ) -> litesvm::types::TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: phygital_wallet::accounts::SetWalletPolicy {
                rent_receiver: self.payer.pubkey(),
                authority: authority.pubkey(),
                payer: self.payer.pubkey(),
                authority_account: self.authority_pda(asset),
                instructions_sysvar: INSTRUCTIONS_SYSVAR_ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: phygital_wallet::instruction::SetWalletPolicy { args }.data(),
        };
        Self::send_instructions(
            &mut self.svm,
            &[ix],
            &[self.payer.pubkey(), authority.pubkey()],
        )
    }

    pub fn clear_wallet_policy(
        &mut self,
        asset: Pubkey,
        authority: &Keypair,
    ) -> litesvm::types::TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: phygital_wallet::accounts::ClearWalletPolicy {
                authority: authority.pubkey(),
                rent_receiver: self.payer.pubkey(),
                authority_account: self.authority_pda(asset),
                instructions_sysvar: INSTRUCTIONS_SYSVAR_ID,
            }
            .to_account_metas(None),
            data: phygital_wallet::instruction::ClearWalletPolicy {}.data(),
        };
        Self::send_instructions(
            &mut self.svm,
            &[ix],
            &[self.payer.pubkey(), authority.pubkey()],
        )
    }

    /// Convenience: register an authority + set a policy, returning the authority.
    pub fn install_policy(
        &mut self,
        passkey: &mut TestPasskey,
        asset: Pubkey,
        args: WalletPolicyArgs,
    ) -> Keypair {
        let authority = Keypair::new();
        self.set_authority(passkey, asset, authority.pubkey())
            .expect("set authority");
        self.set_wallet_policy(asset, &authority, args)
            .expect("set policy");
        authority
    }

    fn deploy_program(
        svm: &mut LiteSVM,
        program_id: Pubkey,
        candidates: &[std::path::PathBuf],
        name: &str,
    ) {
        let bytes = candidates
            .iter()
            .find_map(|path| std::fs::read(path).ok())
            .unwrap_or_else(|| {
                panic!(
                    "{name} artifact not found. run `anchor build` (and build phygital-token). tried: {}",
                    candidates
                        .iter()
                        .map(|path| path.display().to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            });
        svm.add_program(program_id, &bytes)
            .unwrap_or_else(|err| panic!("deploy {name}: {err:?}"));
    }

    /// Outermost `Program <id> consumed N of M compute units` from LiteSVM logs.
    pub fn program_compute_units(logs: &[String], program_id: &Pubkey) -> Option<u64> {
        let needle = format!("Program {program_id} consumed ");
        logs.iter().rev().find_map(|line| {
            let rest = line.strip_prefix(&needle)?;
            rest.split_whitespace().next()?.parse().ok()
        })
    }

    /// Our program's OWN CU = outer consumed − Σ(child CPI consumed). Cancels the
    /// run-to-run swing of the secp256r1 verify CPI, giving a stable figure.
    pub fn program_self_compute_units(logs: &[String], program_id: &Pubkey) -> Option<u64> {
        let outer = Self::program_compute_units(logs, program_id)?;
        let self_needle = format!("Program {program_id} consumed ");
        let children: u64 = logs
            .iter()
            .filter_map(|line| {
                let idx = line.find(" consumed ")?;
                if line.starts_with(&self_needle) {
                    return None; // our own (outer) line
                }
                if !line.starts_with("Program ") {
                    return None;
                }
                line[idx + " consumed ".len()..]
                    .split_whitespace()
                    .next()?
                    .parse::<u64>()
                    .ok()
            })
            .sum();
        Some(outer.saturating_sub(children))
    }

    /// Derive the token PDA from the compressed secp256r1 passkey public key.
    pub fn asset_pda(&self, secp256r1_pubkey: &[u8; 33]) -> Pubkey {
        Pubkey::find_program_address(
            &[TOKEN_SEED, &secp256r1_pubkey[1..]],
            &phygital_token_client::PHYGITAL_TOKEN_ID,
        )
        .0
    }

    pub fn unique_identifier() -> [u8; 33] {
        use rand::RngCore;
        let mut bytes = [0u8; 33];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        bytes[0] = 0x02;
        bytes
    }

    pub fn create_payment_mint(&mut self) -> Pubkey {
        let mint = Keypair::new();
        let rent: Rent = self.svm.get_sysvar();
        let rent_lamports = rent.minimum_balance(Mint::LEN);

        let create_ix = system_instruction::create_account(
            &self.payer.pubkey(),
            &mint.pubkey(),
            rent_lamports,
            Mint::LEN as u64,
            &TOKEN_2022_ID,
        );
        let init_ix = initialize_mint2(
            &TOKEN_2022_ID,
            &mint.pubkey(),
            &self.mint_authority.pubkey(),
            None,
            6,
        )
        .expect("initialize_mint2");
        Self::send_instructions(
            &mut self.svm,
            &[create_ix, init_ix],
            &[self.payer.pubkey(), mint.pubkey()],
        )
        .expect("create+init mint");

        mint.pubkey()
    }

    /// Inject the Token-2022 wrapped-SOL native mint at its canonical address so a
    /// wallet-owned WSOL account can be created and minted into for tests.
    pub fn create_wsol_mint(&mut self) -> Pubkey {
        use anchor_lang::solana_program::program_option::COption;
        let mint = phygital_wallet::WSOL_MINT_2022;
        let mut data = vec![0u8; Mint::LEN];
        Mint {
            mint_authority: COption::Some(self.mint_authority.pubkey()),
            supply: 0,
            decimals: 9,
            is_initialized: true,
            freeze_authority: COption::None,
        }
        .pack_into_slice(&mut data);
        let rent: Rent = self.svm.get_sysvar();
        self.svm
            .set_account(
                mint,
                SolanaAccount {
                    lamports: rent.minimum_balance(Mint::LEN),
                    data,
                    owner: TOKEN_2022_ID,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .expect("set wsol mint");
        mint
    }

    /// Write a native wrapped-SOL (Token-2022) token account with a balance
    /// directly. Native mints reject `MintTo`, so a WSOL balance is set, not minted.
    pub fn create_native_wsol_account(&mut self, owner: Pubkey, amount: u64) -> Pubkey {
        use anchor_lang::solana_program::program_option::COption;
        use anchor_spl::token_2022::spl_token_2022::state::AccountState;
        let account = Keypair::new();
        let rent: Rent = self.svm.get_sysvar();
        let reserve = rent.minimum_balance(TokenAccountState::LEN);
        let mut data = vec![0u8; TokenAccountState::LEN];
        TokenAccountState {
            mint: phygital_wallet::WSOL_MINT_2022,
            owner,
            amount,
            delegate: COption::None,
            state: AccountState::Initialized,
            is_native: COption::Some(reserve),
            delegated_amount: 0,
            close_authority: COption::None,
        }
        .pack_into_slice(&mut data);
        self.svm
            .set_account(
                account.pubkey(),
                SolanaAccount {
                    lamports: reserve.checked_add(amount).expect("wsol lamports"),
                    data,
                    owner: TOKEN_2022_ID,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .expect("set wsol account");
        account.pubkey()
    }

    pub fn create_token_account(&mut self, owner: Pubkey, mint: Pubkey) -> Pubkey {
        let token_account = Keypair::new();
        let rent: Rent = self.svm.get_sysvar();
        let rent_lamports = rent.minimum_balance(TokenAccountState::LEN);

        let create_ix = system_instruction::create_account(
            &self.payer.pubkey(),
            &token_account.pubkey(),
            rent_lamports,
            TokenAccountState::LEN as u64,
            &TOKEN_2022_ID,
        );
        let init_ix = initialize_account3(&TOKEN_2022_ID, &token_account.pubkey(), &mint, &owner)
            .expect("initialize_account3");
        Self::send_instructions(
            &mut self.svm,
            &[create_ix, init_ix],
            &[self.payer.pubkey(), token_account.pubkey()],
        )
        .expect("create+init token account");

        token_account.pubkey()
    }

    pub fn mint_tokens(&mut self, mint: Pubkey, destination: Pubkey, amount: u64) {
        let ix = mint_to(
            &TOKEN_2022_ID,
            &mint,
            &destination,
            &self.mint_authority.pubkey(),
            &[],
            amount,
        )
        .expect("mint_to");
        Self::send_instruction(
            &mut self.svm,
            ix,
            &[self.payer.pubkey(), self.mint_authority.pubkey()],
        )
        .expect("mint tokens");
    }

    pub fn approve_delegate(
        &mut self,
        owner: &Keypair,
        asset: Pubkey,
        mint: Pubkey,
        token_account: Pubkey,
        amount: u64,
        decimals: u8,
    ) {
        let delegate = self.wallet(asset);
        let ix = approve_checked(
            &TOKEN_2022_ID,
            &token_account,
            &mint,
            &delegate,
            &owner.pubkey(),
            &[],
            amount,
            decimals,
        )
        .expect("approve_checked");
        Self::send_instruction(&mut self.svm, ix, &[self.payer.pubkey(), owner.pubkey()])
            .expect("approve delegate");
    }

    pub fn fund_wallet(&mut self, asset: Pubkey) {
        let wallet = self.wallet(asset);
        self.svm
            .airdrop(&wallet, LAMPORTS_PER_SOL)
            .expect("airdrop wallet");
    }

    pub fn write_locked_asset(
        &mut self,
        asset: Pubkey,
        identifier: [u8; 33],
        public_key: [u8; 33],
        last_sign_count: u32,
    ) {
        // Spends require phygital_token.owner == wallet PDA.
        let wallet = self.wallet(asset);
        self.write_token_account(asset, wallet, identifier, public_key, last_sign_count, true);
    }

    pub fn write_unlocked_asset(
        &mut self,
        asset: Pubkey,
        identifier: [u8; 33],
        public_key: [u8; 33],
    ) {
        let wallet = self.wallet(asset);
        self.write_token_account(asset, wallet, identifier, public_key, 0, false);
    }

    /// Test helper: locked token whose `owner` is *not* the wallet PDA.
    pub fn write_locked_asset_with_owner(
        &mut self,
        asset: Pubkey,
        owner: Pubkey,
        identifier: [u8; 33],
        public_key: [u8; 33],
        last_sign_count: u32,
    ) {
        self.write_token_account(asset, owner, identifier, public_key, last_sign_count, true);
    }

    fn write_token_account(
        &mut self,
        token: Pubkey,
        owner: Pubkey,
        identifier: [u8; 33],
        public_key: [u8; 33],
        last_sign_count: u32,
        is_locked: bool,
    ) {
        let token_data = PhygitalToken {
            discriminator: PHYGITAL_TOKEN_DISCRIMINATOR,
            owner: owner.to_bytes().into(),
            mint: Pubkey::default().to_bytes().into(),
            last_sign_count,
            token_type: PhygitalTokenType::Controlled as u8,
            is_locked: is_locked as u8,
            public_key,
            identifier,
        };
        let data = borsh::to_vec(&token_data).expect("serialize token");
        let rent: Rent = self.svm.get_sysvar();
        self.svm
            .set_account(
                token,
                SolanaAccount {
                    lamports: rent.minimum_balance(data.len()),
                    data,
                    owner: phygital_token_client::PHYGITAL_TOKEN_ID,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .expect("set token account");
    }

    pub fn lamports(&self, address: Pubkey) -> u64 {
        self.svm
            .get_account(&address)
            .map(|a| a.lamports)
            .unwrap_or(0)
    }

    pub fn account_exists(&self, address: Pubkey) -> bool {
        self.svm
            .get_account(&address)
            .map(|a| a.lamports > 0 && !a.data.is_empty())
            .unwrap_or(false)
    }

    pub fn token_balance(&self, token_account: Pubkey) -> u64 {
        let account = self.svm.get_account(&token_account).expect("token account");
        TokenAccountState::unpack_from_slice(&account.data)
            .expect("unpack token account")
            .amount
    }

    pub fn last_sign_count(&self, asset: Pubkey) -> u32 {
        let account = self.svm.get_account(&asset).expect("token account");
        let decoded = PhygitalToken::try_from_slice(&account.data).expect("deserialize token");
        decoded.last_sign_count
    }

    /// Current SVM clock unix timestamp.
    pub fn now_unix(&self) -> i64 {
        let clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp
    }

    /// Warp the SVM clock forward by `seconds` (for rolling-window tests).
    pub fn warp_seconds(&mut self, seconds: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp += seconds;
        self.svm.set_sysvar(&clock);
    }

    // --- compact instruction builders ---

    /// Build remaining accounts + compact SPL transfer_checked for execute.
    pub fn spl_transfer_compact(
        &self,
        asset: Pubkey,
        mint: Pubkey,
        sender_token_account: Pubkey,
        recipient_token_account: Pubkey,
        amount: u64,
        decimals: u8,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let transfer_ix = transfer_checked(
            &TOKEN_2022_ID,
            &sender_token_account,
            &mint,
            &recipient_token_account,
            &wallet,
            &[],
            amount,
            decimals,
        )
        .expect("transfer_checked");

        // remaining: [token_program, sender, mint, recipient, wallet]
        let remaining = vec![
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
            AccountMeta::new(sender_token_account, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(recipient_token_account, false),
            AccountMeta::new_readonly(wallet, false),
        ];
        // TransferChecked accounts: [source, mint, destination, owner].
        let compact = vec![CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![1, 2, 3, 4],
            data: transfer_ix.data,
        }];
        (remaining, compact)
    }

    /// Build remaining accounts + compact system transfer for execute (wallet PDA → recipient).
    pub fn lamport_transfer_compact(
        &self,
        asset: Pubkey,
        recipient: Pubkey,
        amount: u64,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let transfer_ix = system_instruction::transfer(&wallet, &recipient, amount);

        let remaining = vec![
            AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            AccountMeta::new(wallet, false),
            AccountMeta::new(recipient, false),
        ];
        let compact = vec![CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![1, 2],
            data: transfer_ix.data,
        }];
        (remaining, compact)
    }

    /// Build remaining accounts + compact create + initialize Token-2022 mint via wallet PDA.
    /// The mint keypair must co-sign the outer transaction.
    pub fn create_mint_compact(
        &self,
        asset: Pubkey,
        mint: &Pubkey,
        decimals: u8,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let rent: Rent = self.svm.get_sysvar();
        let rent_lamports = rent.minimum_balance(Mint::LEN);

        let create_ix = system_instruction::create_account(
            &wallet,
            mint,
            rent_lamports,
            Mint::LEN as u64,
            &TOKEN_2022_ID,
        );
        let init_ix = initialize_mint2(&TOKEN_2022_ID, mint, &wallet, None, decimals)
            .expect("initialize_mint2");

        let remaining = vec![
            AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            AccountMeta::new(wallet, false),
            AccountMeta::new(*mint, true),
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
        ];
        let compact = vec![
            CompactInstruction {
                program_id_index: 0,
                account_indexes: vec![1, 2],
                data: create_ix.data,
            },
            CompactInstruction {
                program_id_index: 3,
                account_indexes: vec![2],
                data: init_ix.data,
            },
        ];
        (remaining, compact)
    }

    /// Two SPL transfer_checked CPIs in one execute (same mint).
    pub fn dual_spl_transfer_compact(
        &self,
        asset: Pubkey,
        mint: Pubkey,
        sender_token: Pubkey,
        recipient_a: Pubkey,
        recipient_b: Pubkey,
        amount_a: u64,
        amount_b: u64,
        decimals: u8,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let ix_a = transfer_checked(
            &TOKEN_2022_ID,
            &sender_token,
            &mint,
            &recipient_a,
            &wallet,
            &[],
            amount_a,
            decimals,
        )
        .expect("transfer_a");
        let ix_b = transfer_checked(
            &TOKEN_2022_ID,
            &sender_token,
            &mint,
            &recipient_b,
            &wallet,
            &[],
            amount_b,
            decimals,
        )
        .expect("transfer_b");

        // 0 token_program, 1 sender, 2 mint, 3 recip_a, 4 recip_b, 5 wallet
        let remaining = vec![
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
            AccountMeta::new(sender_token, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(recipient_a, false),
            AccountMeta::new(recipient_b, false),
            AccountMeta::new_readonly(wallet, false),
        ];
        let compact = vec![
            CompactInstruction {
                program_id_index: 0,
                account_indexes: vec![1, 2, 3, 5],
                data: ix_a.data,
            },
            CompactInstruction {
                program_id_index: 0,
                account_indexes: vec![1, 2, 4, 5],
                data: ix_b.data,
            },
        ];
        (remaining, compact)
    }

    /// Mixed: system transfer + SPL transfer_checked in one execute.
    pub fn mixed_system_spl_compact(
        &self,
        asset: Pubkey,
        sol_recipient: Pubkey,
        sol_amount: u64,
        mint: Pubkey,
        sender_token: Pubkey,
        recipient_token: Pubkey,
        token_amount: u64,
        decimals: u8,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let sol_ix = system_instruction::transfer(&wallet, &sol_recipient, sol_amount);
        let spl_ix = transfer_checked(
            &TOKEN_2022_ID,
            &sender_token,
            &mint,
            &recipient_token,
            &wallet,
            &[],
            token_amount,
            decimals,
        )
        .expect("transfer_checked");

        // 0 system, 1 wallet, 2 sol_recipient, 3 token_program, 4 sender, 5 mint, 6 recip_token
        let remaining = vec![
            AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            AccountMeta::new(wallet, false),
            AccountMeta::new(sol_recipient, false),
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
            AccountMeta::new(sender_token, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(recipient_token, false),
        ];
        let compact = vec![
            CompactInstruction {
                program_id_index: 0,
                account_indexes: vec![1, 2],
                data: sol_ix.data,
            },
            CompactInstruction {
                program_id_index: 3,
                account_indexes: vec![4, 5, 6, 1],
                data: spl_ix.data,
            },
        ];
        (remaining, compact)
    }

    /// Compact burn_checked of `amount` from a wallet-owned token account.
    pub fn burn_compact(
        &self,
        asset: Pubkey,
        mint: Pubkey,
        token_account: Pubkey,
        amount: u64,
        decimals: u8,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let burn_ix = burn_checked(
            &TOKEN_2022_ID,
            &token_account,
            &mint,
            &wallet,
            &[],
            amount,
            decimals,
        )
        .expect("burn_checked");
        let remaining = vec![
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
            AccountMeta::new(token_account, false),
            AccountMeta::new(mint, false),
            AccountMeta::new_readonly(wallet, false),
        ];
        let compact = vec![CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![1, 2, 3],
            data: burn_ix.data,
        }];
        (remaining, compact)
    }

    /// Compact SPL `approve_checked` (wallet as owner) — an escape instruction the
    /// policy must deny. Denial happens pre-CPI, so account ownership is irrelevant.
    pub fn approve_compact(
        &self,
        asset: Pubkey,
        mint: Pubkey,
        token_account: Pubkey,
        delegate: Pubkey,
        amount: u64,
        decimals: u8,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let ix = approve_checked(
            &TOKEN_2022_ID,
            &token_account,
            &mint,
            &delegate,
            &wallet,
            &[],
            amount,
            decimals,
        )
        .expect("approve_checked");
        let remaining = vec![
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
            AccountMeta::new(token_account, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(delegate, false),
            AccountMeta::new_readonly(wallet, false),
        ];
        let compact = vec![CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![1, 2, 3, 4],
            data: ix.data,
        }];
        (remaining, compact)
    }

    /// Compact SPL `set_authority` (change account owner) — an escape instruction.
    pub fn set_authority_compact(
        &self,
        asset: Pubkey,
        token_account: Pubkey,
        new_authority: Pubkey,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let ix = set_authority(
            &TOKEN_2022_ID,
            &token_account,
            Some(&new_authority),
            AuthorityType::AccountOwner,
            &wallet,
            &[],
        )
        .expect("set_authority");
        let remaining = vec![
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
            AccountMeta::new(token_account, false),
            AccountMeta::new_readonly(wallet, false),
        ];
        let compact = vec![CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![1, 2],
            data: ix.data,
        }];
        (remaining, compact)
    }

    /// Compact System `assign` of the wallet PDA to another program — an escape.
    pub fn assign_compact(
        &self,
        asset: Pubkey,
        new_owner: Pubkey,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let ix = system_instruction::assign(&wallet, &new_owner);
        let remaining = vec![
            AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            AccountMeta::new(wallet, false),
        ];
        let compact = vec![CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![1],
            data: ix.data,
        }];
        (remaining, compact)
    }

    /// Compact close_account — destination receives reclaimed rent lamports.
    pub fn close_token_account_compact(
        &self,
        asset: Pubkey,
        token_account: Pubkey,
        destination: Pubkey,
    ) -> (Vec<AccountMeta>, Vec<CompactInstruction>) {
        let wallet = self.wallet(asset);
        let close_ix = close_account(&TOKEN_2022_ID, &token_account, &destination, &wallet, &[])
            .expect("close_account");
        let remaining = vec![
            AccountMeta::new_readonly(TOKEN_2022_ID, false),
            AccountMeta::new(token_account, false),
            AccountMeta::new(destination, false),
            AccountMeta::new_readonly(wallet, false),
        ];
        let compact = vec![CompactInstruction {
            program_id_index: 0,
            account_indexes: vec![1, 2, 3],
            data: close_ix.data,
        }];
        (remaining, compact)
    }

    // --- execute ---

    /// Passkey-path execute instruction.
    pub fn execute_ix(
        &self,
        asset: Pubkey,
        compact_instructions: Vec<CompactInstruction>,
        remaining: Vec<AccountMeta>,
        secp256r1_verify_args: Secp256r1VerifyArgs,
        slot_number: u64,
    ) -> Instruction {
        let mut accounts = phygital_wallet::accounts::Execute {
            phygital_token: asset,
            wallet: self.wallet(asset),
            authority_account: self.authority_pda(asset),
            slot_hashes: SLOT_HASHES_SYSVAR_ID,
            instructions_sysvar: INSTRUCTIONS_SYSVAR_ID,
            phygital_token_program: phygital_token_client::PHYGITAL_TOKEN_ID,
        }
        .to_account_metas(None);
        accounts.extend(remaining);

        Instruction {
            program_id: self.program_id,
            accounts,
            data: phygital_wallet::instruction::Execute {
                compact_instructions,
                secp256r1_verify_args,
                slot_number,
            }
            .data(),
        }
    }

    /// Authority-path execute instruction.
    pub fn execute_authority_ix(
        &self,
        asset: Pubkey,
        authority: Pubkey,
        compact_instructions: Vec<CompactInstruction>,
        remaining: Vec<AccountMeta>,
    ) -> Instruction {
        let mut accounts = phygital_wallet::accounts::ExecuteWithAuthority {
            authority,
            phygital_token: asset,
            authority_account: self.authority_pda(asset),
            wallet: self.wallet(asset),
            instructions_sysvar: INSTRUCTIONS_SYSVAR_ID,
        }
        .to_account_metas(None);
        accounts.extend(remaining);

        Instruction {
            program_id: self.program_id,
            accounts,
            data: phygital_wallet::instruction::ExecuteWithAuthority {
                compact_instructions,
            }
            .data(),
        }
    }

    /// Passkey-path execute over the current slot.
    pub fn send_execute(
        &mut self,
        asset: Pubkey,
        compact_instructions: Vec<CompactInstruction>,
        remaining: Vec<AccountMeta>,
        passkey: &mut TestPasskey,
        extra_signers: &[Pubkey],
    ) -> litesvm::types::TransactionResult {
        self.send_execute_opts(
            asset,
            compact_instructions,
            remaining,
            passkey,
            extra_signers,
            true,
            None,
            None,
            TEST_RP_ID,
            TEST_ORIGIN,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn send_execute_opts(
        &mut self,
        asset: Pubkey,
        compact_instructions: Vec<CompactInstruction>,
        remaining: Vec<AccountMeta>,
        passkey: &mut TestPasskey,
        extra_signers: &[Pubkey],
        include_secp_ix: bool,
        challenge_override: Option<[u8; 32]>,
        slot_override: Option<(u64, [u8; 32])>,
        rp_id: &str,
        origin: &str,
    ) -> litesvm::types::TransactionResult {
        let (slot_number, slot_hash) =
            slot_override.unwrap_or_else(|| current_slot_entry(&self.svm));
        let challenge = challenge_override.unwrap_or_else(|| {
            let remaining_keys: Vec<_> = remaining.iter().map(|m| m.pubkey).collect();
            build_execute_challenge(slot_hash, &compact_instructions, &remaining_keys)
        });
        let (secp_ix, verify_args) =
            passkey.verify_asset_secp256r1_instruction_with_origin(challenge, rp_id, origin);
        let execute_ix = self.execute_ix(
            asset,
            compact_instructions,
            remaining,
            verify_args,
            slot_number,
        );
        let instructions = if include_secp_ix {
            vec![secp_ix, execute_ix]
        } else {
            vec![execute_ix]
        };
        let mut signers = vec![self.payer.pubkey()];
        for s in extra_signers {
            if !signers.contains(s) {
                signers.push(*s);
            }
        }
        Self::send_instructions(&mut self.svm, &instructions, &signers)
    }

    /// Authority-path execute (no passkey, no policy checks).
    pub fn send_execute_with_authority(
        &mut self,
        asset: Pubkey,
        compact_instructions: Vec<CompactInstruction>,
        remaining: Vec<AccountMeta>,
        authority: &Keypair,
        extra_signers: &[Pubkey],
    ) -> litesvm::types::TransactionResult {
        let execute_ix =
            self.execute_authority_ix(asset, authority.pubkey(), compact_instructions, remaining);
        let mut signers = vec![self.payer.pubkey(), authority.pubkey()];
        for s in extra_signers {
            if !signers.contains(s) {
                signers.push(*s);
            }
        }
        Self::send_instructions(&mut self.svm, &[execute_ix], &signers)
    }

    pub fn send_execute_spl_transfer(
        &mut self,
        asset: Pubkey,
        mint: Pubkey,
        sender_token_account: Pubkey,
        recipient_token_account: Pubkey,
        amount: u64,
        passkey: &mut TestPasskey,
    ) -> litesvm::types::TransactionResult {
        let (remaining, compact) = self.spl_transfer_compact(
            asset,
            mint,
            sender_token_account,
            recipient_token_account,
            amount,
            6,
        );
        self.send_execute(asset, compact, remaining, passkey, &[])
    }

    pub fn send_execute_lamport_transfer(
        &mut self,
        asset: Pubkey,
        recipient: Pubkey,
        amount: u64,
        passkey: &mut TestPasskey,
    ) -> litesvm::types::TransactionResult {
        let (remaining, compact) = self.lamport_transfer_compact(asset, recipient, amount);
        self.send_execute(asset, compact, remaining, passkey, &[])
    }

    pub fn send_execute_create_mint(
        &mut self,
        asset: Pubkey,
        passkey: &mut TestPasskey,
        decimals: u8,
    ) -> (litesvm::types::TransactionResult, Pubkey) {
        let mint = Keypair::new();
        let (remaining, compact) = self.create_mint_compact(asset, &mint.pubkey(), decimals);
        (
            self.send_execute(asset, compact, remaining, passkey, &[mint.pubkey()]),
            mint.pubkey(),
        )
    }

    // --- raw send ---

    pub fn send_instruction(
        svm: &mut LiteSVM,
        instruction: Instruction,
        signers: &[Pubkey],
    ) -> litesvm::types::TransactionResult {
        Self::send_instructions(svm, &[instruction], signers)
    }

    pub fn send_instructions(
        svm: &mut LiteSVM,
        instructions: &[Instruction],
        signers: &[Pubkey],
    ) -> litesvm::types::TransactionResult {
        let blockhash = svm.latest_blockhash();
        let payer = *signers.first().expect("at least one signer");
        let msg = Message::new_with_blockhash(instructions, Some(&payer), &blockhash);
        let signatures = vec![Signature::default(); msg.header.num_required_signatures as usize];
        let tx = VersionedTransaction {
            signatures,
            message: VersionedMessage::Legacy(msg),
        };
        let result = svm.send_transaction(tx);
        svm.expire_blockhash();
        result
    }
}

// --- policy arg builders ---

pub fn mint_cap(mint: Pubkey, cap: u64, window_seconds: i64) -> MintCapArg {
    MintCapArg {
        mint,
        cap,
        window_seconds,
        ..Default::default()
    }
}

pub fn policy_args(mint_caps: Vec<MintCapArg>) -> WalletPolicyArgs {
    WalletPolicyArgs {
        sol_cap: None,
        mint_caps,
        program_permissions: vec![],
    }
}

fn program_artifact_paths(manifest_dir: &std::path::Path, name: &str) -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Ok(cargo_target_dir) = std::env::var("CARGO_TARGET_DIR") {
        paths.push(std::path::PathBuf::from(cargo_target_dir).join(format!("deploy/{name}.so")));
    }
    paths.push(manifest_dir.join(format!("../../target/deploy/{name}.so")));
    paths
}

fn phygital_token_artifact_paths(manifest_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut paths = vec![manifest_dir.join("../../phygital_token.so")];
    paths.extend(program_artifact_paths(manifest_dir, "phygital_token"));
    paths.push(manifest_dir.join("../../../phygital-token/target/deploy/phygital_token.so"));
    paths
}
