import type { Params } from "nestjs-pino";
import type { DestinationStream } from "pino";

// Structured logs for the workers process. It has no public HTTP surface (only
// the Docker healthcheck), so request logging is off and what matters is
// Nest's `Logger` calls from processors and schedulers. They come out as JSON
// on stdout and, with SENTRY_DSN set, are forwarded to GlitchTip, see
// ../error-tracking.ts. Same shape as apps/api/src/common/logging.
//
// `destination` is only for tests, to read the lines back.
export function buildLoggerParams(destination?: DestinationStream): Params {
  const options = {
    // `||`, not `??`: an unset var in an env file arrives as "".
    level: process.env.LOG_LEVEL || "info",
    base: { service: "workers" },
    autoLogging: false,
    // Defense in depth for anything logged by hand with these keys.
    redact: {
      paths: [
        "*.password",
        "*.token",
        "*.authorization",
        "*.cookie",
        "*.secret",
      ],
      censor: "[Redacted]",
    },
  };
  return { pinoHttp: destination ? [options, destination] : options };
}
