/**
 * KV sliding-window counters for auth / approvals abuse.
 * Fail-open if KV is missing so local/dev without binding still works.
 */
import { getEnv } from "@/shared/request-context";

const AUTH_WINDOW_SECONDS = 60;
const AUTH_MAX_HITS = 30;

function clientKey(c: { req: { header: (n: string) => string | undefined } }): string {
  const cf = c.req.header("CF-Connecting-IP")?.trim();
  if (cf) return cf;
  const xff = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
  if (xff) return xff;
  return "unknown";
}

/** Returns a 429 Response when over limit, else null. */
export async function denyIfRateLimited(
  c: {
    req: { header: (n: string) => string | undefined };
  },
  bucket: string,
  opts?: { maxHits?: number; windowSeconds?: number },
): Promise<Response | null> {
  const kv = getEnv().revibase_auth_kv;
  if (!kv) return null;

  const windowSeconds = opts?.windowSeconds ?? AUTH_WINDOW_SECONDS;
  const maxHits = opts?.maxHits ?? AUTH_MAX_HITS;
  const id = clientKey(c);
  const key = `rl:${bucket}:${id}`;
  const raw = await kv.get(key);
  const hits = raw ? Number(raw) : 0;
  if (Number.isFinite(hits) && hits >= maxHits) {
    return new Response(
      JSON.stringify({
        error: "Too many attempts. Try again shortly.",
        code: "rate_limited",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(windowSeconds),
        },
      },
    );
  }

  const next = (Number.isFinite(hits) ? hits : 0) + 1;
  await kv.put(key, String(next), { expirationTtl: windowSeconds });
  return null;
}

/** Auth register / login / link. */
export async function denyIfAuthRateLimited(
  c: {
    req: { header: (n: string) => string | undefined };
  },
  bucket: string,
): Promise<Response | null> {
  return denyIfRateLimited(c, `auth-${bucket}`, {
    maxHits: AUTH_MAX_HITS,
    windowSeconds: AUTH_WINDOW_SECONDS,
  });
}
