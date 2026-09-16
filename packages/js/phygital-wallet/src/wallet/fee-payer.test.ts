import { address } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import { createDefaultFeePayer } from "./fee-payer.js";

describe("createDefaultFeePayer", () => {
  it("discovers the default fee payer from the Revibase API", async () => {
    const feePayer = address("11111111111111111111111111111112");
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ feePayer }))
    );

    const signer = await createDefaultFeePayer({
      fetch: fetchMock,
    });

    expect(signer.address).toBe(feePayer);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.revibase.com/getFeePayer"
    );
  });
});
