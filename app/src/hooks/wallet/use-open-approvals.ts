"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachApprovalsLiveHeartbeat,
  createApprovalsLiveReconnect,
  parseApprovalLiveEvent,
} from "phygital-wallet-sdk";

import { queryKeys, queryOptions } from "@/lib/queries";
import {
  getQueryErrorStatus,
  QueryHttpError,
} from "@/lib/queries/http";
import { approvalsLiveWsUrl } from "@/lib/wallet/approvals-live";
import {
  fetchApprovalsLiveTicket,
  fetchOpenApprovals,
  type OpenApproval,
} from "@/lib/wallet/policies-client";

function useApprovalsLiveChannel(phygitalToken: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!phygitalToken) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let stopHeartbeat: (() => void) | undefined;
    let hidden = document.visibilityState === "hidden";
    const reconnect = createApprovalsLiveReconnect();

    const approvalsKey = queryKeys.walletApprovals.byToken(phygitalToken);

    function scheduleReconnect() {
      if (cancelled || hidden) return;
      reconnect.schedule(() => {
        void connect();
      });
    }

    async function connect() {
      if (cancelled || hidden) return;
      stopHeartbeat?.();
      stopHeartbeat = undefined;

      try {
        const { ticket } = await fetchApprovalsLiveTicket(phygitalToken!);
        if (cancelled || hidden) return;

        const ws = new WebSocket(approvalsLiveWsUrl(ticket));
        socket = ws;

        ws.onopen = () => {
          reconnect.resetAttempts();
          stopHeartbeat = attachApprovalsLiveHeartbeat(ws);
          void queryClient.invalidateQueries({ queryKey: approvalsKey });
        };

        ws.onmessage = (event) => {
          const msg = parseApprovalLiveEvent(
            typeof event.data === "string" ? event.data : "",
          );
          if (!msg) return;
          if (
            msg.type === "approvals_changed" ||
            msg.type === "approval_resolved"
          ) {
            void queryClient.invalidateQueries({ queryKey: approvalsKey });
          }
        };

        ws.onclose = () => {
          stopHeartbeat?.();
          stopHeartbeat = undefined;
          socket = null;
          if (cancelled || hidden) return;
          scheduleReconnect();
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (error) {
        if (cancelled || hidden) return;
        const status = getQueryErrorStatus(error);
        if (status === 401 || status === 403) return;
        if (error instanceof QueryHttpError && error.status === 429) {
          reconnect.setRetryAfterMs(error.retryAfterMs);
        }
        scheduleReconnect();
      }
    }

    function tearDownSocket() {
      reconnect.setSuppress(true);
      reconnect.clear();
      stopHeartbeat?.();
      stopHeartbeat = undefined;
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      socket = null;
      reconnect.setSuppress(false);
    }

    function onOnline() {
      if (cancelled || hidden) return;
      reconnect.bump();
      reconnect.resetAttempts();
      tearDownSocket();
      void connect();
    }

    function onVisibility() {
      hidden = document.visibilityState === "hidden";
      if (hidden) {
        reconnect.bump();
        tearDownSocket();
        return;
      }
      reconnect.resetAttempts();
      void queryClient.invalidateQueries({ queryKey: approvalsKey });
      void connect();
    }

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    if (!hidden) void connect();

    return () => {
      cancelled = true;
      reconnect.clear();
      stopHeartbeat?.();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      socket?.close();
    };
  }, [phygitalToken, queryClient]);
}

/** Open approvals for the owner device. Visitors pass null token. */
export function useOpenApprovals(phygitalToken: string | null) {
  useApprovalsLiveChannel(phygitalToken);

  const approvals = useQuery({
    queryKey: queryKeys.walletApprovals.byToken(phygitalToken),
    queryFn: (): Promise<OpenApproval[]> => fetchOpenApprovals(phygitalToken!),
    enabled: Boolean(phygitalToken),
    ...queryOptions.volatile,
  });

  return {
    approvals: approvals.data ?? [],
    isLoading: approvals.isLoading,
    refetch: approvals.refetch,
  };
}
