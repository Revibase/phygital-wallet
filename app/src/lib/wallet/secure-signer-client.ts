/**
 * Client for the cross-origin secure-signer iframe (see `secure-signer/`).
 *
 * The iframe is owned by `SecureSignerHost` (shadcn Sheet). This singleton only
 * speaks postMessage and asks the host to open/close the Sheet. Origin + source
 * are verified on every inbound message; this client holds NO key material.
 *
 * Passkey *create* runs on the app (shared RP ID); the signer performs get+PRF
 * and wraps the seed.
 *
 * Host lifecycle: shell (`setOpen`) mounts first; iframe exists only while the
 * Sheet is open. Every request is interactive (opens the Sheet).
 */

import { SECURE_SIGNER_ORIGIN } from "@/lib/wallet/owner-backend";
import { bytesToBase64 } from "@/lib/crypto/base64";

const PROTOCOL_VERSION = 1;
const REQUEST_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 20_000;

export type AuthResult = {
  publicKey: string;
  expiresAt: number;
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
};

/** Open/close the Sheet — available as soon as `SecureSignerHost` mounts. */
export type SecureSignerShell = {
  setOpen: (open: boolean) => void;
  isOpen: () => boolean;
};

function randomRequestId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

class SecureSignerClient {
  private shell: SecureSignerShell | null = null;
  private iframeEl: HTMLIFrameElement | null = null;
  private ready: Promise<void> | null = null;
  private listening = false;
  private readonly pending = new Map<string, Pending>();
  private shellWaiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  private iframeWaiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  private readonly needHostListeners = new Set<() => void>();

  onNeedHost(listener: () => void): () => void {
    this.needHostListeners.add(listener);
    return () => {
      this.needHostListeners.delete(listener);
    };
  }

  private requestHostMount(): void {
    for (const listener of this.needHostListeners) listener();
  }

  /** Called when `SecureSignerHost` mounts (Sheet may still be closed). */
  attachShell(shell: SecureSignerShell): void {
    this.shell = shell;
    for (const w of this.shellWaiters) w.resolve();
    this.shellWaiters = [];
  }

  detachShell(): void {
    this.shell = null;
    this.iframeEl = null;
    this.ready = null;
  }

  /**
   * Called when Sheet opens and the iframe enters the DOM.
   * Host must NOT set `src` in JSX — we assign it once here so READY is not
   * raced against a double navigation.
   */
  attachIframe(iframe: HTMLIFrameElement): void {
    this.iframeEl = iframe;
    if (!this.listening) {
      this.listening = true;
      window.addEventListener("message", (event) => this.onMessage(event));
    }
    this.armReady(iframe);
    for (const w of this.iframeWaiters) {
      void this.ready!.then(w.resolve, w.reject);
    }
    this.iframeWaiters = [];
  }

  detachIframe(iframe?: HTMLIFrameElement | null): void {
    if (iframe && this.iframeEl !== iframe) return;
    this.iframeEl = null;
    this.ready = null;
  }

  cancelFromHost(): void {
    this.cancelAllPending();
  }

  private get iframe(): HTMLIFrameElement | null {
    return this.iframeEl;
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

  /** Single navigation + READY waiter bound to this frame. */
  private armReady(frame: HTMLIFrameElement): void {
    this.ready = this.waitForReady(frame);
    frame.src = `${SECURE_SIGNER_ORIGIN}/?r=${Date.now()}`;
  }

  private remountSigner(): void {
    if (!this.iframeEl) return;
    this.armReady(this.iframeEl);
  }

  private async ensureShell(): Promise<SecureSignerShell> {
    if (this.shell) return this.shell;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new SecureSignerError("INTERNAL_ERROR"));
      }, READY_TIMEOUT_MS);
      this.shellWaiters.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.requestHostMount();
    });
    if (!this.shell) throw new SecureSignerError("INTERNAL_ERROR");
    return this.shell;
  }

  private async waitForIframeAttach(): Promise<void> {
    if (this.iframeEl && this.ready) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new SecureSignerError("INTERNAL_ERROR"));
      }, READY_TIMEOUT_MS);
      this.iframeWaiters.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      // Sheet may already be open with iframe mid-attach.
      if (this.iframeEl && this.ready) {
        clearTimeout(timer);
        this.iframeWaiters.pop();
        resolve();
      }
    });
  }

  private async ensureReady(): Promise<void> {
    const shell = await this.ensureShell();
    shell.setOpen(true);
    await this.waitForIframeAttach();

    const ready = this.ready;
    if (!this.iframeEl || !ready) {
      throw new SecureSignerError("INTERNAL_ERROR");
    }

    try {
      await ready;
    } catch {
      this.remountSigner();
      const retry = this.ready;
      if (!this.iframeEl || !retry) {
        throw new SecureSignerError("INTERNAL_ERROR");
      }
      await retry;
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
    if (!this.iframeEl || event.source !== this.iframeEl.contentWindow) return;
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

  private hide(): void {
    this.shell?.setOpen(false);
  }

  /** Mount the Sheet host shell (iframe loads on first interactive request). */
  preload(): void {
    void this.ensureShell().catch(() => {
      /* first interactive call remounts */
    });
  }

  private async request(
    type: string,
    resultType: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      await this.ensureReady();
    } catch (err) {
      this.hide();
      throw err;
    }
    const frame = this.iframeEl;
    if (!frame?.contentWindow) {
      this.hide();
      throw new SecureSignerError("INTERNAL_ERROR");
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
      });
    });
    frame.contentWindow.postMessage(message, SECURE_SIGNER_ORIGIN);
    try {
      return await result;
    } catch (err) {
      // Only remount while the Sheet (and iframe) are still open.
      if (this.iframeEl) this.remountSigner();
      throw err;
    } finally {
      this.hide();
    }
  }

  async authenticate(opts: {
    authMode?: "create" | "unlock";
    credentialId?: string;
    webauthnAttestationObject?: string;
  }): Promise<AuthResult> {
    const payload: Record<string, unknown> = {
      authMode: opts.authMode ?? "unlock",
    };
    if (opts.credentialId) payload.credentialId = opts.credentialId;
    if (opts.webauthnAttestationObject) {
      payload.webauthnAttestationObject = opts.webauthnAttestationObject;
    }
    const r = await this.request("AUTH_START", "AUTH_COMPLETE", payload);
    if (typeof r["publicKey"] !== "string") {
      throw new SecureSignerError("INTERNAL_ERROR");
    }
    return {
      publicKey: String(r["publicKey"]),
      expiresAt: Number(r["expiresAt"]) || 0,
    };
  }

  async signTransaction(txBytes: Uint8Array): Promise<{
    signature: string;
    publicKey: string;
  }> {
    const r = await this.request("SIGN_TRANSACTION", "SIGN_TRANSACTION_RESULT", {
      transaction: bytesToBase64(txBytes),
    });
    return {
      signature: String(r["signature"]),
      publicKey: String(r["publicKey"]),
    };
  }

  async exportPrivateKey(): Promise<{ completed: boolean }> {
    const r = await this.request(
      "EXPORT_PRIVATE_KEY",
      "EXPORT_PRIVATE_KEY_RESULT",
      {},
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
