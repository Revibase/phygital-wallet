import { describe, expect, it, vi } from "vitest";

import { PolicyDeniedError } from "../wallet/preview.js";
import {
  approvalsReconnectDelayMs,
  isAwaitingRemoteApproval,
  parseApprovalLiveEvent,
  subscribeApprovalResolution,
  verifierApprovalsLiveUrl,
  verifierApprovalsWatchStatusUrl,
  watchApprovalResolution,
} from "../wallet/approval-watch.js";

function pendingStatusResponse() {
  return {
    ok: true,
    json: async () => ({ status: "pending", expiresAt: Date.now() + 60_000 }),
  };
}

function grantedStatusResponse() {
  return {
    ok: true,
    json: async () => ({ status: "granted" }),
  };
}

describe("parseApprovalLiveEvent", () => {
  it("parses approvals_changed", () => {
    expect(parseApprovalLiveEvent('{"type":"approvals_changed"}')).toEqual({
      type: "approvals_changed",
    });
  });

  it("parses approval_resolved", () => {
    expect(
      parseApprovalLiveEvent(
        '{"type":"approval_resolved","intentHash":"abc","status":"granted"}',
      ),
    ).toEqual({
      type: "approval_resolved",
      intentHash: "abc",
      status: "granted",
    });
  });

  it("parses approval_resolved cancelled", () => {
    expect(
      parseApprovalLiveEvent(
        '{"type":"approval_resolved","intentHash":"abc","status":"cancelled"}',
      ),
    ).toEqual({
      type: "approval_resolved",
      intentHash: "abc",
      status: "cancelled",
    });
  });

  it("ignores pong and junk", () => {
    expect(parseApprovalLiveEvent("pong")).toBeNull();
    expect(parseApprovalLiveEvent("{")).toBeNull();
    expect(
      parseApprovalLiveEvent('{"type":"approval_resolved","status":"nope"}'),
    ).toBeNull();
  });
});

describe("approvalsReconnectDelayMs", () => {
  it("stays within exponential cap and honors Retry-After floor", () => {
    for (let i = 0; i < 20; i++) {
      const d = approvalsReconnectDelayMs(0);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1_000);
    }
    expect(approvalsReconnectDelayMs(10, 5_000)).toBeGreaterThanOrEqual(5_000);
    expect(approvalsReconnectDelayMs(10, 5_000)).toBeLessThanOrEqual(30_000);
  });
});

describe("verifierApprovalsLiveUrl", () => {
  it("builds a ws URL under /approvals/live", () => {
    expect(verifierApprovalsLiveUrl("https://api.example.com/", "tick")).toBe(
      "wss://api.example.com/approvals/live?ticket=tick",
    );
  });

  it("builds a watch status URL", () => {
    expect(
      verifierApprovalsWatchStatusUrl("https://api.example.com/", "tick"),
    ).toBe("https://api.example.com/approvals/watch?ticket=tick");
  });
});

describe("isAwaitingRemoteApproval", () => {
  it("requires soft + intentHash + watchTicket", () => {
    expect(
      isAwaitingRemoteApproval(
        new PolicyDeniedError({
          code: "over_limit",
          error: "x",
          soft: true,
          intentHash: "h",
          watchTicket: "t",
        }),
      ),
    ).toBe(true);
    expect(
      isAwaitingRemoteApproval(
        new PolicyDeniedError({
          code: "over_limit",
          error: "x",
          soft: true,
          intentHash: "h",
        }),
      ),
    ).toBe(false);
  });
});

describe("subscribeApprovalResolution", () => {
  it("resolves on matching approval_resolved and unsubscribes", async () => {
    const instances: FakeWebSocket[] = [];
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor(public url: string) {
        instances.push(this);
        queueMicrotask(() => this.onopen?.(new Event("open")));
      }
      send = vi.fn();
      close = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }

    const fetchMock = vi.fn(async () => pendingStatusResponse());
    const onResolved = vi.fn();
    const stop = subscribeApprovalResolution({
      intentHash: "intent-1",
      watchTicket: "ticket",
      endpoint: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      onResolved,
    });

    await vi.waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0]!.url).toBe(
      "wss://api.example.com/approvals/live?ticket=ticket",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/approvals/watch?ticket=ticket",
      expect.anything(),
    );

    instances[0]!.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "approval_resolved",
          intentHash: "other",
          status: "granted",
        }),
      }),
    );
    expect(onResolved).not.toHaveBeenCalled();

    instances[0]!.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "approval_resolved",
          intentHash: "intent-1",
          status: "denied",
        }),
      }),
    );
    expect(onResolved).toHaveBeenCalledWith({
      intentHash: "intent-1",
      status: "denied",
    });
    expect(instances[0]!.close).toHaveBeenCalled();

    stop();
  });

  it("settles from watch status when the push was missed", async () => {
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor(_url: string) {
        queueMicrotask(() => this.onopen?.(new Event("open")));
      }
      send = vi.fn();
      close = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }

    const fetchMock = vi.fn(async () => grantedStatusResponse());
    const onResolved = vi.fn();
    const stop = subscribeApprovalResolution({
      intentHash: "intent-1",
      watchTicket: "ticket",
      endpoint: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      onResolved,
    });

    await vi.waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith({
        intentHash: "intent-1",
        status: "granted",
      }),
    );

    stop();
  });
});

describe("watchApprovalResolution", () => {
  it("fulfills when the socket reports granted", async () => {
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor(_url: string) {
        queueMicrotask(() => {
          this.onopen?.(new Event("open"));
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "approval_resolved",
                intentHash: "h",
                status: "granted",
              }),
            }),
          );
        });
      }
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }

    await expect(
      watchApprovalResolution({
        phygitalToken: "tok",
        intentHash: "h",
        watchTicket: "t",
        endpoint: "https://api.example.com",
        fetch: (async () => pendingStatusResponse()) as unknown as typeof fetch,
        WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
        timeoutMs: 2_000,
      }),
    ).resolves.toEqual({ intentHash: "h", status: "granted" });
  });

  it("aborts by withdrawing the pending approval then rejecting", async () => {
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor(_url: string) {}
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/approvals/watch?")) {
        return pendingStatusResponse();
      }
      return { ok: true };
    });
    const abort = new AbortController();
    const pending = watchApprovalResolution({
      phygitalToken: "tok",
      intentHash: "h",
      watchTicket: "t",
      endpoint: "https://api.example.com",
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      fetch: fetchMock as unknown as typeof fetch,
      abortSignal: abort.signal,
      timeoutMs: 5_000,
    });

    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/policies/tok/approvals/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ intentHash: "h", watchTicket: "t" }),
      }),
    );
  });
});
