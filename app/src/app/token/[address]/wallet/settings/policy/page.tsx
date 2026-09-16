import { WalletPolicyPageClient } from "@/components/wallet/wallet-leaf-pages";

/**
 * Spend-policy panel. Publicly viewable behind the browse-unlock cookie (the
 * wallet route floor); the editor within only appears for the on-chain owner.
 */
export default function WalletPolicyPage() {
  return <WalletPolicyPageClient />;
}
