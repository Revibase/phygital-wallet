import { brandMarkResponse } from "./brand-mark-response";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandMarkResponse({ ...size, fontSize: 88 });
}
