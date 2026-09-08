import { apiUrl } from "@/lib/api-base";

/**
 * Browser fetch for React Query (and other app API calls).
 * HTTP cache is off — React Query owns freshness.
 * Relative API paths go to `NEXT_PUBLIC_API_BASE_URL`.
 *
 * On 401 session errors, tries one silent refresh (single-flight) then retries
 * the original request once.
 */

let refreshInFlight: Promise<boolean> | null = null;

/** Parse `Retry-After` (delta-seconds or HTTP-date) to a capped delay. */
export function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("Retry-After")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.floor(seconds * 1000));
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    return Math.min(60_000, Math.max(0, when - Date.now()));
  }
  return null;
}

function isRefreshUrl(url: string): boolean {
  try {
    const path = new URL(url, "http://local").pathname;
    return (
      path === "/auth/device-session/refresh" ||
      path.endsWith("/auth/device-session/refresh")
    );
  } catch {
    return url.includes("/auth/device-session/refresh");
  }
}

async function tryRefreshDeviceSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(apiUrl("/auth/device-session/refresh"), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function shouldAttemptRefresh(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = (await res.clone().json()) as { code?: string };
    return (
      body.code === "device_session_required" ||
      body.code === "session_required"
    );
  } catch {
    return false;
  }
}

export function queryFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const resolved =
    typeof input === "string"
      ? apiUrl(input)
      : input instanceof URL
        ? apiUrl(input.toString())
        : input;

  const url =
    typeof resolved === "string"
      ? resolved
      : resolved instanceof URL
        ? resolved.toString()
        : resolved.url;

  const run = () =>
    fetch(resolved, {
      credentials: "include",
      ...init,
      cache: "no-store",
    });

  // Never nest refresh attempts on the refresh call itself.
  if (isRefreshUrl(url)) return run();

  return (async () => {
    const first = await run();
    if (!(await shouldAttemptRefresh(first))) return first;
    const refreshed = await tryRefreshDeviceSession();
    if (!refreshed) return first;
    return run();
  })();
}

/** HTTP failure from `readJson` / API clients — carries status for retry policy. */
export class QueryHttpError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** Parsed from `Retry-After` (seconds or HTTP-date) when present. */
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    status: number,
    code?: string | null,
    retryAfterMs?: number | null,
  ) {
    super(message);
    this.name = "QueryHttpError";
    this.status = status;
    this.code = code ?? null;
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

export function getQueryErrorStatus(error: unknown): number | undefined {
  if (error instanceof QueryHttpError) return error.status;
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/**
 * Retry only transient HTTP / network failures.
 * 4xx (except 408 / 425 / 429) and client validation errors do not retry.
 */
export function isRetryableQueryError(error: unknown): boolean {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return false;
  }

  const status = getQueryErrorStatus(error);
  if (status != null) {
    if (status === 408 || status === 425 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }

  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("load failed")
  );
}

/** React Query `retry` callback — up to 3 attempts on retryable errors only. */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 3) return false;
  return isRetryableQueryError(error);
}

/** Parse JSON and throw `QueryHttpError` when the response is not OK. */
export async function readJson<T>(
  res: Response,
  fallback: string,
): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    throw new QueryHttpError(
      body.error ?? fallback,
      res.status,
      body.code ?? null,
      parseRetryAfterMs(res),
    );
  }
  return body;
}
