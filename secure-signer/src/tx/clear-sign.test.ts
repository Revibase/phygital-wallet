import { describe, expect, it } from "vitest";
import { none, some, address } from "@solana/kit";
import {
  describeInnerInstruction,
  describeWalletPolicy,
  formatUnits,
  windowPhrase,
} from "./clear-sign.js";

const SYSTEM = "11111111111111111111111111111111";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MEMO = "MemoSq4gqBnyyd8CMoPbUxRWDFBIdzy9SHRdJrEqeL";

describe("clear-sign", () => {
  it("formats SOL transfers", () => {
    const data = Uint8Array.from([2, 0, 0, 0, 0, 202, 154, 59, 0, 0, 0, 0]);
    const cleared = describeInnerInstruction(
      SYSTEM,
      ["Wallet11111111111111111111111111111111", "Dest111111111111111111111111111111111"],
      data,
    );
    expect(cleared.title).toBe("Send 1 SOL");
    expect(cleared.details.map((d) => d.label)).toEqual(["From", "To"]);
  });

  it("formats transfer-checked amounts", () => {
    const data = Uint8Array.from([12, 232, 3, 0, 0, 0, 0, 0, 0, 6]);
    const cleared = describeInnerInstruction(
      TOKEN,
      ["SrcAta", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "DstAta", "Owner"],
      data,
    );
    expect(cleared.title).toContain("0.001");
    expect(cleared.title).toContain("Token");
  });

  it("decodes memos as utf8", () => {
    const text = "hello-token-pda";
    const cleared = describeInnerInstruction(
      MEMO,
      [],
      new TextEncoder().encode(text),
    );
    expect(cleared.title).toBe("Memo");
    expect(cleared.details[0]?.value).toBe(text);
  });

  it("describes wallet policy caps and program rules", () => {
    const rows = describeWalletPolicy({
      solCap: some({ cap: 1_500_000_000n, windowSeconds: 86_400n }),
      mintCaps: [
        {
          mint: address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
          cap: 100n,
          windowSeconds: 0n,
        },
      ],
      programPermissions: [
        {
          programId: address(TOKEN),
          access: { __kind: "Denied" },
        },
      ],
    });
    expect(rows[0]?.value).toContain("1.5 SOL");
    expect(rows[0]?.value).toContain("every day");
    expect(rows[1]?.value).toContain("raw");
    expect(rows[1]?.value).toContain("lifetime");
    expect(rows[2]?.value).toContain("Denied");
  });

  it("describes absent sol cap", () => {
    const rows = describeWalletPolicy({
      solCap: none(),
      mintCaps: [],
      programPermissions: [],
    });
    expect(rows[0]?.value).toMatch(/None/i);
  });

  it("formats units and windows", () => {
    expect(formatUnits(1_000_000_000n, 9)).toBe("1");
    expect(windowPhrase(0n)).toBe("lifetime");
  });
});
