import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";

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
