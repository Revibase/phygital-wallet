import { describe, expect, it } from "vitest";

import { resolveShortcutUri, shortcutOpensExternally } from "./shortcuts";

describe("shortcutOpensExternally", () => {
  it("treats solana and prefersExternalTarget as external", () => {
    expect(
      shortcutOpensExternally({
        label: "Tip",
        uri: "solana:abc",
      })
    ).toBe(true);
    expect(
      shortcutOpensExternally({
        label: "X",
        uri: "https://x.com",
        prefersExternalTarget: true,
      })
    ).toBe(true);
    expect(
      shortcutOpensExternally({
        label: "Play",
        uri: "https://madlads.com/play",
        prefersExternalTarget: false,
      })
    ).toBe(false);
  });
});

describe("resolveShortcutUri", () => {
  it("substitutes placeholders", () => {
    expect(
      resolveShortcutUri(
        "https://example.com/t/{{tokenId}}?o={{ownerAddress}}&c={{collectionId}}",
        {
          tokenId: "mint1",
          ownerAddress: "owner1",
          collectionId: "col1",
        }
      )
    ).toBe("https://example.com/t/mint1?o=owner1&c=col1");
  });

  it("replaces missing placeholders with empty string", () => {
    expect(resolveShortcutUri("https://x.com/{{tokenId}}", {})).toBe(
      "https://x.com/"
    );
  });
});
