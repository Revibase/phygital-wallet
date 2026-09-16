import { address, getAddressEncoder, getBase64Decoder } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import {
  AUTHORITY_GPA,
  AUTHORITY_VERSION,
  fetchPhygitalTokensByAuthority,
} from "./fetch-phygital-tokens-by-authority.js";

const encodeAddress = getAddressEncoder();
/** Bytes → base64 string (kit decoder). */
const toBase64 = getBase64Decoder();

function sliceAsBase64(token: ReturnType<typeof address>): string {
  const bytes = new Uint8Array(encodeAddress.encode(token));
  return toBase64.decode(bytes);
}

describe("AUTHORITY_GPA layout", () => {
  it("matches AuthorityHeader field offsets after the discriminator", () => {
    expect(AUTHORITY_GPA.authorityOffset).toBe(8n);
    expect(AUTHORITY_GPA.phygitalTokenOffset).toBe(40);
    expect(AUTHORITY_GPA.phygitalTokenLength).toBe(32);
    expect(AUTHORITY_GPA.versionOffset).toBe(106n);
    expect(AUTHORITY_VERSION).toBe(1);
  });
});

describe("fetchPhygitalTokensByAuthority", () => {
  it("filters GPA by disc, authority, and version; dedupes tokens", async () => {
    const authority = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const tokenA = address("So11111111111111111111111111111111111111112");
    const tokenB = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const unset = address("11111111111111111111111111111111");

    const getProgramAccounts = vi.fn(() => ({
      send: async () => [
        { account: { data: [sliceAsBase64(tokenA), "base64"] as const } },
        { account: { data: [sliceAsBase64(tokenA), "base64"] as const } },
        { account: { data: [sliceAsBase64(tokenB), "base64"] as const } },
        { account: { data: [sliceAsBase64(unset), "base64"] as const } },
      ],
    }));

    const rpc = { getProgramAccounts } as never;
    const tokens = await fetchPhygitalTokensByAuthority(rpc, authority);

    expect(tokens.map(String)).toEqual([String(tokenA), String(tokenB)]);

    const [, config] = getProgramAccounts.mock.calls[0]!;
    expect(config.dataSlice).toEqual({
      offset: AUTHORITY_GPA.phygitalTokenOffset,
      length: AUTHORITY_GPA.phygitalTokenLength,
    });
    expect(config.filters).toHaveLength(3);
    expect(config.filters[0].memcmp.offset).toBe(0n);
    expect(config.filters[1].memcmp.offset).toBe(AUTHORITY_GPA.authorityOffset);
    expect(config.filters[1].memcmp.bytes).toBe(authority);
    expect(config.filters[2].memcmp.offset).toBe(AUTHORITY_GPA.versionOffset);
  });
});
