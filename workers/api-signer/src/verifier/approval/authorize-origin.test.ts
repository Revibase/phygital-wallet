import { describe, expect, it } from "vitest";
import type { Instruction } from "@solana/kit";
import type { PaymentsPolicyConfig } from "phygital-policy";
import {
  getClearRecoveryWalletInstructionDataEncoder,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { authorizeIntent } from "./index.js";
import { runWithRequestStore } from "@/shared/request-context";
import type { TokenStore } from "@/token-store";

const TOKEN = "11111111111111111111111111111112";

const ALLOWLIST: PaymentsPolicyConfig = {
  version: "3",
  allowedOrigins: ["https://a.example.com"],
};

/** A real wallet config instruction (clear recovery wallet), 9 accounts. */
function configIx(): Instruction {
  const data = getClearRecoveryWalletInstructionDataEncoder().encode({
    secp256r1VerifyArgs: {
      verifyArgsRelativeIndex: 0,
      signedMessageIndex: 0,
      clientDataJson: new Uint8Array(),
    },
    slotNumber: 0,
  });
  const a = (addr: string) => ({
    address: addr as Instruction["programAddress"],
    role: 0,
  });
  return {
    programAddress:
      PHYGITAL_WALLET_PROGRAM_ADDRESS as Instruction["programAddress"],
    data: new Uint8Array(data),
    accounts: [
      a(TOKEN),
      a(TOKEN),
      a(TOKEN),
      a(TOKEN),
      a(TOKEN),
      a(TOKEN),
      a(TOKEN),
      a(TOKEN),
      a(TOKEN),
    ],
  };
}

function fakeStore(opts: {
  policy: PaymentsPolicyConfig | null | "invalid";
  grant?: boolean;
  consume?: boolean;
}): TokenStore {
  return {
    loadPolicyDocument: () => opts.policy,
    findValidGrant: (intentHash: string) =>
      opts.grant ? { intentHash } : null,
    tryConsumeGrant: () => opts.consume ?? false,
  } as unknown as TokenStore;
}

function authorize(
  store: TokenStore,
  args: {
    mode: "preview" | "sign";
    origin: string | null;
    instructions?: Instruction[];
  },
) {
  return runWithRequestStore({ env: {} as Env, tokenStore: store }, () =>
    authorizeIntent({
      phygitalToken: TOKEN,
      instructions: args.instructions ?? [],
      mode: args.mode,
      origin: args.origin,
    }),
  );
}

describe("authorizeIntent — origin allowlist (soft)", () => {
  it("soft-denies an unlisted origin on sign with no grant", async () => {
    const r = await authorize(fakeStore({ policy: ALLOWLIST }), {
      mode: "sign",
      origin: "https://evil.example.com",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("origin_not_allowed");
    expect(r.soft).toBe(true);
    expect(r.details?.origin).toBe("https://evil.example.com");
  });

  it("soft-denies a null (server) origin when an allowlist exists", async () => {
    const r = await authorize(fakeStore({ policy: ALLOWLIST }), {
      mode: "sign",
      origin: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("origin_not_allowed");
    expect(r.soft).toBe(true);
  });

  it("clears the block when a grant is consumed on sign", async () => {
    const r = await authorize(fakeStore({ policy: ALLOWLIST, consume: true }), {
      mode: "sign",
      origin: "https://evil.example.com",
    });
    expect(r.ok).toBe(true);
  });

  it("clears the block when a valid grant exists on preview", async () => {
    const r = await authorize(fakeStore({ policy: ALLOWLIST, grant: true }), {
      mode: "preview",
      origin: "https://evil.example.com",
    });
    expect(r.ok).toBe(true);
  });

  it("allows a listed origin (falls through to instruction policy)", async () => {
    const r = await authorize(fakeStore({ policy: ALLOWLIST }), {
      mode: "sign",
      origin: "https://a.example.com",
    });
    // Empty instruction body is rejected by the policy engine, proving the
    // origin gate passed and evaluatePolicy ran instead of short-circuiting.
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).not.toBe("origin_not_allowed");
  });
});

describe("authorizeIntent — config change (soft, grant-gated)", () => {
  it("soft-denies a config change with no grant, even with no policy", async () => {
    const r = await authorize(fakeStore({ policy: null }), {
      mode: "sign",
      origin: null,
      instructions: [configIx()],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("config_change");
    expect(r.soft).toBe(true);
  });

  it("proceeds once the owner's grant is consumed on sign", async () => {
    const r = await authorize(fakeStore({ policy: null, consume: true }), {
      mode: "sign",
      origin: null,
      instructions: [configIx()],
    });
    expect(r.ok).toBe(true);
  });

  it("preview surfaces the soft config deny with an intent hash", async () => {
    const r = await authorize(fakeStore({ policy: null }), {
      mode: "preview",
      origin: null,
      instructions: [configIx()],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("config_change");
    expect(typeof r.intentHash).toBe("string");
  });
});
