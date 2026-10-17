import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import type { Event } from "@sentry/node";
import { isFrameworkLog } from "@biasmarket/utils/log-forwarding";
import { scrubOrDrop } from "@biasmarket/utils/sentry-scrub";
import { tracesSampler } from "@biasmarket/utils/traces-sampler";

// A job error can embed the URL it called, so events go through the shared
// scrubber and are dropped if scrubbing fails.
function scrubEvent<T extends Event>(event: T): T | null {
  return scrubOrDrop(event, (message) => Logger.warn(message, "ErrorTracking"));
}

// Logs are forwarded too. A scrub failure must not warn through the logger:
// that warning would itself be forwarded and fail again, in a loop.
function scrubLog<T extends object>(log: T): T | null {
  if (isFrameworkLog(log)) return null;
  return scrubOrDrop(log, () => undefined);
}

// Environment-gated, like the api: no-op unless a DSN is configured. The
// workers container shares `env/shared.env` with the api, so it reports to the
// same GlitchTip project under `service: workers` (set a dedicated DSN here
// later if the two should be split).
export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    Logger.log("SENTRY_DSN not set — error tracking disabled", "ErrorTracking");
    return;
  }

  Sentry.init({
    dsn,
    tracesSampler,
    initialScope: { tags: { service: "workers" } },
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    // info and above only; pino error lines must not become duplicate issues,
    // a failed job is reported explicitly by ObservedProcessor.
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

// Reports a failed job to the tracker when it was initialized. The getClient()
// guard keeps it safe in unit tests and where tracking is not enabled.
export function captureJobError(
  error: unknown,
  context: { queue: string; job: string; jobId: string | undefined },
): void {
  if (!Sentry.getClient()) return;
  Sentry.captureException(error, {
    tags: { queue: context.queue, job: context.job },
    extra: { jobId: context.jobId },
  });
}
