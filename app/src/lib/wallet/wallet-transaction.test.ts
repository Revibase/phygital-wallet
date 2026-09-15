import { describe, expect, it, vi } from "vitest";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import type { SentTransaction } from "@/lib/solana/tx";
import { runWalletTransaction } from "./wallet-transaction";

function sent(signature: string, confirmed: Promise<void>): SentTransaction {
  return { signature, confirmed };
}

/** Let queued `.then` callbacks on an already-settled promise run. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function baseOptimistic() {
  return {
    apply: vi.fn((signature: string) => ({ signature })),
    confirm: vi.fn(),
    rollback: vi.fn(),
  };
}

const noopHandlers = {
  resolvePolicyDenial: vi.fn(async () => "rejected" as const),
  onConfirmError: vi.fn(),
  onError: vi.fn(),
};

describe("runWalletTransaction", () => {
  it("sent + confirm succeeds → optimistic kept, no rollback", async () => {
    const optimistic = baseOptimistic();
    const onSent = vi.fn();

    const outcome = await runWalletTransaction({
      send: async () => sent("sig1", Promise.resolve()),
      optimistic,
      onSent,
      ...noopHandlers,
    });
    await flush();

    expect(outcome).toEqual({ status: "sent", signature: "sig1", mode: "policy" });
    expect(optimistic.apply).toHaveBeenCalledWith("sig1");
    expect(onSent).toHaveBeenCalledWith("sig1", "policy");
    expect(optimistic.confirm).toHaveBeenCalledTimes(1);
    expect(optimistic.rollback).not.toHaveBeenCalled();
  });

  it("sent + confirm fails → rollback + confirm-error toast", async () => {
    const optimistic = baseOptimistic();
    const onConfirmError = vi.fn();
    const confirmErr = new Error("blockhash expired");

    await runWalletTransaction({
      send: async () => sent("sig2", Promise.reject(confirmErr)),
      optimistic,
      ...noopHandlers,
      onConfirmError,
    });
    await flush();

    expect(optimistic.apply).toHaveBeenCalledTimes(1);
    expect(optimistic.rollback).toHaveBeenCalledWith({ signature: "sig2" });
    expect(optimistic.confirm).not.toHaveBeenCalled();
    expect(onConfirmError).toHaveBeenCalledWith(confirmErr);
  });

  it("policy denial + authority approval → executeWithAuthority path", async () => {
    const optimistic = baseOptimistic();
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        new PolicyDeniedError({ code: "spend_limit", error: "over limit" })
      )
      .mockResolvedValueOnce(sent("sig-auth", Promise.resolve()));

    const outcome = await runWalletTransaction({
      send,
      optimistic,
      ...noopHandlers,
      resolvePolicyDenial: vi.fn(async () => "authority" as const),
    });
    await flush();

    expect(send).toHaveBeenNthCalledWith(1, "policy");
    expect(send).toHaveBeenNthCalledWith(2, "authority");
    expect(outcome).toEqual({
      status: "sent",
      signature: "sig-auth",
      mode: "authority",
    });
    expect(optimistic.apply).toHaveBeenCalledTimes(1);
  });

  it("policy denial + reject → no send, no optimistic", async () => {
    const optimistic = baseOptimistic();
    const denial = new PolicyDeniedError({
      code: "spend_limit",
      error: "over limit",
    });
    const send = vi.fn().mockRejectedValueOnce(denial);

    const outcome = await runWalletTransaction({
      send,
      optimistic,
      ...noopHandlers,
      resolvePolicyDenial: vi.fn(async () => "rejected" as const),
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(optimistic.apply).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "rejected", error: denial });
  });

  it("funding denial → onFundingDenial, never asks resolvePolicyDenial", async () => {
    const optimistic = baseOptimistic();
    const denial = new PolicyDeniedError({
      code: "insufficient_fee_balance",
      error: "top up",
    });
    const resolvePolicyDenial = vi.fn(async () => "authority" as const);
    const onFundingDenial = vi.fn();

    const outcome = await runWalletTransaction({
      send: async () => {
        throw denial;
      },
      optimistic,
      resolvePolicyDenial,
      onConfirmError: vi.fn(),
      onError: vi.fn(),
      onFundingDenial,
    });

    expect(onFundingDenial).toHaveBeenCalledWith(denial);
    expect(resolvePolicyDenial).not.toHaveBeenCalled();
    expect(optimistic.apply).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "rejected", error: denial });
  });

  it("pre-send error → onError, no optimistic", async () => {
    const optimistic = baseOptimistic();
    const onError = vi.fn();
    const err = new Error("rpc down");

    const outcome = await runWalletTransaction({
      send: async () => {
        throw err;
      },
      optimistic,
      ...noopHandlers,
      onError,
    });

    expect(onError).toHaveBeenCalledWith(err);
    expect(optimistic.apply).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "error", error: err });
  });

  it("abort → aborted, no onError", async () => {
    const optimistic = baseOptimistic();
    const onError = vi.fn();
    const abort = new DOMException("aborted", "AbortError");

    const outcome = await runWalletTransaction({
      send: async () => {
        throw abort;
      },
      optimistic,
      ...noopHandlers,
      onError,
    });

    expect(outcome).toEqual({ status: "aborted" });
    expect(onError).not.toHaveBeenCalled();
    expect(optimistic.apply).not.toHaveBeenCalled();
  });
});
