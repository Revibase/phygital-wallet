import { defineConfig } from "vite";

// The signer is a trusted, minimal static origin. The production build must be
// compatible with a strict `script-src 'self'` CSP (no inline scripts, no eval).
//
// - `assetsInlineLimit: 0` prevents Vite from inlining small assets as data:
//   URIs (which would need `img-src data:` etc. and muddy the CSP).
// - `modulePreload.polyfill: false` avoids Vite injecting an inline module-preload
//   polyfill <script> into index.html.
// - `scripts/assert-no-inline.mjs` (run in the build script) fails the build if
//   any inline <script> or on* handler survives, so a CSP regression can't ship.
export default defineConfig({
  root: ".",
  // phygital-wallet-sdk (Codama-generated) reads `process.env["NODE_ENV"]` at
  // module load. Vite's built-in define only substitutes the dot form, so we
  // replace `process.env` wholesale to keep the browser bundle from throwing
  // `process is not defined`. No real env is exposed — it is a constant object.
  define: { "process.env": JSON.stringify({ NODE_ENV: "production" }) },
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Content-hashed, self-hosted assets.
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
