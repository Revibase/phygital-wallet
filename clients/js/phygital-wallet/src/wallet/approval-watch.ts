import { DEFAULT_VERIFIER_API_BASE } from "../constants.js";
import { normalizeVerifierApiBase } from "./verifier-endpoint.js";
import { PolicyDeniedError } from "./preview.js";

export type ApprovalLiveEvent =
  | { type: "approvals_changed" }
  | {
      type: "approval_resolved";
      intentHash: string;
      status: "granted" | "denied" | "cancelled";
    };

export type ApprovalResolution = {
  intentHash: string;
  status: "granted" | "denied" | "cancelled";
};

export type ApprovalWatchStatus =
  | { status: "pending"; expiresAt: number }
  | { status: "granted" | "denied" | "cancelled" }
  | { status: "expired" };

/** Matches API `PENDING_APPROVAL_TTL_MS` (wait is before SlotHashes / NFC). */
export const DEFAULT_APPROVAL_WATCH_TIMEOUT_MS = 5 * 60 * 1000;

/** Client → DO auto-response; detects half-open sockets after network blips. */
const WS_PING_INTERVAL_MS = 20_000;
const WS_PONG_TIMEOUT_MS = 10_000;
const RECONNECT_CAP_MS = 30_000;

/**
 * Full-jitter exponential backoff. Optional `Retry-After` floor for 429s.
 */
export function approvalsReconnectDelayMs(
  attempt: number,
  retryAfterMs?: number | null,
): number {
  const exp = Math.min(RECONNECT_CAP_MS, 1_000 * 2 ** Math.max(0, attempt));
  const jittered = Math.floor(Math.random() * (exp + 1));
  const floor =
    typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
      ? Math.max(0, retryAfterMs)
      : 0;
  return Math.max(jittered, floor);
}

/** Parse `Retry-After` (delta-seconds or HTTP-date) to a capped delay. */
export function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("Retry-After")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.floor(seconds * 1000));
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    return Math.min(60_000, Math.max(0, when - Date.now()));
  }
  return null;
}

/** Shared reconnect control plane for owner inbox + visitor watch sockets. */
export function createApprovalsLiveReconnect() {
  let attempt = 0;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryAfterMs: number | null = null;
  let suppress = false;

  return {
    get generation() {
      return generation;
    },
    setSuppress(value: boolean) {
      suppress = value;
    },
    setRetryAfterMs(ms: number | null) {
      retryAfterMs = ms;
    },
    resetAttempts() {
      attempt = 0;
      retryAfterMs = null;
    },
    bump() {
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = undefined;
      return generation;
    },
    schedule(run: () => void) {
      if (suppress) return;
      const delay = approvalsReconnectDelayMs(attempt, retryAfterMs);
      retryAfterMs = null;
      attempt += 1;
      const gen = generation;
      timer = setTimeout(() => {
        if (gen !== generation) return;
        run();
      }, delay);
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export function verifierApprovalsLiveUrl(
  apiBase: string,
  ticket: string,
): string {
  const http = `${normalizeVerifierApiBase(apiBase)}/approvals/live?ticket=${encodeURIComponent(ticket)}`;
  return http.replace(/^http/i, "ws");
}

export function verifierApprovalsWatchStatusUrl(
  apiBase: string,
  ticket: string,
): string {
  return `${normalizeVerifierApiBase(apiBase)}/approvals/watch?ticket=${encodeURIComponent(ticket)}`;
}

export function parseApprovalLiveEvent(
  raw: string,
): ApprovalLiveEvent | null {
  if (!raw || raw === "pong") return null;
  try {
    const msg = JSON.parse(raw) as {
      type?: string;
      intentHash?: string;
      status?: string;
    };
    if (msg.type === "approvals_changed") {
      return { type: "approvals_changed" };
    }
    if (
      msg.type === "approval_resolved" &&
      typeof msg.intentHash === "string" &&
      (msg.status === "granted" ||
        msg.status === "denied" ||
        msg.status === "cancelled")
    ) {
      return {
        type: "approval_resolved",
        intentHash: msg.intentHash,
        status: msg.status,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function isAwaitingRemoteApproval(
  error: unknown,
): error is PolicyDeniedError & {
  soft: true;
  intentHash: string;
  watchTicket: string;
} {
  return (
    error instanceof PolicyDeniedError &&
    error.soft === true &&
    typeof error.intentHash === "string" &&
    error.intentHash.length > 0 &&
    typeof error.watchTicket === "string" &&
    error.watchTicket.length > 0
  );
}

export type CancelRemoteApprovalArgs = {
  phygitalToken: string;
  intentHash: string;
  watchTicket: string;
  endpoint?: string;
  fetch?: typeof fetch;
  abortSignal?: AbortSignal;
};

/** Visitor withdraws a pending soft-deny via watchTicket (clears owner inbox). */
export async function cancelRemoteApproval(
  args: CancelRemoteApprovalArgs,
): Promise<void> {
  const endpoint = args.endpoint ?? DEFAULT_VERIFIER_API_BASE;
  const fetchFn = args.fetch ?? fetch;
  const url = `${normalizeVerifierApiBase(endpoint)}/policies/${encodeURIComponent(args.phygitalToken)}/approvals/cancel`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intentHash: args.intentHash,
      watchTicket: args.watchTicket,
    }),
    signal: args.abortSignal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text || `Failed to cancel remote approval (${res.status})`,
    );
  }
}

export class ApprovalWatchHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null) {
    super(message);
    this.name = "ApprovalWatchHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** One-shot status for catch-up after a WebSocket blip. */
export async function fetchApprovalWatchStatus(args: {
  watchTicket: string;
  endpoint?: string;
  fetch?: typeof fetch;
  abortSignal?: AbortSignal;
}): Promise<ApprovalWatchStatus> {
  const endpoint = args.endpoint ?? DEFAULT_VERIFIER_API_BASE;
  const fetchFn = args.fetch ?? fetch;
  const url = verifierApprovalsWatchStatusUrl(endpoint, args.watchTicket);
  const res = await fetchFn(url, { signal: args.abortSignal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApprovalWatchHttpError(
      text || `Failed to fetch approval status (${res.status})`,
      res.status,
      parseRetryAfterMs(res),
    );
  }
  const body = (await res.json()) as ApprovalWatchStatus;
  if (
    body?.status === "pending" ||
    body?.status === "granted" ||
    body?.status === "denied" ||
    body?.status === "cancelled" ||
    body?.status === "expired"
  ) {
    return body;
  }
  throw new Error("Invalid approval watch status response");
}

export function attachApprovalsLiveHeartbeat(
  ws: WebSocket,
  openState: number = typeof WebSocket !== "undefined" ? WebSocket.OPEN : 1,
): () => void {
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let expectingPong = false;

  const clearPongWait = () => {
    if (pongTimer) clearTimeout(pongTimer);
    pongTimer = undefined;
    expectingPong = false;
  };

  const onMessage = (event: MessageEvent) => {
    if (typeof event.data === "string" && event.data === "pong") {
      clearPongWait();
    }
  };

  const sendPing = () => {
    if (ws.readyState !== openState) return;
    try {
      ws.send("ping");
    } catch {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    expectingPong = true;
    pongTimer = setTimeout(() => {
      if (!expectingPong) return;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }, WS_PONG_TIMEOUT_MS);
  };

  if (typeof ws.addEventListener === "function") {
    ws.addEventListener("message", onMessage);
  }
  pingTimer = setInterval(sendPing, WS_PING_INTERVAL_MS);

  return () => {
    if (pingTimer) clearInterval(pingTimer);
    clearPongWait();
    if (typeof ws.removeEventListener === "function") {
      ws.removeEventListener("message", onMessage);
    }
  };
}

export type SubscribeApprovalResolutionArgs = {
  intentHash: string;
  watchTicket: string;
  endpoint?: string;
  fetch?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  onResolved: (resolution: ApprovalResolution) => void;
};

export function subscribeApprovalResolution(
  args: SubscribeApprovalResolutionArgs,
): () => void {
  const endpoint = args.endpoint ?? DEFAULT_VERIFIER_API_BASE;
  const fetchFn = args.fetch ?? fetch;
  const Ws = args.WebSocketImpl ?? WebSocket;
  const url = verifierApprovalsLiveUrl(endpoint, args.watchTicket);
  const reconnect = createApprovalsLiveReconnect();

  let cancelled = false;
  let socket: WebSocket | null = null;
  let stopHeartbeat: (() => void) | undefined;
  let settled = false;
  const openState = Ws.OPEN ?? 1;

  function settle(status: ApprovalResolution["status"]) {
    if (settled || cancelled) return;
    settled = true;
    stopHeartbeat?.();
    stopHeartbeat = undefined;
    reconnect.clear();
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
    args.onResolved({ intentHash: args.intentHash, status });
  }

  async function catchUpFromStatus() {
    if (cancelled || settled) return;
    try {
      const status = await fetchApprovalWatchStatus({
        watchTicket: args.watchTicket,
        endpoint,
        fetch: fetchFn,
      });
      if (cancelled || settled) return;
      if (
        status.status === "granted" ||
        status.status === "denied" ||
        status.status === "cancelled"
      ) {
        settle(status.status);
        return;
      }
      if (status.status === "expired") {
        settle("cancelled");
      }
    } catch (error) {
      if (error instanceof ApprovalWatchHttpError) {
        if (error.status === 401 || error.status === 403) {
          settle("cancelled");
          return;
        }
        if (error.status === 429) {
          reconnect.setRetryAfterMs(error.retryAfterMs);
        }
      }
    }
  }

  function scheduleReconnect() {
    if (cancelled || settled) return;
    reconnect.schedule(() => {
      void connect();
    });
  }

  async function connect() {
    if (cancelled || settled) return;
    stopHeartbeat?.();
    stopHeartbeat = undefined;

    try {
      const ws = new Ws(url);
      socket = ws;

      ws.onopen = () => {
        reconnect.resetAttempts();
        stopHeartbeat = attachApprovalsLiveHeartbeat(ws, openState);
        void catchUpFromStatus();
      };

      ws.onmessage = (event: MessageEvent) => {
        const raw = typeof event.data === "string" ? event.data : "";
        const msg = parseApprovalLiveEvent(raw);
        if (!msg || msg.type !== "approval_resolved") return;
        if (msg.intentHash !== args.intentHash) return;
        settle(msg.status);
      };

      ws.onclose = () => {
        stopHeartbeat?.();
        stopHeartbeat = undefined;
        socket = null;
        if (cancelled || settled) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    } catch {
      scheduleReconnect();
    }
  }

  function onOnline() {
    if (cancelled || settled) return;
    reconnect.bump();
    reconnect.resetAttempts();
    reconnect.setSuppress(true);
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
    reconnect.setSuppress(false);
    void connect();
  }

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("online", onOnline);
  }

  void connect();

  return () => {
    cancelled = true;
    reconnect.clear();
    stopHeartbeat?.();
    if (typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("online", onOnline);
    }
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
}

export type WatchApprovalResolutionArgs = {
  phygitalToken: string;
  intentHash: string;
  watchTicket: string;
  endpoint?: string;
  fetch?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
};

function withdrawRemoteApproval(args: WatchApprovalResolutionArgs): void {
  void cancelRemoteApproval({
    phygitalToken: args.phygitalToken,
    intentHash: args.intentHash,
    watchTicket: args.watchTicket,
    endpoint: args.endpoint,
    fetch: args.fetch,
  }).catch(() => undefined);
}

/** Resolves on grant/deny/cancel. Abort or timeout withdraws the pending row. */
export function watchApprovalResolution(
  args: WatchApprovalResolutionArgs,
): Promise<ApprovalResolution> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_APPROVAL_WATCH_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    if (args.abortSignal?.aborted) {
      reject(args.abortSignal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      cleanup();
      withdrawRemoteApproval(args);
      reject(new Error("Approval watch timed out"));
    }, timeoutMs);

    const unsubscribe = subscribeApprovalResolution({
      intentHash: args.intentHash,
      watchTicket: args.watchTicket,
      endpoint: args.endpoint,
      fetch: args.fetch,
      WebSocketImpl: args.WebSocketImpl,
      onResolved: (resolution) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(resolution);
      },
    });

    function onAbort() {
      cleanup();
      withdrawRemoteApproval(args);
      reject(
        args.abortSignal?.reason ?? new DOMException("Aborted", "AbortError"),
      );
    }

    function cleanup() {
      clearTimeout(timeoutId);
      unsubscribe();
      args.abortSignal?.removeEventListener("abort", onAbort);
    }

    args.abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}
