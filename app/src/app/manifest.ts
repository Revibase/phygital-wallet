import type { MetadataRoute } from "next";

import { brand, products } from "@/lib/copy/phygital";

/**
 * Light defaults for install splash. `color_scheme_dark` is the emerging
 * manifest override (viewport themeColor media queries cover in-browser chrome).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.company,
    short_name: brand.company,
    description: products.home.tagline,
    start_url: "/",
    display: "standalone",
    background_color: brand.chromeLight,
    theme_color: brand.chromeLight,
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    color_scheme_dark: {
      background_color: brand.chromeDark,
      theme_color: brand.chromeDark,
    },
  } as MetadataRoute.Manifest;
}
