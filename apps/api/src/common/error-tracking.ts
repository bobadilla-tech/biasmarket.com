import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import type { Event } from "@sentry/node";
import { scrubOrDrop } from "@biasmarket/utils/sentry-scrub";
import { isFrameworkLog } from "@biasmarket/utils/log-forwarding";
import { tracesSampler } from "@biasmarket/utils/traces-sampler";

// The exception filter scrubs stdout and the JSON `path`. Sentry/GlitchTip
// still copy the raw URL into request.url, the transaction name, url tags,
// and span descriptions (about 1% of requests are traced), so every event
// goes through the shared scrubber and is dropped if scrubbing fails.
function scrubEvent<T extends Event>(event: T): T | null {
  return scrubOrDrop(event, (message) => Logger.warn(message, "ErrorTracking"));
}

// Logs are forwarded to GlitchTip too (see logger.config.ts). A scrub failure
// must not warn through the logger: that warning would itself be forwarded and
// fail again, in a loop. Dropping the line silently is the safe default.
function scrubLog<T extends object>(log: T): T | null {
  if (isFrameworkLog(log)) return null;
  return scrubOrDrop(log, () => undefined);
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
    // Per-route rates (never health, always money paths, 10% otherwise, parent
    // decision inherited) instead of a flat 1%, see traces-sampler.
    tracesSampler,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    // Ship the pino lines (request log, Nest Logger calls) to GlitchTip so they
    // survive container recreation and are searchable next to errors and
    // traces. info and above only: debug/trace would cost storage for little
    // signal. `error.levels: []` (also the default) keeps pino error lines from
    // becoming duplicate issues, the exception filter already reports those.
    enableLogs: true,
    integrations: [
      Sentry.pinoIntegration({
        log: { levels: ["info", "warn", "error", "fatal"] },
        error: { levels: [] },
      }),
    ],
    beforeSendLog: scrubLog,
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
