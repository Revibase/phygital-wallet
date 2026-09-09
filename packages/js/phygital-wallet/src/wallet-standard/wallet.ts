import {
  getBase58Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  sendTransactionWithoutConfirmingFactory,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  type Transaction,
  type TransactionModifyingSigner,
  type TransactionWithLifetime,
} from "@solana/kit";
import { SOLANA_CHAINS, type SolanaChain } from "@solana/wallet-standard-chains";
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignAndSendTransactionMethod,
  SolanaSignMessage,
  type SolanaSignMessageFeature,
  type SolanaSignMessageMethod,
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
  type SolanaSignTransactionMethod,
} from "@solana/wallet-standard-features";
import type {
  IdentifierArray,
  IdentifierString,
  Wallet,
  WalletAccount,
  WalletIcon,
  WalletVersion,
} from "@wallet-standard/base";
import {
  StandardConnect,
  type StandardConnectFeature,
  type StandardConnectMethod,
  StandardDisconnect,
  type StandardDisconnectFeature,
  type StandardDisconnectMethod,
  StandardEvents,
  type StandardEventsFeature,
  type StandardEventsListeners,
  type StandardEventsNames,
  type StandardEventsOnMethod,
} from "@wallet-standard/features";
import {
  findPhygitalTokenPda,
  startAuthentication,
  verifyResponse,
} from "phygital-token-sdk";

import { findWalletPda } from "../generated/pdas/wallet.js";
import {
  getPhygitalWalletSigner,
  type PhygitalWalletSignerCallbacks,
} from "../wallet/signer.js";
import { createPhygitalWalletAccount } from "./account.js";
import { REVIBASE_WALLET_ICON, REVIBASE_WALLET_NAME } from "./icon.js";
import {
  clearPhygitalWalletSession,
  loadPhygitalWalletSession,
  savePhygitalWalletSession,
  type PhygitalWalletSession,
} from "./session.js";

const transactionDecoder = getTransactionDecoder();
const transactionEncoder = getTransactionEncoder();
const base58Encoder = getBase58Encoder();

/** Solana formats we wrap — includes v1 ahead of Wallet Standard type updates. */
const SUPPORTED_TRANSACTION_VERSIONS = ["legacy", 0, 1] as const;

const SIGN_MESSAGE_UNSUPPORTED =
  "Revibase wallet accounts are program-derived addresses and cannot produce ed25519 message signatures (solana:signMessage). Use Revibase for transactions instead.";

type PhygitalWalletFeatures = StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature &
  SolanaSignTransactionFeature &
  SolanaSignAndSendTransactionFeature &
  SolanaSignMessageFeature;

export type PhygitalWalletOptions = {
  rpc: Rpc<SolanaRpcApi>;
  chains?: readonly SolanaChain[];
  fetch?: typeof fetch;
  onPhaseChange?: PhygitalWalletSignerCallbacks["onPhaseChange"];
};

export class PhygitalWallet implements Wallet {
  readonly #listeners: {
    [E in StandardEventsNames]?: StandardEventsListeners[E][];
  } = {};
  readonly #version = "1.0.0" as const;
  readonly #name = REVIBASE_WALLET_NAME;
  readonly #icon = REVIBASE_WALLET_ICON;
  readonly #chains: IdentifierArray;
  readonly #rpc: Rpc<SolanaRpcApi>;
  readonly #fetch?: typeof fetch;
  readonly #onPhaseChange?: PhygitalWalletSignerCallbacks["onPhaseChange"];

  #session: PhygitalWalletSession | null = null;
  #account: WalletAccount | null = null;
  #signer: TransactionModifyingSigner | null = null;
  #signerPromise: Promise<TransactionModifyingSigner> | null = null;

  get version(): WalletVersion {
    return this.#version;
  }

  get name(): string {
    return this.#name;
  }

  get icon(): WalletIcon {
    return this.#icon;
  }

  get chains(): IdentifierArray {
    return this.#chains;
  }

  get features(): PhygitalWalletFeatures {
    return {
      [StandardConnect]: {
        version: "1.0.0",
        connect: this.#connect,
      },
      [StandardDisconnect]: {
        version: "1.0.0",
        disconnect: this.#disconnect,
      },
      [StandardEvents]: {
        version: "1.0.0",
        on: this.#on,
      },
      [SolanaSignTransaction]: {
        version: "1.0.0",
        supportedTransactionVersions:
          SUPPORTED_TRANSACTION_VERSIONS as SolanaSignTransactionFeature[typeof SolanaSignTransaction]["supportedTransactionVersions"],
        signTransaction: this.#signTransaction,
      },
      [SolanaSignAndSendTransaction]: {
        version: "1.0.0",
        supportedTransactionVersions:
          SUPPORTED_TRANSACTION_VERSIONS as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction]["supportedTransactionVersions"],
        signAndSendTransaction: this.#signAndSendTransaction,
      },
      // Declared for connector compatibility (PDAs cannot ed25519-sign messages).
      [SolanaSignMessage]: {
        version: "1.1.0",
        signMessage: this.#signMessage,
      },
    };
  }

  get accounts(): readonly WalletAccount[] {
    return this.#account ? [this.#account] : [];
  }

  constructor(options: PhygitalWalletOptions) {
    if (new.target === PhygitalWallet) {
      Object.freeze(this);
    }
    this.#rpc = options.rpc;
    this.#chains = Object.freeze([
      ...(options.chains ?? SOLANA_CHAINS),
    ]) as IdentifierArray;
    this.#fetch = options.fetch;
    this.#onPhaseChange = options.onPhaseChange;

    // Eager account so connectors see a connected wallet after refresh.
    const session = loadPhygitalWalletSession();
    if (session) {
      this.#adoptSession(session);
      this.#signerPromise = this.#loadSigner(session);
    }
  }

  #on: StandardEventsOnMethod = (event, listener) => {
    if (!this.#listeners[event]) this.#listeners[event] = [];
    this.#listeners[event].push(listener);
    return (): void => this.#off(event, listener);
  };

  #emit<E extends StandardEventsNames>(
    event: E,
    ...args: Parameters<StandardEventsListeners[E]>
  ): void {
    for (const listener of this.#listeners[event] ?? []) {
      // @ts-expect-error spread matches listener arity
      listener(...args);
    }
  }

  #off<E extends StandardEventsNames>(
    event: E,
    listener: StandardEventsListeners[E],
  ): void {
    this.#listeners[event] = (this.#listeners[event] ?? []).filter(
      (existing) => listener !== existing,
    );
  }

  #connect: StandardConnectMethod = async ({ silent } = {}) => {
    if (this.#session) {
      try {
        await this.#ensureSigner();
        return { accounts: this.accounts };
      } catch {
        if (silent) return { accounts: this.accounts };
      }
    }

    const session = loadPhygitalWalletSession();
    if (session) {
      try {
        await this.#restoreSession(session);
        return { accounts: this.accounts };
      } catch {
        if (silent) return { accounts: this.accounts };
      }
    } else if (silent) {
      return { accounts: this.accounts };
    }

    const message = crypto.randomUUID();
    const response = await startAuthentication(message, this.#rpc);
    const verified = verifyResponse({ expectedMessage: message, response });
    if (!verified.isVerified || !verified.secp256r1PublicKey?.trim()) {
      throw new Error("Passkey verification failed");
    }

    const phygitalTokenPda = await findPhygitalTokenPda(
      verified.secp256r1PublicKey.trim(),
    );
    const [walletPda] = await findWalletPda({
      phygitalToken: phygitalTokenPda,
    });

    await this.#restoreSession({ phygitalTokenPda, walletPda });
    savePhygitalWalletSession({ phygitalTokenPda, walletPda });
    return { accounts: this.accounts };
  };

  #disconnect: StandardDisconnectMethod = async () => {
    clearPhygitalWalletSession();
    this.#clearMemorySession();
    this.#emit("change", { accounts: this.accounts });
  };

  #adoptSession(session: PhygitalWalletSession): void {
    this.#session = session;
    this.#account = createPhygitalWalletAccount(
      session.walletPda,
      this.#chains,
    );
  }

  #clearMemorySession(): void {
    this.#session = null;
    this.#account = null;
    this.#signer = null;
    this.#signerPromise = null;
  }

  async #assertSessionPda(session: PhygitalWalletSession): Promise<void> {
    const [expectedWalletPda] = await findWalletPda({
      phygitalToken: session.phygitalTokenPda,
    });
    if (String(expectedWalletPda) !== String(session.walletPda)) {
      throw new Error("Stored wallet PDA does not match token PDA");
    }
  }

  async #loadSigner(
    session: PhygitalWalletSession,
  ): Promise<TransactionModifyingSigner> {
    try {
      await this.#assertSessionPda(session);
      const signer = await getPhygitalWalletSigner(
        this.#rpc,
        session.phygitalTokenPda,
        {
          fetch: this.#fetch,
          onPhaseChange: this.#onPhaseChange,
        },
      );
      this.#signer = signer;
      return signer;
    } catch (error) {
      clearPhygitalWalletSession();
      this.#clearMemorySession();
      this.#emit("change", { accounts: this.accounts });
      throw error;
    }
  }

  async #restoreSession(session: PhygitalWalletSession): Promise<void> {
    this.#adoptSession(session);
    this.#signer = null;
    this.#signerPromise = this.#loadSigner(session);
    await this.#ensureSigner();
    this.#emit("change", { accounts: this.accounts });
  }

  #requireAccount(account: WalletAccount): void {
    if (!this.#account || account.address !== this.#account.address) {
      throw new Error("Account not connected to Revibase wallet");
    }
  }

  async #ensureSigner(): Promise<TransactionModifyingSigner> {
    if (this.#signer) return this.#signer;
    if (this.#signerPromise) return await this.#signerPromise;
    throw new Error("Revibase wallet is not connected");
  }

  async #modifyAndSignWire(
    transactionBytes: Uint8Array,
  ): Promise<Transaction & TransactionWithLifetime> {
    const decoded = transactionDecoder.decode(transactionBytes) as Transaction;
    if (!("lifetimeConstraint" in decoded)) {
      throw new Error(
        "Revibase wallet requires transactions with a lifetime constraint (blockhash or durable nonce)",
      );
    }

    const signer = await this.#ensureSigner();
    const [signed] = await signer.modifyAndSignTransactions([
      decoded as Transaction & TransactionWithLifetime,
    ]);
    if (!signed || !("lifetimeConstraint" in signed)) {
      throw new Error("Revibase wallet failed to sign transaction");
    }
    return signed as Transaction & TransactionWithLifetime;
  }

  #signMessage: SolanaSignMessageMethod = async (...inputs) => {
    for (const input of inputs) {
      this.#requireAccount(input.account);
    }
    throw new Error(SIGN_MESSAGE_UNSUPPORTED);
  };

  #signTransaction: SolanaSignTransactionMethod = async (...inputs) => {
    const outputs: { signedTransaction: Uint8Array }[] = [];
    for (const input of inputs) {
      this.#requireAccount(input.account);
      if (input.chain && !this.#chains.includes(input.chain)) {
        throw new Error(`Unsupported chain: ${input.chain}`);
      }
      const signed = await this.#modifyAndSignWire(input.transaction);
      outputs.push({
        signedTransaction: new Uint8Array(transactionEncoder.encode(signed)),
      });
    }
    return outputs;
  };

  #signAndSendTransaction: SolanaSignAndSendTransactionMethod = async (
    ...inputs
  ) => {
    const send = sendTransactionWithoutConfirmingFactory({ rpc: this.#rpc });
    const outputs: { signature: Uint8Array }[] = [];

    for (const input of inputs) {
      this.#requireAccount(input.account);
      if (!this.#chains.includes(input.chain as IdentifierString)) {
        throw new Error(`Unsupported chain: ${input.chain}`);
      }
      const signed = await this.#modifyAndSignWire(input.transaction);
      const sendConfig: {
        commitment?: "processed" | "confirmed" | "finalized";
        skipPreflight?: boolean;
        maxRetries?: bigint;
        minContextSlot?: bigint;
      } = {};
      if (input.options?.preflightCommitment) {
        sendConfig.commitment = input.options.preflightCommitment;
      }
      if (input.options?.skipPreflight !== undefined) {
        sendConfig.skipPreflight = input.options.skipPreflight;
      }
      if (input.options?.maxRetries !== undefined) {
        sendConfig.maxRetries = BigInt(input.options.maxRetries);
      }
      if (input.options?.minContextSlot !== undefined) {
        sendConfig.minContextSlot = BigInt(input.options.minContextSlot);
      }
      await send(signed as never, sendConfig as never);
      const signature = getSignatureFromTransaction(signed);
      outputs.push({
        signature: new Uint8Array(base58Encoder.encode(signature)),
      });
    }
    return outputs;
  };
}
