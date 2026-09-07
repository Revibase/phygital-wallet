import { describe, expect, it } from "vitest";

import {
  claimSetupHomeHref,
  parseClaimReturnPath,
  parseClaimSetupIntent,
} from "./claim-setup-href";
import { tokenHref, walletHref, walletSettingsHref } from "./token-routes";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("parseClaimReturnPath", () => {
  it("accepts card and wallet roots", () => {
    expect(parseClaimReturnPath(tokenHref(TOKEN))).toEqual({
      token: TOKEN,
      path: tokenHref(TOKEN),
    });
    expect(parseClaimReturnPath(walletHref(TOKEN))).toEqual({
      token: TOKEN,
      path: walletHref(TOKEN),
    });
  });

  it("accepts deep wallet paths where claim was started", () => {
    const access = walletSettingsHref(TOKEN, "access");
    expect(parseClaimReturnPath(access)).toEqual({
      token: TOKEN,
      path: access,
    });
    expect(parseClaimReturnPath(walletHref(TOKEN, "activity"))).toEqual({
      token: TOKEN,
      path: walletHref(TOKEN, "activity"),
    });
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(parseClaimReturnPath("https://evil.example/phish")).toBeNull();
    expect(parseClaimReturnPath("//evil.example/phish")).toBeNull();
  });

  it("rejects other routes", () => {
    expect(parseClaimReturnPath("/")).toBeNull();
    expect(parseClaimReturnPath("/token")).toBeNull();
  });
});

describe("claim setup intent", () => {
  it("home href defaults return to wallet home", () => {
    const href = claimSetupHomeHref(TOKEN);
    const u = new URL(href, "https://revibase.invalid");
    expect(u.searchParams.get("setup")).toBe("claim");
    expect(u.searchParams.get("return")).toBe(walletHref(TOKEN));
    expect(u.searchParams.get("token")).toBeNull();
  });

  it("home href preserves the caller return path", () => {
    const returnTo = walletSettingsHref(TOKEN, "access");
    const href = claimSetupHomeHref(TOKEN, returnTo);
    const u = new URL(href, "https://revibase.invalid");
    expect(u.searchParams.get("return")).toBe(returnTo);
  });

  it("parseClaimSetupIntent requires setup=claim and a valid return", () => {
    const returnPath = walletHref(TOKEN);
    expect(
      parseClaimSetupIntent({ setup: "claim", returnPath }),
    ).toEqual({
      token: TOKEN,
      returnTo: returnPath,
    });
    expect(
      parseClaimSetupIntent({ setup: "claim", returnPath: null }),
    ).toBeNull();
    expect(
      parseClaimSetupIntent({ setup: "limits", returnPath }),
    ).toBeNull();
  });
});
