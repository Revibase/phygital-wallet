import {
  address,
  getAddressDecoder,
  getBase58Decoder,
  getBase64Encoder,
  type Address,
  type Base58EncodedBytes,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";

import {
  AUTHORITY_DISCRIMINATOR,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "../generated/index.js";

/**
 * Must match `programs/phygital-wallet` `AUTHORITY_VERSION`.
 * GPA filters on this byte the same way `Authority::read_header` rejects
 * `UnsupportedAuthorityVersion`.
 */
export const AUTHORITY_VERSION = 1;

/** System program / default pubkey — never a real phygital token PDA. */
const UNSET_TOKEN = address("11111111111111111111111111111111");

/** Layout offsets after the 8-byte Anchor discriminator. */
export const AUTHORITY_GPA = {
  /** `header.authority` */
  authorityOffset: 8n,
  /** `header.phygitalToken` */
  phygitalTokenOffset: 40,
  phygitalTokenLength: 32,
  /**
   * `header.version` —
   * `8 + 32 + 32 + 32 + 1 + 1` (disc + authority + token + payer + bumps).
   */
  versionOffset: 106n,
} as const;

const base58 = getBase58Decoder();
const base64 = getBase64Encoder();
const addressDecoder = getAddressDecoder();

/**
 * Every phygital token PDA this ed25519 authority controls, via
 * authority-filtered `getProgramAccounts` on the wallet program.
 *
 * Filters: Authority discriminator + `header.authority` + `header.version`.
 * Response is data-sliced to the 32-byte token field only. Dedupes and drops
 * the unset/system pubkey.
 */
export async function fetchPhygitalTokensByAuthority(
  rpc: Rpc<SolanaRpcApi>,
  authority: Address,
): Promise<Address[]> {
  const discriminator = base58.decode(
    AUTHORITY_DISCRIMINATOR,
  ) as Base58EncodedBytes;
  const version = base58.decode(
    new Uint8Array([AUTHORITY_VERSION]),
  ) as Base58EncodedBytes;

  const accounts = await rpc
    .getProgramAccounts(PHYGITAL_WALLET_PROGRAM_ADDRESS, {
      encoding: "base64",
      dataSlice: {
        offset: AUTHORITY_GPA.phygitalTokenOffset,
        length: AUTHORITY_GPA.phygitalTokenLength,
      },
      filters: [
        { memcmp: { offset: 0n, bytes: discriminator, encoding: "base58" } },
        {
          memcmp: {
            offset: AUTHORITY_GPA.authorityOffset,
            bytes: authority as Base58EncodedBytes,
            encoding: "base58",
          },
        },
        {
          memcmp: {
            offset: AUTHORITY_GPA.versionOffset,
            bytes: version,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  const unset = String(UNSET_TOKEN);
  const seen = new Set<string>();
  const tokens: Address[] = [];
  for (const entry of accounts) {
    const [data] = entry.account.data;
    const bytes = new Uint8Array(base64.encode(data));
    const token = addressDecoder.decode(bytes);
    const key = String(token);
    if (key === unset || seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}
