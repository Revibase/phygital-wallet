import { describe, expect, it } from "vitest";

import {
  claimSetupHomeHref,
  parseClaimReturnPath,
  parseClaimSetupIntent,
} from "./claim-setup-href";
import { tokenHomeHref } from "./token-home-href";

describe("parseClaimReturnPath", () => {
  const token = "TokenPda111111111111111111111111111111111";

  it("accepts /token?address= return paths", () => {
    expect(parseClaimReturnPath(tokenHomeHref(token))).toEqual({
      token,
      path: tokenHomeHref(token),
    });
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(parseClaimReturnPath("https://evil.example/phish")).toBeNull();
    expect(parseClaimReturnPath("//evil.example/phish")).toBeNull();
  });

  it("rejects other routes and missing address", () => {
    expect(parseClaimReturnPath("/")).toBeNull();
    expect(parseClaimReturnPath("/token")).toBeNull();
  });
});

describe("claim setup intent", () => {
  const token = "TokenPda111111111111111111111111111111111";

  it("home href carries setup=claim and return only", () => {
    const href = claimSetupHomeHref(token);
    const u = new URL(href, "https://revibase.invalid");
    expect(u.searchParams.get("setup")).toBe("claim");
    expect(u.searchParams.get("return")).toBe(tokenHomeHref(token));
    expect(u.searchParams.get("token")).toBeNull();
  });

  it("parseClaimSetupIntent requires setup=claim and a valid return", () => {
    const returnPath = tokenHomeHref(token);
    expect(
      parseClaimSetupIntent({ setup: "claim", returnPath }),
    ).toEqual({
      token,
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
