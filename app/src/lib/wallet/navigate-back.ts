/**
 * Pop history so in-app Back matches swipe-back.
 * If there is no useful history (deep link), replace to `fallbackHref`.
 */
export function navigateBack(
  router: { back: () => void; replace: (href: string) => void },
  fallbackHref: string,
): void {
  if (typeof window !== "undefined" && window.history.length > 1) {
    router.back();
    return;
  }
  router.replace(fallbackHref);
}
