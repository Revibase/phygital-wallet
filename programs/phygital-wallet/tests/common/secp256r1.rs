use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{SigningKey, VerifyingKey};
use phygital_wallet::Secp256r1VerifyArgs;
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

pub const TEST_RP_ID: &str = "app.revibase.com";
pub const TEST_ORIGIN: &str = "https://app.revibase.com";

const COMPRESSED_PUBKEY_SERIALIZED_SIZE: usize = 33;
const SIGNATURE_OFFSETS_SERIALIZED_SIZE: usize = 14;
const SIGNATURE_OFFSETS_START: usize = 2;
const SIGNATURE_SERIALIZED_SIZE: usize = 64;
const DATA_START: usize = SIGNATURE_OFFSETS_SERIALIZED_SIZE + SIGNATURE_OFFSETS_START;
const SECP256R1_PROGRAM_ID: Pubkey = pubkey!("Secp256r1SigVerify1111111111111111111111111");

const SECP256R1_HALF_ORDER: [u8; 32] = [
    0x7F, 0xFF, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x00, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xDE, 0x73, 0x7D, 0x56, 0xD3, 0x8B, 0xCF, 0x42, 0x79, 0xDC, 0xE5, 0x61, 0x7E, 0x31, 0x92, 0xA8,
];
const SECP256R1_ORDER: [u8; 32] = [
    0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xBC, 0xE6, 0xFA, 0xAD, 0xA7, 0x17, 0x9E, 0x84, 0xF3, 0xB9, 0xCA, 0xC2, 0xFC, 0x63, 0x25, 0x51,
];

#[derive(Clone)]
pub struct TestPasskey {
    signing_key: SigningKey,
    pub compressed_pubkey: [u8; 33],
    /// Next WebAuthn signCount to emit (must exceed on-chain `last_sign_count`).
    next_sign_count: u32,
}

impl TestPasskey {
    pub fn generate() -> Self {
        let signing_key = SigningKey::random(&mut OsRng);
        let verifying_key = VerifyingKey::from(&signing_key);
        let compressed_pubkey = verifying_key
            .to_encoded_point(true)
            .as_bytes()
            .try_into()
            .expect("compressed secp256r1 pubkey");
        Self {
            signing_key,
            compressed_pubkey,
            next_sign_count: 1,
        }
    }

    /// `challenge` is the WebAuthn challenge (execute challenge hash).
    pub fn verify_asset_secp256r1_instruction_with_rp_id(
        &mut self,
        challenge: [u8; 32],
        rp_id: &str,
    ) -> (Instruction, Secp256r1VerifyArgs) {
        self.verify_asset_secp256r1_instruction_with_origin(challenge, rp_id, TEST_ORIGIN)
    }

    /// Like `_with_rp_id`, but with an explicit clientDataJSON `origin`.
    pub fn verify_asset_secp256r1_instruction_with_origin(
        &mut self,
        challenge: [u8; 32],
        rp_id: &str,
        origin: &str,
    ) -> (Instruction, Secp256r1VerifyArgs) {
        let mut client_data_json = Vec::new();
        client_data_json.extend_from_slice(br#"{"type":"webauthn.get","challenge":"#);
        Self::ccd_to_string(&URL_SAFE_NO_PAD.encode(challenge), &mut client_data_json);
        client_data_json.extend_from_slice(br#","origin":"#);
        Self::ccd_to_string(origin, &mut client_data_json);
        client_data_json.extend_from_slice(br#","crossOrigin":false}"#);

        let client_data_hash: [u8; 32] = Sha256::digest(&client_data_json).into();
        let rp_id_hash: [u8; 32] = Sha256::digest(rp_id.as_bytes()).into();

        let sign_count = self.next_sign_count;
        self.next_sign_count = self.next_sign_count.saturating_add(1);

        let mut authenticator_data = Vec::with_capacity(37);
        authenticator_data.extend_from_slice(&rp_id_hash);
        authenticator_data.push(0x01);
        authenticator_data.extend_from_slice(&sign_count.to_be_bytes());

        let mut signed_message = Vec::with_capacity(authenticator_data.len() + 32);
        signed_message.extend_from_slice(&authenticator_data);
        signed_message.extend_from_slice(&client_data_hash);

        let signature: p256::ecdsa::Signature = self.signing_key.sign(&signed_message);
        let signature_bytes = normalize_low_s(signature.to_bytes().into());

        let ix = new_secp256r1_instruction_with_signature(
            &signed_message,
            &signature_bytes,
            &self.compressed_pubkey,
        );

        let verify_args = Secp256r1VerifyArgs {
            verify_args_relative_index: -1,
            signed_message_index: 0,
            client_data_json,
        };

        (ix, verify_args)
    }

    fn ccd_to_string(value: &str, output: &mut Vec<u8>) {
        output.push(b'"');
        output.extend_from_slice(value.as_bytes());
        output.push(b'"');
    }
}

fn cmp_be(a: &[u8], b: &[u8]) -> std::cmp::Ordering {
    a.cmp(b)
}

fn sub_be(order: &[u8; 32], value: &[u8]) -> [u8; 32] {
    let mut borrow = 0i16;
    let mut out = [0u8; 32];
    for i in (0..32).rev() {
        let diff = order[i] as i16 - value[i] as i16 - borrow;
        if diff < 0 {
            out[i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            out[i] = diff as u8;
            borrow = 0;
        }
    }
    out
}

fn normalize_low_s(mut signature: [u8; 64]) -> [u8; 64] {
    let mut s = [0u8; 32];
    s.copy_from_slice(&signature[32..]);
    if cmp_be(&s, &SECP256R1_HALF_ORDER) != std::cmp::Ordering::Greater {
        return signature;
    }
    signature[32..].copy_from_slice(&sub_be(&SECP256R1_ORDER, &s));
    signature
}

fn new_secp256r1_instruction_with_signature(
    message: &[u8],
    signature: &[u8; SIGNATURE_SERIALIZED_SIZE],
    pubkey: &[u8; COMPRESSED_PUBKEY_SERIALIZED_SIZE],
) -> Instruction {
    let public_key_offset = DATA_START;
    let signature_offset = public_key_offset + COMPRESSED_PUBKEY_SERIALIZED_SIZE;
    let message_data_offset = signature_offset + SIGNATURE_SERIALIZED_SIZE;

    let mut instruction_data = Vec::with_capacity(message_data_offset + message.len());
    instruction_data.push(1);
    instruction_data.push(0);
    instruction_data.extend_from_slice(&(signature_offset as u16).to_le_bytes());
    instruction_data.extend_from_slice(&u16::MAX.to_le_bytes());
    instruction_data.extend_from_slice(&(public_key_offset as u16).to_le_bytes());
    instruction_data.extend_from_slice(&u16::MAX.to_le_bytes());
    instruction_data.extend_from_slice(&(message_data_offset as u16).to_le_bytes());
    instruction_data.extend_from_slice(&(message.len() as u16).to_le_bytes());
    instruction_data.extend_from_slice(&u16::MAX.to_le_bytes());
    instruction_data.extend_from_slice(pubkey);
    instruction_data.extend_from_slice(signature);
    instruction_data.extend_from_slice(message);

    Instruction {
        program_id: SECP256R1_PROGRAM_ID,
        accounts: vec![],
        data: instruction_data,
    }
}

pub fn current_slot_entry(svm: &litesvm::LiteSVM) -> (u64, [u8; 32]) {
    let slot_hashes: solana_slot_hashes::SlotHashes = svm.get_sysvar();
    let (slot, hash) = slot_hashes
        .first()
        .expect("slot hashes sysvar should contain at least one entry");
    (*slot, hash.to_bytes())
}
