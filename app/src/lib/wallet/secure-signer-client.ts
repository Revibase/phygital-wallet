/**
 * Client for the cross-origin secure-signer iframe (see `secure-signer/`).
 *
 * Framework-agnostic singleton: lazily mounts the signer iframe in a full-screen
 * overlay (shown only during interactive ceremonies), speaks the strict
 * postMessage protocol, and correlates requests by id. Origin + source are
 * verified on every inbound message; results/errors go only to the signer origin.
 *
 * This client holds NO key material — it exchanges public keys, ciphertext blobs,
 * and signatures only.
 */

import { SECURE_SIGNER_ORIGIN } from "@/lib/wallet/owner-backend";

const PROTOCOL_VERSION = 1;
const REQUEST_TIMEOUT_MS = 120_000;

export class SecureSignerError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type Pending = {
  resultType: string;
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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
  private iframe: HTMLIFrameElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private ready: Promise<void> | null = null;
  private readonly pending = new Map<string, Pending>();

  private ensureMounted(): void {
    if (this.iframe) return;
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;";
    const frame = document.createElement("iframe");
    frame.src = `${SECURE_SIGNER_ORIGIN}/`;
    // Delegate WebAuthn to the signer origin (paired with the app's
    // Permissions-Policy response header — see next.config).
    frame.setAttribute(
      "allow",
      `publickey-credentials-get ${SECURE_SIGNER_ORIGIN}; publickey-credentials-create ${SECURE_SIGNER_ORIGIN}`
    );
    frame.style.cssText =
      "width:min(440px,92vw);height:min(560px,90vh);border:0;border-radius:16px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.4);";
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    this.iframe = frame;
    this.overlay = overlay;

    this.ready = new Promise<void>((resolve) => {
      const onReady = (event: MessageEvent) => {
        if (event.origin !== SECURE_SIGNER_ORIGIN) return;
        if (event.source !== frame.contentWindow) return;
        const data = event.data as Record<string, unknown>;
        if (data?.["type"] === "SIGNER_READY") {
          window.removeEventListener("message", onReady);
          resolve();
        }
      };
      window.addEventListener("message", onReady);
    });

    window.addEventListener("message", (event) => this.onMessage(event));
  }

  private onMessage(event: MessageEvent): void {
    if (event.origin !== SECURE_SIGNER_ORIGIN) return;
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    const data = event.data as Record<string, unknown>;
    const requestId = data?.["requestId"];
    if (typeof requestId !== "string") return;
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

  private show(): void {
    if (this.overlay) this.overlay.style.display = "flex";
  }
  private hide(): void {
    if (this.overlay) this.overlay.style.display = "none";
  }

  private async request(
    type: string,
    resultType: string,
    payload: Record<string, unknown>,
    interactive: boolean
  ): Promise<Record<string, unknown>> {
    this.ensureMounted();
    await this.ready;
    if (interactive) this.show();
    const requestId = randomRequestId();
    const message = { type, protocolVersion: PROTOCOL_VERSION, requestId, ...payload };
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new SecureSignerError("INTERNAL_ERROR"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resultType, resolve, reject, timer });
    });
    this.iframe!.contentWindow!.postMessage(message, SECURE_SIGNER_ORIGIN);
    try {
      return await result;
    } finally {
      if (interactive) this.hide();
    }
  }

  async createKey(): Promise<{ publicKey: string; encryptedWalletBlob: string }> {
    const r = await this.request("CREATE_KEY", "CREATE_KEY_RESULT", {}, true);
    return {
      publicKey: String(r["publicKey"]),
      encryptedWalletBlob: String(r["encryptedWalletBlob"]),
    };
  }

  async importKey(blob: string): Promise<{ publicKey: string }> {
    const r = await this.request("IMPORT_KEY", "IMPORT_KEY_RESULT", { encryptedWalletBlob: blob }, true);
    return { publicKey: String(r["publicKey"]) };
  }

  async getPublicKey(blob: string): Promise<{ publicKey: string }> {
    const r = await this.request("GET_PUBLIC_KEY", "GET_PUBLIC_KEY_RESULT", { encryptedWalletBlob: blob }, false);
    return { publicKey: String(r["publicKey"]) };
  }

  async signTransaction(
    blob: string,
    txBytes: Uint8Array
  ): Promise<{ signature: string; publicKey: string; signedTransaction: string }> {
    const r = await this.request(
      "SIGN_TRANSACTION",
      "SIGN_TRANSACTION_RESULT",
      { encryptedWalletBlob: blob, transaction: bytesToBase64(txBytes) },
      true
    );
    return {
      signature: String(r["signature"]),
      publicKey: String(r["publicKey"]),
      signedTransaction: String(r["signedTransaction"]),
    };
  }

  async exportEncryptedWallet(blob: string): Promise<{ encryptedWalletBlob: string }> {
    const r = await this.request("EXPORT_ENCRYPTED_WALLET", "EXPORT_ENCRYPTED_WALLET_RESULT", { encryptedWalletBlob: blob }, false);
    return { encryptedWalletBlob: String(r["encryptedWalletBlob"]) };
  }

  async exportPrivateKey(blob: string): Promise<{ completed: boolean }> {
    const r = await this.request("EXPORT_PRIVATE_KEY", "EXPORT_PRIVATE_KEY_RESULT", { encryptedWalletBlob: blob }, true);
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
