/**
 * Client for the cross-origin secure-signer iframe (see `secure-signer/`).
 *
 * The iframe is owned by `SecureSignerHost` (shadcn Sheet). This singleton only
 * speaks postMessage and asks the host to open/close the Sheet. Origin + source
 * are verified on every inbound message; this client holds NO key material.
 *
 * Passkey *create* runs on the app (shared RP ID); the signer performs get+PRF
 * and wraps the seed.
 */

import { SECURE_SIGNER_ORIGIN } from "@/lib/wallet/owner-backend";

const PROTOCOL_VERSION = 1;
const REQUEST_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 20_000;

export type AuthResult = {
  publicKey: string;
  encryptedWalletBlob: string;
  created: boolean;
  putSignature?: string;
};

export class SecureSignerError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SecureSignerError";
  }
}

type Pending = {
  resultType: string;
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  onBlobNeeded?: (
    credentialId: string,
  ) => string | null | Promise<string | null>;
};

/** React host bridge — iframe lives inside a modal Sheet (not body-inert). */
export type SecureSignerHostBridge = {
  iframe: HTMLIFrameElement;
  setOpen: (open: boolean) => void;
  isOpen: () => boolean;
};

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function randomRequestId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

class SecureSignerClient {
  private host: SecureSignerHostBridge | null = null;
  private ready: Promise<void> | null = null;
  private listening = false;
  private readonly pending = new Map<string, Pending>();
  private readyWaiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  /** Called by `SecureSignerHost` once the iframe is in the DOM. */
  attachHost(bridge: SecureSignerHostBridge): void {
    this.host = bridge;
    if (!this.listening) {
      this.listening = true;
      window.addEventListener("message", (event) => this.onMessage(event));
    }
    // Always re-arm READY. The iframe may have posted SIGNER_READY before
    // attach (boot race); bumping src guarantees we observe it.
    this.ready = this.waitForReady(bridge.iframe);
    bridge.iframe.src = `${SECURE_SIGNER_ORIGIN}/?r=${Date.now()}`;
    for (const w of this.readyWaiters) {
      void this.ready.then(w.resolve, w.reject);
    }
    this.readyWaiters = [];
  }

  detachHost(iframe?: HTMLIFrameElement | null): void {
    if (iframe && this.host?.iframe !== iframe) return;
    this.host = null;
    this.ready = null;
  }

  /** Sheet backdrop / Escape — cancel in-flight interactive work. */
  cancelFromHost(): void {
    this.cancelAllPending();
  }

  private get iframe(): HTMLIFrameElement | null {
    return this.host?.iframe ?? null;
  }

  private waitForReady(frame: HTMLIFrameElement): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReady);
        reject(new SecureSignerError("INTERNAL_ERROR"));
      }, READY_TIMEOUT_MS);
      const onReady = (event: MessageEvent) => {
        if (event.origin !== SECURE_SIGNER_ORIGIN) return;
        if (event.source !== frame.contentWindow) return;
        const data = event.data as Record<string, unknown>;
        if (data?.["type"] === "SIGNER_READY") {
          clearTimeout(timer);
          window.removeEventListener("message", onReady);
          resolve();
        }
      };
      window.addEventListener("message", onReady);
    });
  }

  private remountSigner(): void {
    if (!this.iframe) return;
    this.ready = this.waitForReady(this.iframe);
    this.iframe.src = `${SECURE_SIGNER_ORIGIN}/?r=${Date.now()}`;
  }

  private async ensureHost(): Promise<SecureSignerHostBridge> {
    if (this.host) return this.host;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new SecureSignerError("INTERNAL_ERROR"));
      }, READY_TIMEOUT_MS);
      this.readyWaiters.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
    if (!this.host) throw new SecureSignerError("INTERNAL_ERROR");
    return this.host;
  }

  private async ensureReady(): Promise<void> {
    await this.ensureHost();
    try {
      await this.ready;
    } catch {
      this.remountSigner();
      await this.ready;
    }
  }

  private cancelAllPending(code = "USER_CANCELLED"): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(new SecureSignerError(code));
    }
  }

  private onMessage(event: MessageEvent): void {
    if (event.origin !== SECURE_SIGNER_ORIGIN) return;
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    const data = event.data as Record<string, unknown>;
    const requestId = data?.["requestId"];
    if (typeof requestId !== "string") return;

    if (data["type"] === "BLOB_NEEDED") {
      const p = this.pending.get(requestId);
      if (!p?.onBlobNeeded) {
        this.postBlobProvided(requestId, null, "BLOB_UNAVAILABLE");
        return;
      }
      const credentialId = String(data["credentialId"] ?? "");
      void Promise.resolve(p.onBlobNeeded(credentialId))
        .then((blob) => {
          if (blob) this.postBlobProvided(requestId, blob);
          else this.postBlobProvided(requestId, null, "BLOB_UNAVAILABLE");
        })
        .catch(() => {
          this.postBlobProvided(requestId, null, "BLOB_UNAVAILABLE");
        });
      return;
    }

    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    clearTimeout(p.timer);
    if (data["type"] === "ERROR") {
      p.reject(new SecureSignerError(String(data["code"] ?? "INTERNAL_ERROR")));
    } else if (data["type"] === p.resultType) {
      p.resolve(data);
    } else {
      p.reject(new SecureSignerError("INTERNAL_ERROR"));
    }
  }

  private postBlobProvided(
    requestId: string,
    blob: string | null,
    errorCode?: string,
  ): void {
    if (!this.iframe?.contentWindow) return;
    const message: Record<string, unknown> = {
      type: "BLOB_PROVIDED",
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      timestamp: Date.now(),
    };
    if (blob) message.encryptedWalletBlob = blob;
    if (errorCode) message.errorCode = errorCode;
    this.iframe.contentWindow.postMessage(message, SECURE_SIGNER_ORIGIN);
  }

  private show(): void {
    this.host?.setOpen(true);
  }

  private hide(): void {
    this.host?.setOpen(false);
  }

  /** Warm the iframe (host force-mounts it even while the Sheet is closed). */
  preload(): void {
    void this.ensureReady().catch(() => {
      /* first interactive call remounts */
    });
  }

  private async request(
    type: string,
    resultType: string,
    payload: Record<string, unknown>,
    interactive: boolean,
    opts?: {
      onBlobNeeded?: Pending["onBlobNeeded"];
    },
  ): Promise<Record<string, unknown>> {
    if (interactive) this.show();
    try {
      await this.ensureReady();
    } catch (err) {
      if (interactive) this.hide();
      throw err;
    }
    const requestId = randomRequestId();
    const message = {
      type,
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      timestamp: Date.now(),
      ...payload,
    };
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new SecureSignerError("INTERNAL_ERROR"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, {
        resultType,
        resolve,
        reject,
        timer,
        onBlobNeeded: opts?.onBlobNeeded,
      });
    });
    this.iframe!.contentWindow!.postMessage(message, SECURE_SIGNER_ORIGIN);
    try {
      return await result;
    } catch (err) {
      if (interactive) this.remountSigner();
      throw err;
    } finally {
      if (interactive) this.hide();
    }
  }

  async authenticate(
    encryptedWalletBlob?: string | null,
    opts?: {
      resolveBlob?: (
        credentialId: string,
      ) => string | null | Promise<string | null>;
      putChallenge?: string;
      authMode?: "create" | "unlock";
      credentialId?: string;
    },
  ): Promise<AuthResult> {
    const payload: Record<string, unknown> = {
      authMode: opts?.authMode ?? "unlock",
    };
    if (encryptedWalletBlob) payload.encryptedWalletBlob = encryptedWalletBlob;
    if (opts?.putChallenge) payload.putChallenge = opts.putChallenge;
    if (opts?.credentialId) payload.credentialId = opts.credentialId;
    const r = await this.request(
      "AUTH_START",
      "AUTH_COMPLETE",
      payload,
      true,
      {
        onBlobNeeded: async (credentialId) => {
          if (opts?.resolveBlob) return opts.resolveBlob(credentialId);
          return encryptedWalletBlob ?? null;
        },
      },
    );
    return {
      publicKey: String(r["publicKey"]),
      encryptedWalletBlob: String(r["encryptedWalletBlob"]),
      created: Boolean(r["created"]),
      ...(typeof r["putSignature"] === "string"
        ? { putSignature: String(r["putSignature"]) }
        : {}),
    };
  }

  async getPublicKey(blob: string): Promise<{ publicKey: string }> {
    const r = await this.request(
      "GET_PUBLIC_KEY",
      "GET_PUBLIC_KEY_RESULT",
      { encryptedWalletBlob: blob },
      false,
    );
    return { publicKey: String(r["publicKey"]) };
  }

  async signTransaction(
    blob: string,
    txBytes: Uint8Array,
  ): Promise<{
    signature: string;
    publicKey: string;
    signedTransaction: string;
  }> {
    const r = await this.request(
      "SIGN_TRANSACTION",
      "SIGN_TRANSACTION_RESULT",
      { encryptedWalletBlob: blob, transaction: bytesToBase64(txBytes) },
      true,
    );
    return {
      signature: String(r["signature"]),
      publicKey: String(r["publicKey"]),
      signedTransaction: String(r["signedTransaction"]),
    };
  }

  async exportEncryptedWallet(
    blob: string,
  ): Promise<{ encryptedWalletBlob: string }> {
    const r = await this.request(
      "EXPORT_ENCRYPTED_WALLET",
      "EXPORT_ENCRYPTED_WALLET_RESULT",
      { encryptedWalletBlob: blob },
      false,
    );
    return { encryptedWalletBlob: String(r["encryptedWalletBlob"]) };
  }

  async exportPrivateKey(blob: string): Promise<{ completed: boolean }> {
    const r = await this.request(
      "EXPORT_PRIVATE_KEY",
      "EXPORT_PRIVATE_KEY_RESULT",
      { encryptedWalletBlob: blob },
      true,
    );
    return { completed: Boolean(r["completed"]) };
  }
}

let singleton: SecureSignerClient | null = null;

export function getSecureSignerClient(): SecureSignerClient {
  if (typeof window === "undefined") {
    throw new Error("secure-signer client is browser-only");
  }
  singleton ??= new SecureSignerClient();
  return singleton;
}
