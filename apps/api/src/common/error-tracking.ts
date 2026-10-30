import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Event } from '@sentry/node';
import { scrubRequestUrl } from './scrub-request-url.js';

const PUBLIC_ORDER_PATH = /\/public\/orders\//i;
const ASSISTED_ORDER_PATH = /\/pedido\//i;

function scrubTrackedUrl(value: string): string {
  let scrubbed = value;
  if (PUBLIC_ORDER_PATH.test(scrubbed)) {
    scrubbed = scrubRequestUrl(scrubbed);
  }
  if (ASSISTED_ORDER_PATH.test(scrubbed)) {
    scrubbed = scrubbed
      .split(/[?#]/)[0]!
      .replace(/(\/pedido\/)[^/]+/gi, '$1:token');
  }
  return scrubbed;
}

function scrubTrackedText(value: string): string {
  return value
    .replace(/(\/public\/orders\/)[^/\s?#"'<>),;]+/gi, '$1:token')
    .replace(/(\/pedido\/)[^/\s?#"'<>),;]+/gi, '$1:token');
}

// Sentry attaches live Scope/Client objects here (getter-only properties, big
// graphs) and strips the key before the event is sent, so there is nothing to
// scrub and walking it only risks throwing.
const SDK_INTERNAL_KEYS = new Set(['sdkProcessingMetadata']);

function scrubDeep(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  key?: string,
): unknown {
  if (depth > 10) return '[Truncated]';
  if (typeof value === 'string') {
    return key && /(?:url|uri|target|path|referer)/i.test(key)
      ? scrubTrackedUrl(value)
      : scrubTrackedText(value);
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const next = scrubDeep(item, depth + 1, seen);
      if (next !== item) value[index] = next;
    });
    return value;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SDK_INTERNAL_KEYS.has(key)) continue;
    const current = record[key];
    const next = scrubDeep(current, depth + 1, seen, key);
    // Only write back a changed value: re-assigning an untouched property
    // throws on getter-only ones, which dropped every traced event.
    if (next !== current) record[key] = next;
  }
  return value;
}

// The exception filter scrubs stdout and the JSON `path`. Sentry/GlitchTip
// still copy the raw URL into request.url, the transaction name, url tags,
// and span descriptions (about 1% of requests are traced). Same replacement
// as the filter, including dropping the query string.
export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.request?.url) {
    const rawUrl = event.request.url;
    event.request.url = scrubTrackedUrl(rawUrl);
    if (PUBLIC_ORDER_PATH.test(rawUrl)) {
      delete event.request.query_string;
    }
  }
  if (typeof event.transaction === 'string') {
    event.transaction = scrubTrackedUrl(event.transaction);
  }
  if (event.tags) {
    for (const [key, value] of Object.entries(event.tags)) {
      if (typeof value === 'string') {
        event.tags[key] = /(?:url|uri|target|path)/i.test(key)
          ? scrubTrackedUrl(value)
          : scrubTrackedText(value);
      }
    }
  }
  const traceData = event.contexts?.trace?.data;
  if (traceData) {
    if (
      Object.values(traceData).some(
        (value) => typeof value === 'string' && PUBLIC_ORDER_PATH.test(value),
      )
    ) {
      delete traceData['url.query'];
      delete traceData['http.query'];
    }
    for (const [key, value] of Object.entries(traceData)) {
      if (typeof value === 'string') {
        traceData[key] = /(?:url|uri|target|path)/i.test(key)
          ? scrubTrackedUrl(value)
          : scrubTrackedText(value);
      }
    }
  }
  for (const span of event.spans ?? []) {
    if (typeof span.description === 'string') {
      span.description = scrubTrackedUrl(span.description);
    }
    for (const [key, value] of Object.entries(span.data)) {
      if (typeof value === 'string') {
        span.data[key] = /(?:url|uri|target|path)/i.test(key)
          ? scrubTrackedUrl(value)
          : scrubTrackedText(value);
      }
    }
  }
  scrubDeep(event);
  return event;
}

// A scrubber that throws makes the SDK drop the event anyway, so fail closed
// on purpose (an unscrubbed event may carry a private order link) and say so
// instead of reporting the failure as yet another application error.
function failClosed<T extends Event>(event: T): T | null {
  try {
    return scrubSentryEvent(event);
  } catch (error) {
    Logger.warn(
      `Dropped a telemetry event, scrubbing failed: ${error instanceof Error ? error.message : String(error)}`,
      'ErrorTracking',
    );
    return null;
  }
}

// Environment-gated error tracking (GlitchTip is Sentry-protocol-compatible,
// see docs/core/deploy.md / the observability plan). No-op unless a DSN is
// configured, so local dev and CI never need a GlitchTip account.
export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    Logger.log('SENTRY_DSN not set — error tracking disabled', 'ErrorTracking');
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.01,
    beforeSend: failClosed,
    beforeSendTransaction: failClosed,
  });
}

// Forwards an unhandled exception to the tracker when it was initialized.
// The getClient() guard keeps the caller safe to run in unit tests and in
// environments that haven't opted into error tracking.
export function captureException(error: unknown): void {
  if (Sentry.getClient()) {
    Sentry.captureException(error);
  }
}
