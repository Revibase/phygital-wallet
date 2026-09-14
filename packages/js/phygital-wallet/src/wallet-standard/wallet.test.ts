import {
  address,
  type Rpc,
  type SolanaRpcApi,
  type TransactionPartialSigner,
} from "@solana/kit";
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignTransaction,
} from "@solana/wallet-standard-features";
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
} from "@wallet-standard/features";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startAuthentication = vi.fn(async () => ({ id: "test-passkey-id" }));
const verifyResponse = vi.fn(() => ({
  isVerified: true,
  secp256r1PublicKey: "test-secp256r1-key",
}));
const findPhygitalTokenPda = vi.fn(async () =>
  address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
);
const getPhygitalWalletSigner = vi.fn(async () => ({
  address: address("So11111111111111111111111111111111111111112"),
  modifyAndSignTransactions: vi.fn(async (txs) => txs),
}));

vi.mock("phygital-token-sdk", () => ({
  authenticatePasskeyForSecp256r1Verify: vi.fn(),
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
  verifyResponse: (...args: unknown[]) => verifyResponse(...args),
  findPhygitalTokenPda: (...args: unknown[]) => findPhygitalTokenPda(...args),
}));

vi.mock("../generated/pdas/wallet.js", () => ({
  findWalletPda: vi.fn(async () => [
    address("So11111111111111111111111111111111111111112"),
  ]),
}));

vi.mock("../wallet/signer.js", () => ({
  getPhygitalWalletSigner: (...args: unknown[]) =>
    getPhygitalWalletSigner(...args),
}));

import { PhygitalWallet } from "./wallet.js";
import { registerPhygitalWallet } from "./register.js";
import { REVIBASE_WALLET_NAME } from "./icon.js";
import { PHYGITAL_WALLET_SESSION_STORAGE_KEY } from "./session.js";

function mockRpc(): Rpc<SolanaRpcApi> {
  return { tag: Math.random() } as unknown as Rpc<SolanaRpcApi>;
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("PhygitalWallet Wallet Standard surface", () => {
  beforeEach(() => {
    startAuthentication.mockClear();
    verifyResponse.mockClear();
    findPhygitalTokenPda.mockClear();
    getPhygitalWalletSigner.mockClear();
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("exposes Wallet Standard features expected by connectors", () => {
    const wallet = new PhygitalWallet({ rpc: mockRpc() });
    expect(wallet.name).toBe(REVIBASE_WALLET_NAME);
    expect(wallet.version).toBe("1.0.0");
    expect(wallet.accounts).toEqual([]);
    expect(wallet.chains).toEqual(["solana:mainnet"]);
    expect(StandardConnect in wallet.features).toBe(true);
    expect(StandardEvents in wallet.features).toBe(true);
    expect(StandardDisconnect in wallet.features).toBe(true);
    expect(SolanaSignTransaction in wallet.features).toBe(true);
    expect(SolanaSignAndSendTransaction in wallet.features).toBe(true);
    expect(SolanaSignMessage in wallet.features).toBe(true);
    expect(
      wallet.features[SolanaSignTransaction].supportedTransactionVersions
    ).toEqual(["legacy", 0, 1]);
  });

  it("silent connect returns empty accounts before a live tap", async () => {
    const wallet = new PhygitalWallet({ rpc: mockRpc() });
    const { accounts } = await wallet.features[StandardConnect].connect({
      silent: true,
    });
    expect(accounts).toEqual([]);
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it("connect derives wallet PDA from passkey verify and persists session", async () => {
    const feePayer = {
      address: address("11111111111111111111111111111112"),
      signTransactions: vi.fn(),
    } as unknown as TransactionPartialSigner;
    const wallet = new PhygitalWallet({ rpc: mockRpc(), feePayer });
    const changes: unknown[] = [];
    wallet.features[StandardEvents].on("change", (props) => {
      changes.push(props);
    });

    const { accounts } = await wallet.features[StandardConnect].connect();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.address).toBe(
      "So11111111111111111111111111111111111111112"
    );
    expect(accounts[0]?.publicKey).toHaveLength(32);
    expect(accounts[0]?.features).toContain(SolanaSignMessage);
    expect(wallet.accounts).toHaveLength(1);
    expect(changes).toHaveLength(1);
    expect(startAuthentication).toHaveBeenCalledTimes(1);
    expect(verifyResponse).toHaveBeenCalledTimes(1);
    expect(verifyResponse).toHaveBeenCalledWith({
      expectedMessage: startAuthentication.mock.calls[0]?.[0],
      response: { id: "test-passkey-id" },
    });
    expect(findPhygitalTokenPda).toHaveBeenCalledWith("test-secp256r1-key");
    expect(getPhygitalWalletSigner).toHaveBeenCalledWith(
      expect.anything(),
      address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      expect.objectContaining({ feePayer })
    );
    expect(localStorage.getItem(PHYGITAL_WALLET_SESSION_STORAGE_KEY)).toContain(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );

    await wallet.features[StandardDisconnect].disconnect();
    expect(wallet.accounts).toEqual([]);
    expect(
      localStorage.getItem(PHYGITAL_WALLET_SESSION_STORAGE_KEY)
    ).toBeNull();
  });

  it("stays disconnected when local authentication verification fails", async () => {
    verifyResponse.mockReturnValueOnce({
      isVerified: false,
      secp256r1PublicKey: "test-secp256r1-key",
    });
    const wallet = new PhygitalWallet({ rpc: mockRpc() });

    await expect(wallet.features[StandardConnect].connect()).rejects.toThrow(
      "Could not verify this phygital accessory"
    );
    expect(wallet.accounts).toEqual([]);
    expect(findPhygitalTokenPda).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(PHYGITAL_WALLET_SESSION_STORAGE_KEY)
    ).toBeNull();
  });

  it("eagerly restores accounts from localStorage after refresh", () => {
    localStorage.setItem(
      PHYGITAL_WALLET_SESSION_STORAGE_KEY,
      JSON.stringify({
        phygitalTokenPda: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        walletPda: "So11111111111111111111111111111111111111112",
      })
    );
    const wallet = new PhygitalWallet({ rpc: mockRpc() });
    expect(wallet.accounts).toHaveLength(1);
    expect(wallet.accounts[0]?.address).toBe(
      "So11111111111111111111111111111111111111112"
    );
  });

  it("silent connect restores a persisted session without a new tap", async () => {
    const first = new PhygitalWallet({ rpc: mockRpc() });
    await first.features[StandardConnect].connect();
    expect(startAuthentication).toHaveBeenCalledTimes(1);

    const restored = new PhygitalWallet({ rpc: mockRpc() });
    const { accounts } = await restored.features[StandardConnect].connect({
      silent: true,
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.address).toBe(
      "So11111111111111111111111111111111111111112"
    );
    expect(startAuthentication).toHaveBeenCalledTimes(1);
  });

  it("interactive connect reuses persisted session without a new tap", async () => {
    const first = new PhygitalWallet({ rpc: mockRpc() });
    await first.features[StandardConnect].connect();

    const second = new PhygitalWallet({ rpc: mockRpc() });
    const { accounts } = await second.features[StandardConnect].connect();
    expect(accounts).toHaveLength(1);
    expect(startAuthentication).toHaveBeenCalledTimes(1);
  });

  it("solana:signMessage is present but rejects PDA message signing", async () => {
    const wallet = new PhygitalWallet({ rpc: mockRpc() });
    const { accounts } = await wallet.features[StandardConnect].connect();
    await expect(
      wallet.features[SolanaSignMessage].signMessage({
        account: accounts[0]!,
        message: new TextEncoder().encode("hello"),
      })
    ).rejects.toThrow(/cannot produce ed25519 message signatures/i);
  });
});

describe("registerPhygitalWallet", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
    });
  });

  it("registers once per rpc instance", () => {
    const rpc = mockRpc();
    registerPhygitalWallet({ rpc });
    registerPhygitalWallet({ rpc });
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
