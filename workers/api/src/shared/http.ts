/** Default Cache-Control for API responses consumed by React Query. */
const QUERY_NO_STORE = {
  "Cache-Control": "private, no-store",
} as const;

export function json(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
): Response {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: { ...QUERY_NO_STORE, ...init?.headers },
  });
}
