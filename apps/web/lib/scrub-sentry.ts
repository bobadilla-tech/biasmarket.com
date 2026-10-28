import type { Breadcrumb } from "@sentry/react";

// The fields both error and transaction events share that can carry a URL.
interface Scrubbable {
  request?: { url?: string; query_string?: unknown };
  transaction?: string;
  tags?: Record<string, unknown>;
  breadcrumbs?: Breadcrumb[];
  spans?: { description?: string }[];
}

type Json = unknown;

// The order token lives in `/store/:slug/pedido/:token` (the page) and in
// `/public/orders/:token` (the API). Neither belongs in an error-tracking
// event: a client error path would otherwise attach the private link. Same
// replacement as the API's `scrubSentryEvent`, including dropping the query
// string and hash of a matched URL.
const TOKEN_PATH = /\/public\/orders\/|\/pedido\//i;

export function scrubTokenUrl(value: string): string {
  if (!TOKEN_PATH.test(value)) return value;
  return value
    .split(/[?#]/)[0]!
    .replace(/(\/public\/orders\/)[^/]+/gi, "$1:token")
    .replace(/(\/pedido\/)[^/]+/gi, "$1:token");
}

// Free text (an exception message, a header, a span attribute) can embed the
// private link anywhere, so only the token segment is replaced and the rest of
// the string is kept.
export function scrubTokenText(value: string): string {
  if (!TOKEN_PATH.test(value)) return value;
  return value
    .replace(/(\/public\/orders\/)[^/\s?#"'<>),;]+/gi, "$1:token")
    .replace(/(\/pedido\/)[^/\s?#"'<>),;]+/gi, "$1:token");
}

// Any other field the SDK fills (request headers such as Referer, exception
// values, span data, contexts, extra) goes through the same replacement.
function scrubDeep(value: Json, depth = 0, seen = new WeakSet<object>()): Json {
  if (typeof value === "string") return scrubTokenText(value);
  if (value === null || typeof value !== "object" || depth > 10) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      value[i] = scrubDeep(item, depth + 1, seen);
    });
    return value;
  }
  const record = value as Record<string, Json>;
  for (const key of Object.keys(record)) {
    record[key] = scrubDeep(record[key], depth + 1, seen);
  }
  return value;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = scrubTokenUrl(breadcrumb.message);
  }
  if (breadcrumb.data) {
    for (const [key, value] of Object.entries(breadcrumb.data)) {
      if (typeof value === "string") {
        breadcrumb.data[key] = scrubTokenUrl(value);
      }
    }
  }
  return breadcrumb;
}

export function scrubSentryEvent<T extends object>(input: T): T {
  const event = input as Scrubbable;
  if (event.request?.url) {
    event.request.url = scrubTokenUrl(event.request.url);
    if (TOKEN_PATH.test(event.request.url)) delete event.request.query_string;
  }
  if (typeof event.transaction === "string") {
    event.transaction = scrubTokenUrl(event.transaction);
  }
  if (event.tags) {
    for (const [key, value] of Object.entries(event.tags)) {
      if (typeof value === "string") event.tags[key] = scrubTokenUrl(value);
    }
  }
  for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb);
  for (const span of event.spans ?? []) {
    if (typeof span.description === "string") {
      span.description = scrubTokenUrl(span.description);
    }
  }
  return scrubDeep(event) as T;
}
