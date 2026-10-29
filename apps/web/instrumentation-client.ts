import * as Sentry from "@sentry/react";
import { scrubBreadcrumb, scrubSentryEvent } from "@/lib/scrub-sentry";

// Client-side error tracking (GlitchTip). Runs in the browser before React
// hydrates — sets up the global window error / unhandledrejection handlers so
// client crashes are reported, and gives error boundaries a configured SDK to
// forward to. Env-gated on NEXT_PUBLIC_SENTRY_DSN (NEXT_PUBLIC_ prefix so it
// gets inlined into the client bundle at build time).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.01,
    // The bundled web-vitals collector inside browserTracingIntegration can
    // throw "Cannot read properties of undefined (reading 'startTime')" from
    // its reportAllChanges path on App Router client navigations (empty/stale
    // LCP PerformanceObserver records). It's upstream noise, not an app fault —
    // drop it so it doesn't flood error tracking.
    ignoreErrors: [/reading 'startTime'/, /reportAllChanges/],
    // The private order link (`/pedido/:token`, `/public/orders/:token`) must
    // never reach the tracker through a URL, breadcrumb or transaction name.
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendTransaction: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}
