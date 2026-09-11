"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import { connectDynamicTap } from "@/lib/wallet/connect-tap";

export type TapVerifyStatus = "pending" | "verified" | "failed";

export type TapVerifyResult = {
  status: "verified" | "failed";
  identifier?: string;
  counter?: number;
  /** PDA from server GPA — prefer over a second client GPA. */
  phygitalToken?: string;
};

/**
 * Exchange the tap proof at the token's own verifier for a session bearer, then
 * for the app-session cookie.
 */
async function fetchTapVerification(
  params: URLSearchParams,
): Promise<TapVerifyResult> {
  const pk = params.get("pk");
  const s = params.get("s");
  const c = params.get("c");
  const n = params.get("n");
  if (!pk || !s || !c || !n) {
    throw new Error("Missing tap parameters");
  }

  const { phygitalToken, identifier } = await connectDynamicTap({
    pk,
    s,
    c,
    n,
  });

  return {
    status: "verified",
    identifier,
    counter: Number(c),
    phygitalToken,
  };
}

/**
 * NFC tap URL params (`pk` / `s` / `c` / `n`) for Asset claim / verify.
 * Full tap proof is required — there is no owner-only `?pk=` path.
 */
export function useTapVerify() {
  const params = useSearchParams();
  const queryClient = useQueryClient();

  const pk = params.get("pk");
  const s = params.get("s");
  const c = params.get("c");
  const n = params.get("n");

  const tapParamsString = useMemo(
    () =>
      new URLSearchParams({
        ...(pk ? { pk } : {}),
        ...(s ? { s } : {}),
        ...(c ? { c } : {}),
        ...(n ? { n } : {}),
      }).toString(),
    [pk, s, c, n],
  );

  const hasTapProof = Boolean(pk && s && c && n);

  const verifyQuery = useQuery<TapVerifyResult, Error>({
    queryKey: queryKeys.tapVerify.byParams(tapParamsString),
    queryFn: async () => {
      const result = await fetchTapVerification(
        new URLSearchParams(tapParamsString),
      );
      // Cookie is set by the app-session exchange; seed RQ so the address page skips GET.
      if (result.phygitalToken) {
        queryClient.setQueryData(
          queryKeys.deviceAuth.browseUnlock(result.phygitalToken),
          true,
        );
      }
      return result;
    },
    enabled: hasTapProof,
    // One-shot proof — cache success; never refetch.
    ...queryOptions.immutable,
  });

  // Prefer a successful result over a later error status. An expired session
  // plus the same tap URL should still redirect into the session-gated home.
  const verify: TapVerifyStatus = !hasTapProof
    ? "failed"
    : verifyQuery.data?.status === "verified"
      ? "verified"
      : verifyQuery.isPending
        ? "pending"
        : verifyQuery.isError
          ? "failed"
          : "pending";

  const verifyPending =
    hasTapProof && verify === "pending" && !verifyQuery.data;

  return {
    pk,
    hasTapProof,
    verify,
    verifyPending,
    result: verifyQuery.data ?? null,
    verifyError: verifyQuery.error ?? null,
  };
}
