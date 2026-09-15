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
const READY_TIMEOUT_MS = 20_000;

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
  /** Optional handler for mid-flow BLOB_NEEDED (AUTH_START restore). */
  onBlobNeeded?: (credentialId: string) => string | null | Promise<string | null>;
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

function applyOverlayLayout(overlay: HTMLDivElement, frame: HTMLIFrameElement): void {
  const mobile = window.matchMedia("(max-width: 639px)").matches;
  overlay.style.cssText = mobile
    ? "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.4);display:none;align-items:flex-end;justify-content:stretch;padding:0;"
    : "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;padding:24px;";
  frame.style.cssText = mobile
    ? "width:100%;height:min(560px,88vh);border:0;border-radius:24px 24px 0 0;background:transparent;box-shadow:0 -8px 40px rgba(0,0,0,.18);"
    : "width:min(400px,100%);height:min(520px,90vh);border:0;border-radius:24px;background:transparent;box-shadow:0 20px 60px rgba(26,31,30,.18);";
}

class SecureSignerClient {
  private iframe: HTMLIFrameElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private ready: Promise<void> | null = null;
  private readonly pending = new Map<string, Pending>();
  private mediaQuery: MediaQueryList | null = null;

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

  /**
   * Reload the signer iframe after an aborted/failed interactive ceremony.
   * Without this, a dismissed overlay can leave AUTH_PENDING stuck so the next
   * Sign in fails with INTERNAL_ERROR.
   */
  private remountSigner(): void {
    if (!this.iframe) return;
    this.ready = this.waitForReady(this.iframe);
    this.iframe.src = `${SECURE_SIGNER_ORIGIN}/?r=${Date.now()}`;
  }

  private ensureMounted(): void {
    if (this.iframe) return;
    const overlay = document.createElement("div");
    overlay.setAttribute("data-secure-signer-overlay", "1");
    const frame = document.createElement("iframe");
    frame.src = `${SECURE_SIGNER_ORIGIN}/`;
    frame.title = "Secure signer";
    // Delegate WebAuthn to the signer origin (paired with the app's
    // Permissions-Policy response header — see next.config).
    frame.setAttribute(
      "allow",
      `publickey-credentials-get ${SECURE_SIGNER_ORIGIN}; publickey-credentials-create ${SECURE_SIGNER_ORIGIN}`,
    );
    applyOverlayLayout(overlay, frame);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    this.iframe = frame;
    this.overlay = overlay;

    this.mediaQuery = window.matchMedia("(max-width: 639px)");
    const onLayout = () => {
      if (this.overlay && this.iframe) applyOverlayLayout(this.overlay, this.iframe);
    };
    this.mediaQuery.addEventListener("change", onLayout);

    this.ready = this.waitForReady(frame);

    window.addEventListener("message", (event) => this.onMessage(event));
  }

  private onMessage(event: MessageEvent): void {
    if (event.origin !== SECURE_SIGNER_ORIGIN) return;
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    const data = event.data as Record<string, unknown>;
    const requestId = data?.["requestId"];
    if (typeof requestId !== "string") return;

    // Mid-flow: signer needs the encrypted blob for a discoverable passkey.
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
    if (this.overlay && this.iframe) {
      applyOverlayLayout(this.overlay, this.iframe);
      this.overlay.style.display = "flex";
    }
  }
  private hide(): void {
    if (this.overlay) this.overlay.style.display = "none";
  }

  /** Warm the iframe so the first interactive ceremony is not cold. */
  preload(): void {
    this.ensureMounted();
    void this.ready?.catch(() => {});
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
    this.ensureMounted();
    await this.ready;
    if (interactive) this.show();
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

  /**
   * High-level sign-in / create ceremony (chooser lives in the signer).
   * Optional parent blob is a backup candidate; the signer decides merge policy.
   */
  async authenticate(
    encryptedWalletBlob?: string | null,
    opts?: {
      /** Resolve a blob for a discoverable credential (D1 / local). */
      resolveBlob?: (credentialId: string) => string | null | Promise<string | null>;
      /** Server PUT challenge (base64url) — signed during unlock/create. */
      putChallenge?: string;
    },
  ): Promise<{
    publicKey: string;
    encryptedWalletBlob: string;
    created: boolean;
    putSignature?: string;
  }> {
    const payload: Record<string, unknown> = {};
    if (encryptedWalletBlob) payload.encryptedWalletBlob = encryptedWalletBlob;
    if (opts?.putChallenge) payload.putChallenge = opts.putChallenge;
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

  async createKey(): Promise<{ publicKey: string; encryptedWalletBlob: string }> {
    const r = await this.request("CREATE_KEY", "CREATE_KEY_RESULT", {}, true);
    return {
      publicKey: String(r["publicKey"]),
      encryptedWalletBlob: String(r["encryptedWalletBlob"]),
    };
  }

  async importKey(blob: string): Promise<{ publicKey: string; encryptedWalletBlob?: string }> {
    const r = await this.request(
      "IMPORT_KEY",
      "IMPORT_KEY_RESULT",
      { encryptedWalletBlob: blob },
      true,
    );
    return {
      publicKey: String(r["publicKey"]),
      ...(typeof r["encryptedWalletBlob"] === "string"
        ? { encryptedWalletBlob: String(r["encryptedWalletBlob"]) }
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
  ): Promise<{ signature: string; publicKey: string; signedTransaction: string }> {
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

  async exportEncryptedWallet(blob: string): Promise<{ encryptedWalletBlob: string }> {
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
