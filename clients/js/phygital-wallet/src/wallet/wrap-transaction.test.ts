import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  getU64Encoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type AccountMeta,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Instruction,
  type Rpc,
  type Transaction,
} from "@solana/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";

import {
  DEFAULT_VERIFIER_API_BASE,
  SLOT_HASHES_SYSVAR_ADDRESS,
} from "../constants.js";
import { PHYGITAL_WALLET_PROGRAM_ADDRESS } from "../generated/programs/phygitalWallet.js";
import {
  getConfigEncoder,
  type ConfigArgs,
} from "../generated/accounts/config.js";
import {
  getTokenVerifierEncoder,
  type TokenVerifierArgs,
} from "../generated/accounts/tokenVerifier.js";
import { findConfigPda } from "../generated/pdas/config.js";
import { findTokenVerifierPda } from "../generated/pdas/tokenVerifier.js";
import { findWalletPda } from "../generated/pdas/wallet.js";
import { createVerifierEndpointSigner, fetchVerifierAccountSnapshot, resolveVerifier } from "./resolve-verifier.js";
import { getPhygitalWalletSigner } from "./signer.js";

type MockRpc = Rpc<GetAccountInfoApi & GetMultipleAccountsApi>;

function encodeAccountData(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function createAccountInfo(
  data: Uint8Array,
  owner: Address = PHYGITAL_WALLET_PROGRAM_ADDRESS,
) {
  return {
    data: [encodeAccountData(data), "base64"] as const,
    owner,
    lamports: 1_000_000n,
    executable: false,
    rentEpoch: 0n,
    space: BigInt(data.length),
  };
}

/** SlotHashes entry layout after the vec-len header: [slot u64 LE][hash 32]. */
function createSlotHashesAccountInfo(
  slotNumber = 100n,
  slotHash = new Uint8Array(32).fill(7),
) {
  const entry = new Uint8Array(40);
  entry.set(new Uint8Array(getU64Encoder().encode(slotNumber)), 0);
  entry.set(slotHash, 8);
  return createAccountInfo(entry, address("11111111111111111111111111111111"));
}

async function createMockRpc(options: {
  tokenVerifier?: TokenVerifierArgs | null;
  config?: ConfigArgs;
}): Promise<MockRpc> {
  const [configPda] = await findConfigPda();
  const accounts = new Map<string, ReturnType<typeof createAccountInfo>>();

  accounts.set(SLOT_HASHES_SYSVAR_ADDRESS, createSlotHashesAccountInfo());

  if (options.config) {
    accounts.set(
      configPda,
      createAccountInfo(getConfigEncoder().encode(options.config)),
    );
  }

  if (options.tokenVerifier) {
    const [tokenVerifierPda] = await findTokenVerifierPda({
      phygitalToken: options.tokenVerifier.phygitalToken,
    });
    accounts.set(
      tokenVerifierPda,
      createAccountInfo(getTokenVerifierEncoder().encode(options.tokenVerifier)),
    );
  }

  const rpc = {
    getAccountInfo: (accountAddress: Address) => ({
      send: async () => ({
        context: { slot: 1n },
        value: accounts.get(accountAddress) ?? null,
      }),
    }),
    getMultipleAccounts: (addresses: readonly Address[]) => ({
      send: async () => ({
        context: { slot: 1n },
        value: addresses.map(
          (accountAddress) => accounts.get(accountAddress) ?? null,
        ),
      }),
    }),
    getBlockHeight: () => ({
      send: async () => 1n,
    }),
    getLatestBlockhash: () => ({
      send: async () => ({
        context: { slot: 1n },
        value: {
          blockhash: "11111111111111111111111111111111",
          lastValidBlockHeight: 999n,
        },
      }),
    }),
    getRecentPrioritizationFees: (
      _lockedWritableAccounts?: readonly Address[],
    ) => ({
      send: async () => [
        { slot: 1n, prioritizationFee: 2_000n },
        { slot: 2n, prioritizationFee: 5_000n },
        { slot: 3n, prioritizationFee: 10_000n },
      ],
    }),
    simulateTransaction: () => ({
      send: async () => ({
        context: { slot: 1n },
        value: {
          err: null,
          logs: [],
          accounts: null,
          unitsConsumed: 100_000n,
          returnData: null,
          innerInstructions: null,
          replacementBlockhash: null,
        },
      }),
    }),
  };

  return rpc as MockRpc;
}

function defaultConfigArgs(verifier: Address): ConfigArgs {
  return {
    admin: address("11111111111111111111111111111112"),
    verifiers: [
      verifier,
      verifier,
      verifier,
      verifier,
      verifier,
      verifier,
      verifier,
      verifier,
    ],
    verifierCount: 1,
    bump: 255,
    padding: new Uint8Array(6),
  };
}

const RECIPIENT = address("So11111111111111111111111111111111111111112");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const PHYGITAL_TOKEN = address("DuPpckdjjgVAnYok2aTMAt264ZPBXqq3JSazJjCUzTJQ");
const CONFIG_VERIFIER = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const OVERRIDE_VERIFIER = address("Fjbi9JrRAmSBdxQxbkcxYDp6JUwnLbFhU2GsieWQBLSg");
const SECP256R1_PROGRAM = address(
  "Secp256r1SigVerify1111111111111111111111111",
);
const FEE_PAYER = address("11111111111111111111111111111113");
const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

vi.mock("phygital-token-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("phygital-token-sdk")>();
  return {
    ...actual,
    authenticatePasskeyForSecp256r1Verify: vi.fn(async () => ({ mocked: true })),
    buildSecp256r1VerifyInstruction: vi.fn(async () => ({
      secp256r1VerifyInstruction: {
        programAddress: SECP256R1_PROGRAM,
        data: new Uint8Array([1]),
      },
      phygitalTokenPda: PHYGITAL_TOKEN,
      secp256r1VerifyArgs: {
        verifyArgsRelativeIndex: 0,
        signedMessageIndex: 0,
        clientDataJson: new Uint8Array([0x7b, 0x7d]),
      },
    })),
  };
});

function mockInstruction(
  programAddress: Address,
  accounts: AccountMeta[] = [],
  data: Uint8Array = new Uint8Array([2, 0, 0, 0]),
): Instruction {
  return { programAddress, accounts, data };
}

function compileUnsigned(
  instructions: readonly Instruction[],
  feePayer: Address = FEE_PAYER,
) {
  return compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (message) =>
        setTransactionMessageFeePayerSigner(createNoopSigner(feePayer), message),
      (message) =>
        setTransactionMessageLifetimeUsingBlockhash(
          {
            blockhash: "11111111111111111111111111111111",
            lastValidBlockHeight: 999n,
          },
          message,
        ),
      (message) =>
        appendTransactionMessageInstructions([...instructions], message),
    ),
  );
}

function getTransactionProgramAddresses(transaction: Transaction): Address[] {
  const compiledMessage = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  );
  return getInstructionsFromCompiledTransactionMessage(compiledMessage).map(
    (instruction) => instruction.programAddress,
  );
}

function readComputeBudget(transaction: Transaction): {
  unitLimit?: number;
  unitPrice?: bigint;
} {
  const compiledMessage = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  );
  const instructions =
    getInstructionsFromCompiledTransactionMessage(compiledMessage);

  let unitLimit: number | undefined;
  let unitPrice: bigint | undefined;

  for (const instruction of instructions) {
    if (instruction.programAddress !== COMPUTE_BUDGET_PROGRAM_ADDRESS) continue;
    const data = instruction.data;
    if (!data || data.length === 0) continue;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data[0] === 2 && data.length >= 5) {
      unitLimit = view.getUint32(1, true);
    } else if (data[0] === 3 && data.length >= 9) {
      unitPrice = view.getBigUint64(1, true);
    }
  }

  return { unitLimit, unitPrice };
}

describe("resolveVerifier", () => {
  it("prefers token verifier override over config verifiers", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
      tokenVerifier: {
        phygitalToken: PHYGITAL_TOKEN,
        verifier: OVERRIDE_VERIFIER,
        endpoint: "https://example.com/sign",
        payer: FEE_PAYER,
        bump: 254,
      },
    });

    const verifier = await resolveVerifier(rpc, PHYGITAL_TOKEN);
    expect(verifier.verifier.address).toBe(OVERRIDE_VERIFIER);
    expect(verifier.usesDefaultPaymaster).toBe(false);
    expect(verifier.requiresOwnerCosignAssertion).toBe(false);
  });

  it("falls back to config verifiers when no token override exists", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });

    const verifier = await resolveVerifier(rpc, PHYGITAL_TOKEN);
    expect(verifier.verifier.address).toBe(CONFIG_VERIFIER);
    expect(verifier.usesDefaultPaymaster).toBe(true);
  });

  it("reuses a snapshot without calling getMultipleAccounts", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const snapshot = await fetchVerifierAccountSnapshot(rpc, PHYGITAL_TOKEN);
    const getMultipleAccounts = vi.fn(() => {
      throw new Error("should not fetch");
    });
    const coldRpc = {
      getMultipleAccounts,
      getAccountInfo: rpc.getAccountInfo,
    } as unknown as MockRpc;

    const resolved = await resolveVerifier(coldRpc, PHYGITAL_TOKEN, {
      snapshot,
    });
    expect(resolved.verifier.address).toBe(snapshot.verifierAddress);
    expect(getMultipleAccounts).not.toHaveBeenCalled();
  });
});

describe("createVerifierEndpointSigner", () => {
  it("POSTs wire transactions to the endpoint and returns partial signatures", async () => {
    const signatureBase64 = Buffer.alloc(64, 7).toString("base64");
    const mockFetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.transactions).toHaveLength(1);
      return {
        ok: true,
        json: async () => ({ signatures: [signatureBase64] }),
      };
    });

    const signer = createVerifierEndpointSigner(CONFIG_VERIFIER, {
      endpoint: "https://example.com/sign",
      fetch: mockFetch as typeof fetch,
    });

    const unsigned = pipe(
      createTransactionMessage({ version: 0 }),
      (message) => setTransactionMessageFeePayerSigner(createNoopSigner(FEE_PAYER), message),
      (message) =>
        setTransactionMessageLifetimeUsingBlockhash(
          {
            blockhash: "11111111111111111111111111111111",
            lastValidBlockHeight: 999n,
          },
          message,
        ),
      (message) =>
        appendTransactionMessageInstructions(
          [mockInstruction(SYSTEM_PROGRAM)],
          message,
        ),
    );

    const [signatures] = await signer.signTransactions([
      compileTransaction(unsigned),
    ]);

    expect(signatures[CONFIG_VERIFIER]).toHaveLength(64);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/sign",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the default Revi endpoint for config verifiers", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const signatureBase64 = Buffer.alloc(64, 3).toString("base64");
    const mockFetch = vi.fn(async (url) => {
      expect(url).toBe(`${DEFAULT_VERIFIER_API_BASE}/sign`);
      return {
        ok: true,
        json: async () => ({ signatures: [signatureBase64] }),
      };
    });

    const { verifier } = await resolveVerifier(rpc, PHYGITAL_TOKEN, {
      fetch: mockFetch as typeof fetch,
    });
    const unsigned = pipe(
      createTransactionMessage({ version: 0 }),
      (message) => setTransactionMessageFeePayerSigner(createNoopSigner(FEE_PAYER), message),
      (message) =>
        setTransactionMessageLifetimeUsingBlockhash(
          {
            blockhash: "11111111111111111111111111111111",
            lastValidBlockHeight: 999n,
          },
          message,
        ),
      (message) =>
        appendTransactionMessageInstructions(
          [mockInstruction(SYSTEM_PROGRAM)],
          message,
        ),
    );

    await verifier.signTransactions([compileTransaction(unsigned)]);
    expect(mockFetch).toHaveBeenCalledWith(
      `${DEFAULT_VERIFIER_API_BASE}/sign`,
      expect.objectContaining({
        method: "POST",
      }),
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).not.toContain("usesDefaultPaymaster");
  });
});

describe("getPhygitalWalletSigner modifyAndSignTransactions", () => {
  beforeEach(() => {
    const signatureBase64 = Buffer.alloc(64, 9).toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/preview")) {
          return {
            ok: true,
            json: async () => ({ ok: true, intentHash: "test-intent" }),
          };
        }
        return {
          ok: true,
          json: async () => ({ signatures: [signatureBase64] }),
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps wallet-bound instructions in secp256r1 + phygital-wallet execute", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const [walletPda] = await findWalletPda({ phygitalToken: PHYGITAL_TOKEN });
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN);

    expect(signer.address).toBe(walletPda);

    const transfer = mockInstruction(SYSTEM_PROGRAM, [
      { address: walletPda, role: AccountRole.WRITABLE_SIGNER },
      { address: RECIPIENT, role: AccountRole.WRITABLE },
    ]);

    const compiled = compileUnsigned([transfer]);

    expect(getTransactionProgramAddresses(compiled)).toEqual([SYSTEM_PROGRAM]);

    const [wrapped] = await signer.modifyAndSignTransactions([compiled]);
    const programsAfter = getTransactionProgramAddresses(wrapped);

    expect(programsAfter).toEqual([
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      SECP256R1_PROGRAM,
      PHYGITAL_WALLET_PROGRAM_ADDRESS,
    ]);
    expect(wrapped.signatures?.[walletPda]).toBeUndefined();
    expect(wrapped.signatures?.[CONFIG_VERIFIER]).toBeDefined();
  });

  it("lifts SPL memo instructions to the top level", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const [walletPda] = await findWalletPda({ phygitalToken: PHYGITAL_TOKEN });
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN);

    const transfer = mockInstruction(SYSTEM_PROGRAM, [
      { address: walletPda, role: AccountRole.WRITABLE_SIGNER },
      { address: RECIPIENT, role: AccountRole.WRITABLE },
    ]);
    const memo = mockInstruction(MEMO_PROGRAM, [], new Uint8Array([1, 2, 3]));

    const [wrapped] = await signer.modifyAndSignTransactions([
      compileUnsigned([transfer, memo]),
    ]);

    expect(getTransactionProgramAddresses(wrapped)).toEqual([
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      SECP256R1_PROGRAM,
      PHYGITAL_WALLET_PROGRAM_ADDRESS,
      MEMO_PROGRAM,
    ]);
  });

  it("replaces wallet PDA fee payer with the verifier", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const [walletPda] = await findWalletPda({ phygitalToken: PHYGITAL_TOKEN });
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN);

    const transfer = mockInstruction(SYSTEM_PROGRAM, [
      { address: walletPda, role: AccountRole.WRITABLE_SIGNER },
      { address: RECIPIENT, role: AccountRole.WRITABLE },
    ]);

    const [wrapped] = await signer.modifyAndSignTransactions([
      compileUnsigned([transfer], walletPda),
    ]);

    const compiledMessage = getCompiledTransactionMessageDecoder().decode(
      wrapped.messageBytes,
    );
    expect(compiledMessage.staticAccounts[0]).toBe(CONFIG_VERIFIER);
    expect(wrapped.signatures?.[walletPda]).toBeUndefined();
    expect(wrapped.signatures?.[CONFIG_VERIFIER]).toBeDefined();
  });

  it("discards old compute budget and sets fresh CU limit + priority fee", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const [walletPda] = await findWalletPda({ phygitalToken: PHYGITAL_TOKEN });
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN);

    const memo = mockInstruction(SYSTEM_PROGRAM);
    const transfer = mockInstruction(SYSTEM_PROGRAM, [
      { address: walletPda, role: AccountRole.WRITABLE_SIGNER },
      { address: RECIPIENT, role: AccountRole.WRITABLE },
    ]);

    const [wrapped] = await signer.modifyAndSignTransactions([
      compileUnsigned([
        getSetComputeUnitPriceInstruction({ microLamports: 5_000n }),
        getSetComputeUnitLimitInstruction({ units: 250_000 }),
        memo,
        transfer,
      ]),
    ]);

    expect(getTransactionProgramAddresses(wrapped)).toEqual([
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      SECP256R1_PROGRAM,
      PHYGITAL_WALLET_PROGRAM_ADDRESS,
    ]);
    // Simulated 100_000 × 1.1 margin; median of [2k, 5k, 10k] fees.
    expect(readComputeBudget(wrapped)).toEqual({
      unitLimit: 110_000,
      unitPrice: 5_000n,
    });
  });

  it("rejects transactions with only compute budget instructions", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN);

    await expect(
      signer.modifyAndSignTransactions([
        compileUnsigned([
          getSetComputeUnitPriceInstruction({ microLamports: 1_000n }),
          getSetComputeUnitLimitInstruction({ units: 200_000 }),
        ]),
      ]),
    ).rejects.toThrow(
      /no instructions to wrap \(only compute budget\/memo, or empty\)/,
    );
  });

  it("rejects transactions with only memo instructions", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN);

    await expect(
      signer.modifyAndSignTransactions([
        compileUnsigned([mockInstruction(MEMO_PROGRAM, [], new Uint8Array([1]))]),
      ]),
    ).rejects.toThrow(
      /no instructions to wrap \(only compute budget\/memo, or empty\)/,
    );
  });

  it("refreshes the blockhash when remaining lifetime is too short", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const getLatestBlockhash = vi.fn(async () => ({
      context: { slot: 900n },
      value: {
        blockhash: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        lastValidBlockHeight: 1_200n,
      },
    }));
    const rpcWithStaleHeight = {
      ...rpc,
      getBlockHeight: () => ({
        send: async () => 950n, // lastValid=999 → only 49 slots left (< 64)
      }),
      getLatestBlockhash: () => ({
        send: getLatestBlockhash,
      }),
    };

    const [walletPda] = await findWalletPda({ phygitalToken: PHYGITAL_TOKEN });
    const signer = await getPhygitalWalletSigner(
      rpcWithStaleHeight as never,
      PHYGITAL_TOKEN,
    );

    const transfer = mockInstruction(SYSTEM_PROGRAM, [
      { address: walletPda, role: AccountRole.WRITABLE_SIGNER },
      { address: RECIPIENT, role: AccountRole.WRITABLE },
    ]);

    const [wrapped] = await signer.modifyAndSignTransactions([
      compileUnsigned([transfer]),
    ]);

    expect(getLatestBlockhash).toHaveBeenCalled();
    expect(wrapped.lifetimeConstraint).toMatchObject({
      blockhash: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lastValidBlockHeight: 1_200n,
    });
  });

  it("invokes onPhaseChange in order", async () => {
    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const [walletPda] = await findWalletPda({ phygitalToken: PHYGITAL_TOKEN });
    const phases: string[] = [];
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN, {
      onPhaseChange: (phase) => phases.push(phase),
    });

    const transfer = mockInstruction(SYSTEM_PROGRAM, [
      { address: walletPda, role: AccountRole.WRITABLE_SIGNER },
      { address: RECIPIENT, role: AccountRole.WRITABLE },
    ]);

    await signer.modifyAndSignTransactions([compileUnsigned([transfer])]);

    expect(phases).toEqual([
      "preparing",
      "previewing",
      "awaitingPasskey",
      "building",
      "coSigning",
      "complete",
    ]);
  });

  it("throws PolicyDeniedError on soft policy deny", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/preview")) {
          return {
            ok: true,
            json: async () => ({
              ok: false,
              code: "approval_required",
              error: "Needs approval",
              soft: true,
              intentHash: "intent-1",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ signatures: [] }),
        };
      }),
    );

    const rpc = await createMockRpc({
      config: defaultConfigArgs(CONFIG_VERIFIER),
    });
    const [walletPda] = await findWalletPda({ phygitalToken: PHYGITAL_TOKEN });
    const signer = await getPhygitalWalletSigner(rpc as never, PHYGITAL_TOKEN);

    const transfer = mockInstruction(SYSTEM_PROGRAM, [
      { address: walletPda, role: AccountRole.WRITABLE_SIGNER },
      { address: RECIPIENT, role: AccountRole.WRITABLE },
    ]);

    await expect(
      signer.modifyAndSignTransactions([compileUnsigned([transfer])]),
    ).rejects.toMatchObject({
      name: "PolicyDeniedError",
      soft: true,
      code: "approval_required",
      intentHash: "intent-1",
    });
  });
});
