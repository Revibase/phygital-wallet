import type { MetadataRoute } from "next";

import { brand } from "@/lib/copy/phygital";

/** Light install splash; in-browser chrome uses root viewport themeColor. */
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
        src: "/revibase-mark-pearl-on-teal.png",
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
  };
}
