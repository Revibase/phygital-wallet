import { brandMarkResponse } from "./brand-mark-response";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return brandMarkResponse({ ...size, fontSize: 220 });
}
