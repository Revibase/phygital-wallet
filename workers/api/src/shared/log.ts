/**
 * Structured Workers Logs helper.
 * Prefer JSON objects so Workers Logs indexes fields for filtering.
 * Gate verbosity with env.LOG_LEVEL (debug | info | warn | error). Default: info.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACT_KEYS = new Set([
  "assertion",
  "credential",
  "publickey",
  "public_key",
  "seed",
  "secret",
  "authorization",
  "cookie",
  "password",
  "verifier_secret_keys",
]);

export type LogFields = Record<string, unknown>;

export type Logger = {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  child: (fields: LogFields) => Logger;
};

function parseLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? "info").trim().toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase();
  if (REDACT_KEYS.has(k)) return true;
  return (
    k.includes("secret") ||
    k.includes("assertion") ||
    k.endsWith("seed") ||
    k.includes("private")
  );
}

/** Drop/redact sensitive nested fields; keep codes, ids, lengths. */
export function sanitizeFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (shouldRedact(key)) {
      out[key] = value == null ? value : "[redacted]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeFields(value as LogFields);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function summarizeResult(result: unknown): LogFields {
  if (result == null || typeof result !== "object") {
    return { resultType: typeof result };
  }
  const r = result as Record<string, unknown>;
  const summary: LogFields = {};
  if ("ok" in r) summary.ok = r.ok;
  if (typeof r.code === "string") summary.code = r.code;
  if (typeof r.status === "number") summary.status = r.status;
  if (typeof r.applied === "number") summary.applied = r.applied;
  if (typeof r.intentHash === "string") summary.intentHash = r.intentHash;
  if (Array.isArray(r.signatures)) summary.signatures = r.signatures.length;
  if (r.body && typeof r.body === "object") {
    const body = r.body as Record<string, unknown>;
    if (typeof body.code === "string") summary.code = body.code;
    if (typeof body.error === "string") summary.error = body.error;
  }
  if (typeof r.error === "string") summary.error = r.error;
  return summary;
}

export function createLogger(
  service: string,
  env?: { LOG_LEVEL?: string },
  baseFields?: LogFields,
): Logger {
  const min = RANK[parseLevel(env?.LOG_LEVEL)];

  function emit(level: LogLevel, msg: string, fields?: LogFields): void {
    if (RANK[level] < min) return;
    const payload = {
      level,
      service,
      msg,
      ...sanitizeFields(baseFields),
      ...sanitizeFields(fields),
    };
    if (level === "error") console.error(payload);
    else if (level === "warn") console.warn(payload);
    else console.log(payload);
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (fields) =>
      createLogger(service, env, { ...baseFields, ...fields }),
  };
}

/** Time an async RPC/handler and emit start/end/error debug lines. */
export async function withLoggedRpc<T>(
  log: Logger,
  method: string,
  fields: LogFields,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  log.debug("rpc.start", { method, ...fields });
  try {
    const result = await fn();
    log.debug("rpc.end", {
      method,
      ms: Date.now() - started,
      ...summarizeResult(result),
    });
    return result;
  } catch (err) {
    log.error("rpc.error", {
      method,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      code:
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined,
    });
    throw err;
  }
}
