import { ImageResponse } from "next/og";

import { brand } from "@/lib/copy/phygital";

/** Shared “R” mark for `/icon` and `/apple-icon`. */
export function brandMarkResponse(size: {
  width: number;
  height: number;
  fontSize: number;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.chromeDark,
          color: brand.chromeLight,
          fontSize: size.fontSize,
          fontWeight: 600,
          letterSpacing: "-0.06em",
        }}
      >
        R
      </div>
    ),
    { width: size.width, height: size.height },
  );
}
