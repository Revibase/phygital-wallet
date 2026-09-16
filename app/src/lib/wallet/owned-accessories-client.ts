import {
  getAddressDecoder,
  getBase58Decoder,
  getBase64Encoder,
  type Base58EncodedBytes,
} from "@solana/kit";
import {
  AUTHORITY_DISCRIMINATOR,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { DEFAULT_TOKEN_OWNER } from "@/lib/phygital/token";
import { getSolanaRpc } from "@/lib/solana/rpc";

/**
 * Every accessory the owner controls, found by an authority-filtered
 * `getProgramAccounts` over the phygital-wallet program.
 *
 * The `Authority` account stores `header.authority` (the owner) at byte
 * offset 8 and `header.phygitalToken` at offset 40 (right after the 8-byte
 * discriminator) — the program keeps the token there specifically "for
 * authority-filtered GPA discovery". A `dataSlice` returns only the 32-byte
 * token, keeping the response tiny.
 */
const OWNER_OFFSET = 8n;
const TOKEN_OFFSET = 40;
const TOKEN_LENGTH = 32;

const base58 = getBase58Decoder();
const base64 = getBase64Encoder();
const addressDecoder = getAddressDecoder();

export async function fetchOwnedAccessories(owner: string): Promise<string[]> {
  const rpc = getSolanaRpc();

  const discriminator = base58.decode(AUTHORITY_DISCRIMINATOR) as Base58EncodedBytes;

  const accounts = await rpc
    .getProgramAccounts(PHYGITAL_WALLET_PROGRAM_ADDRESS, {
      encoding: "base64",
      dataSlice: { offset: TOKEN_OFFSET, length: TOKEN_LENGTH },
      filters: [
        { memcmp: { offset: 0n, bytes: discriminator, encoding: "base58" } },
        {
          memcmp: {
            offset: OWNER_OFFSET,
            bytes: owner as Base58EncodedBytes,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  const unset = String(DEFAULT_TOKEN_OWNER);
  const tokens: string[] = [];
  for (const entry of accounts) {
    const [data] = entry.account.data;
    const bytes = new Uint8Array(base64.encode(data));
    const token = String(addressDecoder.decode(bytes));
    // Zero pubkey / System Program — never a real accessory PDA.
    if (token === unset) continue;
    tokens.push(token);
  }
  return tokens;
}
