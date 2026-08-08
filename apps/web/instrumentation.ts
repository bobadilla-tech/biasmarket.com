import * as Sentry from "@sentry/node";
import type { Instrumentation } from "next";

// Server-side error tracking (GlitchTip, Sentry-protocol-compatible).
// Env-gated on SENTRY_DSN so local dev/CI never needs a GlitchTip account.
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set — server error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.01,
  });
}

// Captures errors Next surfaces during Server Component rendering, route
// handlers, server actions, and the proxy. Server-rendered page errors are
// the highest-value signal on the storefront — a render bug there blanks the
// whole page, and nothing else reports it (see onRequestError in the Next
// instrumentation docs).
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
) => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.captureException(error, {
    extra: { request },
  });
};
