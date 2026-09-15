"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

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
 * Post the tap proof to the api worker, which verifies it and sets the
 * browse-unlock cookie for the resolved token.
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
 * NFC tap URL params (`pk` / `s` / `c` / `n`) for accessory verification.
 * Full tap proof is required — there is no owner-only `?pk=` path.
 */
export function useTapVerify() {
  const params = useSearchParams();

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
    queryFn: async () =>
      fetchTapVerification(new URLSearchParams(tapParamsString)),
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
