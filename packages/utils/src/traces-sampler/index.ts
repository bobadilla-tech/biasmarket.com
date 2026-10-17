// Shared by apps/api and apps/web: decides which requests get a performance
// trace. Structurally typed on purpose (like ../sentry-scrub) so it needs no
// Sentry dependency and runs in Node, edge and browser bundles alike.
//
// Sampling is a cost/signal trade-off: every kept trace costs storage and CPU
// in GlitchTip, and a flat rate keeps as much probe noise as it keeps
// checkouts. So the rate depends on what the request is.

export interface TracesSamplingContext {
  // The span name, e.g. `GET /api/health` or `GET /es/store/[slug]`.
  name: string;
  // The incoming trace's decision, when another service (web -> api) already
  // made one.
  parentSampled?: boolean;
  // Returns the parent's decision as a rate (0 or 1), or `fallback` when the
  // request starts a new trace.
  inheritOrSampleWith: (fallback: number) => number;
}

// Probes and static assets: no signal, and Docker/Kuma call health every few
// seconds, so they would dominate the trace table.
const NEVER = /\/health\b|\/_next\/static\b|\/favicon|\/robots\.txt|\/sitemap/i;

// Money and order paths: low volume, high cost when slow or broken, so keep
// every trace. `/internal/` is the worker-to-api job endpoint.
const ALWAYS =
  /\/checkout\b|\/public\/orders\b|\/pedido\b|\/payments?\b|\/internal\/|\/stores\/[^/\s]+\/orders\b/i;

// `/_next/image` is high volume and mostly cache hits.
const IMAGES = /\/_next\/image\b/i;

export const DEFAULT_TRACE_RATE = 0.1;
const IMAGE_TRACE_RATE = 0.02;

export function tracesSampler(context: TracesSamplingContext): number {
  // Dropping a probe wins even over a parent decision: nothing downstream of
  // a health check is worth a trace.
  if (NEVER.test(context.name)) return 0;
  // Respect the parent so a web -> api trace is kept or dropped as a whole
  // instead of showing up as orphaned halves.
  if (typeof context.parentSampled === "boolean") {
    return context.inheritOrSampleWith(DEFAULT_TRACE_RATE);
  }
  if (ALWAYS.test(context.name)) return 1;
  if (IMAGES.test(context.name)) return IMAGE_TRACE_RATE;
  return DEFAULT_TRACE_RATE;
}
