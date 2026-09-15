import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node crypto (globalThis.crypto.subtle + WebCrypto) is available in the
    // default node environment; no jsdom needed for the security-core tests.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
