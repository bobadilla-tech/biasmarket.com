import * as Sentry from "@sentry/react";

// Client-side error tracking (GlitchTip). Runs in the browser before React
// hydrates — sets up the global window error / unhandledrejection handlers so
// client crashes are reported, and gives error boundaries a configured SDK to
// forward to. Env-gated on NEXT_PUBLIC_SENTRY_DSN (NEXT_PUBLIC_ prefix so it
// gets inlined into the client bundle at build time).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.01,
  });
}
