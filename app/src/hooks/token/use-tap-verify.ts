"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import { queryFetch, readJson } from "@/lib/queries/http";

export type TapVerifyStatus = "pending" | "verified" | "failed";

export type TapVerifyResult = {
  status: "verified" | "failed";
  identifier?: string;
  counter?: number;
  /** PDA from server GPA — prefer over a second client GPA. */
  phygitalToken?: string;
};

async function fetchTapVerification(
  params: URLSearchParams,
): Promise<TapVerifyResult> {
  if (!["pk", "s", "c", "n"].every((k) => params.get(k))) {
    throw new Error("Missing tap parameters");
  }

  const res = await queryFetch(`/verify-tap?${params.toString()}`);
  const body = await readJson<{
    isVerified?: boolean;
    identifier?: string;
    counter?: number;
    phygitalToken?: string;
    error?: string;
  }>(res, "verification failed");

  if (!body.isVerified) {
    throw new Error(body.error ?? "verification failed");
  }

  return {
    status: "verified",
    identifier: body.identifier,
    counter: body.counter,
    phygitalToken: body.phygitalToken,
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
      // Cookie is set by /verify-tap; seed RQ so the address page skips GET.
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
