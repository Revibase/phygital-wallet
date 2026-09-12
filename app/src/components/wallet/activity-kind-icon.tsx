import { ArrowDownLeft, ArrowUpRight, BellRing, Clock3 } from "lucide-react";

import type { WalletActivityKind } from "@/lib/wallet/portfolio-types";

/**
 * Icon for an activity kind. Renders the imported lucide components directly
 * (no dynamic component alias) so it satisfies `react-hooks/static-components`.
 */
export function KindIcon({
  kind,
  className,
}: {
  kind: WalletActivityKind;
  className?: string;
}) {
  switch (kind) {
    case "sent":
      return <ArrowUpRight className={className} aria-hidden />;
    case "received":
      return <ArrowDownLeft className={className} aria-hidden />;
    case "approved":
      return <BellRing className={className} aria-hidden />;
    default:
      return <Clock3 className={className} aria-hidden />;
  }
}
