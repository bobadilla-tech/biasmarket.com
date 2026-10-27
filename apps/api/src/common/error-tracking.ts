import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Event } from '@sentry/node';
import { scrubRequestUrl } from './scrub-request-url.js';

const PUBLIC_ORDER_PATH = /\/public\/orders\//i;

function scrubTrackedText(value: string): string {
  if (!PUBLIC_ORDER_PATH.test(value)) return value;
  return scrubRequestUrl(value);
}

// The exception filter scrubs stdout and the JSON `path`. Sentry/GlitchTip
// still copy the raw URL into request.url, the transaction name, url tags,
// and span descriptions (about 1% of requests are traced). Same replacement
// as the filter, including dropping the query string.
export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.request?.url) {
    const rawUrl = event.request.url;
    event.request.url = scrubTrackedText(rawUrl);
    if (PUBLIC_ORDER_PATH.test(rawUrl)) {
      delete event.request.query_string;
    }
  }
  if (typeof event.transaction === 'string') {
    event.transaction = scrubTrackedText(event.transaction);
  }
  if (event.tags) {
    for (const [key, value] of Object.entries(event.tags)) {
      if (typeof value === 'string') {
        event.tags[key] = scrubTrackedText(value);
      }
    }
  }
  for (const span of event.spans ?? []) {
    if (typeof span.description === 'string') {
      span.description = scrubTrackedText(span.description);
    }
    for (const [key, value] of Object.entries(span.data)) {
      if (typeof value === 'string') {
        span.data[key] = scrubTrackedText(value);
      }
    }
  }
  return event;
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
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
    beforeSendTransaction(event) {
      return scrubSentryEvent(event);
    },
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
