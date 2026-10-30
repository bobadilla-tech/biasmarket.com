import type { Instrumentation } from "next";

// Server-side error tracking (GlitchTip, Sentry-protocol-compatible).
// Env-gated on WEB_SENTRY_DSN so local dev/CI never needs a GlitchTip
// account. Distinct from the API's SENTRY_DSN (they report to different
// GlitchTip projects) and from NEXT_PUBLIC_SENTRY_DSN (client bundle).
//
// The @sentry/node import is type-only here and loaded dynamically inside
// the handlers below: instrumentation.ts is evaluated in both the Node and
// Edge runtimes, and the Node Sentry SDK must only ever execute in Node.
export async function register() {
  // Runs in both the Node and Edge runtimes (there's a middleware/proxy.ts);
  // the Node Sentry SDK must only ever execute in the Node runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const dsn = process.env.WEB_SENTRY_DSN;
  if (!dsn) {
    console.log(
      "[sentry] WEB_SENTRY_DSN not set — server error tracking disabled",
    );
    return;
  }

  const Sentry = await import("@sentry/node");
  const { scrubOrDrop } = await import("@biasmarket/utils/sentry-scrub");
  const warn = (message: string) => console.warn("[sentry]", message);
  Sentry.init({
    dsn,
    tracesSampleRate: 0.01,
    // The private order link (`/pedido/:token`) must not reach the tracker
    // through a request path, span or exception message either.
    beforeSend: (event) => scrubOrDrop(event, warn),
    beforeSendTransaction: (event) => scrubOrDrop(event, warn),
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
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.WEB_SENTRY_DSN) return;

  const Sentry = await import("@sentry/node");
  const { scrubTokenUrl } = await import("@biasmarket/utils/sentry-scrub");
  // Only the HTTP method, the pathname without its query string, and the
  // route context are reported — never headers, cookies, authorization
  // credentials, or query-string data.
  Sentry.captureException(error, {
    extra: {
      request: {
        method: request.method,
        pathname: scrubTokenUrl(request.path.split("?")[0]!),
        routePath: context.routePath,
      },
    },
  });
};
