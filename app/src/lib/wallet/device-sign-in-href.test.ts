import { describe, expect, it } from "vitest";

import {
  deviceSignInHomeHref,
  isOwnerAuthFailure,
  isPolicySetupScreen,
  parseDeviceSignInIntent,
  parseSafeTokenReturnPath,
} from "./device-sign-in-href";
import { parseTokenWalletPath, walletHref, walletSettingsHref } from "./token-routes";

/** Valid base58 pubkey for parser tests. */
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("parseTokenWalletPath", () => {
  it("accepts card and wallet roots", () => {
    expect(parseTokenWalletPath(`/token/${TOKEN}`)).toEqual({
      kind: "card",
      token: TOKEN,
      path: `/token/${TOKEN}`,
    });
    expect(parseTokenWalletPath(`/token/${TOKEN}/wallet`)).toEqual({
      kind: "wallet",
      token: TOKEN,
      segments: [],
      path: `/token/${TOKEN}/wallet`,
    });
  });

  it("accepts allowlisted wallet segments", () => {
    expect(parseTokenWalletPath(walletHref(TOKEN, "activity"))).toEqual({
      kind: "wallet",
      token: TOKEN,
      segments: ["activity"],
      path: walletHref(TOKEN, "activity"),
    });
    expect(
      parseTokenWalletPath(walletSettingsHref(TOKEN, "spendingLimits")),
    ).toEqual({
      kind: "wallet",
      token: TOKEN,
      segments: ["settings", "spending-limits"],
      path: walletSettingsHref(TOKEN, "spendingLimits"),
    });
  });

  it("rejects open redirects and unknown segments", () => {
    expect(parseTokenWalletPath("https://evil.example/phish")).toBeNull();
    expect(parseTokenWalletPath("//evil.example/phish")).toBeNull();
    expect(parseTokenWalletPath(`/token/${TOKEN}/wallet/../settings`)).toBeNull();
    expect(parseTokenWalletPath(`/token/${TOKEN}/wallet/claim`)).toBeNull();
    expect(parseTokenWalletPath(`/token/not-a-pubkey/wallet`)).toBeNull();
    expect(
      parseTokenWalletPath(`/token/${TOKEN}/wallet/settings/unknown`),
    ).toBeNull();
  });
});

describe("parseSafeTokenReturnPath", () => {
  it("accepts any allowlisted wallet return path", () => {
    const spending = walletSettingsHref(TOKEN, "spendingLimits");
    expect(parseSafeTokenReturnPath(spending)).toEqual({
      token: TOKEN,
      returnTo: spending,
    });

    const access = walletSettingsHref(TOKEN, "access");
    expect(parseSafeTokenReturnPath(access)).toEqual({
      token: TOKEN,
      returnTo: access,
    });

    const activity = walletHref(TOKEN, "activity");
    expect(parseSafeTokenReturnPath(activity)).toEqual({
      token: TOKEN,
      returnTo: activity,
    });
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(parseSafeTokenReturnPath("https://evil.example/phish")).toBeNull();
    expect(parseSafeTokenReturnPath("//evil.example/phish")).toBeNull();
  });

  it("rejects other app routes", () => {
    expect(parseSafeTokenReturnPath("/home")).toBeNull();
  });

  it("isPolicySetupScreen only allows known sheets", () => {
    expect(isPolicySetupScreen("spendingLimits")).toBe(true);
    expect(isPolicySetupScreen("settings")).toBe(false);
  });
});

describe("device sign-in intent", () => {
  it("home href only carries setup + return", () => {
    const returnTo = walletSettingsHref(TOKEN, "recipients");
    const href = deviceSignInHomeHref({ token: TOKEN, returnTo });
    const u = new URL(href, "https://revibase.invalid");
    expect(u.searchParams.get("setup")).toBe("limits");
    expect(u.searchParams.get("return")).toBe(returnTo);
    expect(u.searchParams.get("token")).toBeNull();
    expect(u.searchParams.get("screen")).toBeNull();
  });

  it("parseDeviceSignInIntent requires setup=limits and a valid return", () => {
    const returnPath = walletSettingsHref(TOKEN, "spendingLimits");
    expect(
      parseDeviceSignInIntent({ setup: "limits", returnPath }),
    ).toEqual({
      token: TOKEN,
      returnTo: returnPath,
    });
    expect(
      parseDeviceSignInIntent({ setup: "limits", returnPath: null }),
    ).toBeNull();
    expect(
      parseDeviceSignInIntent({ setup: null, returnPath }),
    ).toBeNull();
  });

  it("falls back to wallet home when returnTo is unsafe", () => {
    const href = deviceSignInHomeHref({
      token: TOKEN,
      returnTo: "https://evil.example",
    });
    const u = new URL(href, "https://revibase.invalid");
    expect(u.searchParams.get("return")).toBe(walletHref(TOKEN));
  });
});

describe("isOwnerAuthFailure", () => {
  it("treats device-session PolicyDeniedError as owner auth failure", async () => {
    const { PolicyDeniedError } = await import("phygital-wallet-sdk");
    expect(
      isOwnerAuthFailure(
        new PolicyDeniedError({
          code: "device_session_required",
          error: "Sign in with this phone to continue.",
          soft: false,
        }),
      ),
    ).toBe(true);
    expect(
      isOwnerAuthFailure(
        new PolicyDeniedError({
          code: "not_owner",
          error: "Only the owner phone can do this.",
          soft: false,
        }),
      ),
    ).toBe(true);
    expect(
      isOwnerAuthFailure(
        new PolicyDeniedError({
          code: "insufficient_fee_balance",
          error: "Fee balance is too low",
          soft: false,
        }),
      ),
    ).toBe(false);
  });
});
