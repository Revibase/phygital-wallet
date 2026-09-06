import { describe, expect, it } from "vitest";

import {
  isPolicySetupScreen,
  limitsSetupHomeHref,
  parseLimitsSetupIntent,
  parseSetupReturnPath,
  tokenLimitsReturnPath,
} from "./limits-setup-href";
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

describe("parseSetupReturnPath", () => {
  it("accepts a matching settings return path", () => {
    const raw = tokenLimitsReturnPath(TOKEN, "spendingLimits");
    expect(parseSetupReturnPath(raw)).toEqual({
      token: TOKEN,
      screen: "spendingLimits",
      path: raw,
    });
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(parseSetupReturnPath("https://evil.example/phish")).toBeNull();
    expect(parseSetupReturnPath("//evil.example/phish")).toBeNull();
  });

  it("rejects other app routes and missing screen", () => {
    expect(parseSetupReturnPath("/home")).toBeNull();
    expect(parseSetupReturnPath(`/token/${TOKEN}`)).toBeNull();
    expect(parseSetupReturnPath(`/token/${TOKEN}/wallet`)).toBeNull();
  });

  it("isPolicySetupScreen only allows known sheets", () => {
    expect(isPolicySetupScreen("spendingLimits")).toBe(true);
    expect(isPolicySetupScreen("settings")).toBe(false);
  });
});

describe("limits setup intent", () => {
  it("home href only carries setup + return", () => {
    const href = limitsSetupHomeHref({ token: TOKEN, screen: "recipients" });
    const u = new URL(href, "https://revibase.invalid");
    expect(u.searchParams.get("setup")).toBe("limits");
    expect(u.searchParams.get("return")).toBe(
      tokenLimitsReturnPath(TOKEN, "recipients"),
    );
    expect(u.searchParams.get("token")).toBeNull();
    expect(u.searchParams.get("screen")).toBeNull();
  });

  it("parseLimitsSetupIntent requires setup=limits and a valid return", () => {
    const returnPath = tokenLimitsReturnPath(TOKEN, "spendingLimits");
    expect(
      parseLimitsSetupIntent({ setup: "limits", returnPath }),
    ).toEqual({
      token: TOKEN,
      screen: "spendingLimits",
      returnTo: returnPath,
    });
    expect(
      parseLimitsSetupIntent({ setup: "limits", returnPath: null }),
    ).toBeNull();
    expect(
      parseLimitsSetupIntent({ setup: null, returnPath }),
    ).toBeNull();
  });
});
