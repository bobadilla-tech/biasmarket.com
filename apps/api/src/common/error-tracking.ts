import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import type { Event } from "@sentry/node";
import { scrubOrDrop } from "@biasmarket/utils/sentry-scrub";

// The exception filter scrubs stdout and the JSON `path`. Sentry/GlitchTip
// still copy the raw URL into request.url, the transaction name, url tags,
// and span descriptions (about 1% of requests are traced), so every event
// goes through the shared scrubber and is dropped if scrubbing fails.
function scrubEvent<T extends Event>(event: T): T | null {
  return scrubOrDrop(event, (message) => Logger.warn(message, "ErrorTracking"));
}

// Environment-gated error tracking (GlitchTip is Sentry-protocol-compatible,
// see docs/core/deploy.md / the observability plan). No-op unless a DSN is
// configured, so local dev and CI never need a GlitchTip account.
export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    Logger.log("SENTRY_DSN not set — error tracking disabled", "ErrorTracking");
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.01,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
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
