import type { MetadataRoute } from "next";

import { brand } from "@/lib/copy/phygital";

/**
 * Light defaults for install splash. `color_scheme_dark` is the emerging
 * manifest override (viewport themeColor media queries cover in-browser chrome).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.company,
    short_name: brand.company,
    description: brand.description,
    start_url: "/",
    display: "standalone",
    background_color: brand.chromeLight,
    theme_color: brand.chromeLight,
    icons: [
      {
        src: "/revibase-mark-teal-on-dark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/revibase-mark-maskable.png",
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
