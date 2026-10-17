// Shared by apps/api and apps/web: keeps the private order link out of
// Sentry/GlitchTip events. Structurally typed on purpose so it needs no
// Sentry dependency and runs in Node, edge and browser bundles alike.
//
// The order token lives in `/store/:slug/pedido/:token` (the page) and in
// `/public/orders/:token` (the API).
const TOKEN_PATH = /\/public\/orders\/|\/pedido\//i;

// Keys whose string values are URLs or paths: their query string and hash go
// too. Every other string only has the token segment replaced.
const URL_KEY = /url|uri|target|path|referer|transaction|description/i;

// Sentry attaches live Scope/Client objects here (getter-only properties, big
// graphs) and strips the key before the event is sent, so there is nothing to
// scrub and walking it only risks throwing.
const SDK_INTERNAL_KEYS = new Set(["sdkProcessingMetadata"]);

const MAX_DEPTH = 10;

export function scrubTokenUrl(value: string): string {
  if (!TOKEN_PATH.test(value)) return value;
  return value
    .split(/[?#]/)[0]!
    .replace(/\/public\/orders\/[^/]+/gi, "/public/orders/:token")
    .replace(/\/pedido\/[^/]+/gi, "/pedido/:token");
}

// Free text (an exception message, a header, a span attribute) can embed the
// private link anywhere, so only the token segment is replaced and the rest of
// the string is kept.
export function scrubTokenText(value: string): string {
  if (!TOKEN_PATH.test(value)) return value;
  return value.replace(
    /(\/public\/orders\/|\/pedido\/)[^/\s?#"'<>),;]+/gi,
    (_, prefix: string) => `${prefix.toLowerCase()}:token`,
  );
}

function scrubDeep(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  key?: string,
): unknown {
  if (depth > MAX_DEPTH) return "[Truncated]";
  if (typeof value === "string") {
    return key && URL_KEY.test(key)
      ? scrubTokenUrl(value)
      : scrubTokenText(value);
  }
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      const next = scrubDeep(item, depth + 1, seen);
      if (next !== item) value[i] = next;
    });
    return value;
  }

  const record = value as Record<string, unknown>;
  for (const k of Object.keys(record)) {
    if (SDK_INTERNAL_KEYS.has(k)) continue;
    const current = record[k];
    const next = scrubDeep(current, depth + 1, seen, k);
    // Only write back a changed value: re-assigning an untouched property
    // throws on getter-only ones, which dropped every traced event.
    if (next !== current) record[k] = next;
  }
  return value;
}

interface Scrubbable {
  request?: { url?: string; query_string?: unknown };
  contexts?: { trace?: { data?: Record<string, unknown> } };
}

const hasTokenPath = (value: unknown) =>
  typeof value === "string" && TOKEN_PATH.test(value);

// Scrubs an event, a breadcrumb or any other Sentry payload in place. The query
// strings that travel beside a token URL are dropped first, then the whole
// payload is walked so no field the SDK fills (request, headers, tags, spans,
// breadcrumbs, contexts, extra, exception values) is missed.
export function scrubSentryEvent<T extends object>(input: T): T {
  const { request, contexts } = input as Scrubbable;
  if (hasTokenPath(request?.url)) delete request!.query_string;
  const trace = contexts?.trace?.data;
  if (trace && Object.values(trace).some(hasTokenPath)) {
    delete trace["url.query"];
    delete trace["http.query"];
  }
  return scrubDeep(input) as T;
}

// A scrubber that throws makes the SDK drop the event anyway, so fail closed
// on purpose (an unscrubbed event may carry a private order link) and say so
// instead of reporting the failure as yet another application error.
export function scrubOrDrop<T extends object>(
  event: T,
  warn: (message: string) => void,
): T | null {
  try {
    return scrubSentryEvent(event);
  } catch (error) {
    warn(
      `Dropped a telemetry event, scrubbing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
