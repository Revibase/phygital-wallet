import { describe, expect, it } from "vitest";

import {
  claimSetupHomeHref,
  parseClaimReturnPath,
  parseClaimSetupIntent,
} from "./claim-setup-href";
import { tokenHref, walletHref } from "./token-routes";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("parseClaimReturnPath", () => {
  it("accepts /token/{address} and normalizes to wallet home", () => {
    expect(parseClaimReturnPath(tokenHref(TOKEN))).toEqual({
      token: TOKEN,
      path: walletHref(TOKEN),
    });
  });

  it("accepts wallet root as claim return", () => {
    expect(parseClaimReturnPath(walletHref(TOKEN))).toEqual({
      token: TOKEN,
      path: walletHref(TOKEN),
    });
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(parseClaimReturnPath("https://evil.example/phish")).toBeNull();
    expect(parseClaimReturnPath("//evil.example/phish")).toBeNull();
  });

  it("rejects other routes and deep wallet paths", () => {
    expect(parseClaimReturnPath("/")).toBeNull();
    expect(parseClaimReturnPath("/token")).toBeNull();
    expect(parseClaimReturnPath(walletHref(TOKEN, "activity"))).toBeNull();
  });
});

describe("claim setup intent", () => {
  it("home href carries setup=claim and return only", () => {
    const href = claimSetupHomeHref(TOKEN);
    const u = new URL(href, "https://revibase.invalid");
    expect(u.searchParams.get("setup")).toBe("claim");
    expect(u.searchParams.get("return")).toBe(walletHref(TOKEN));
    expect(u.searchParams.get("token")).toBeNull();
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
