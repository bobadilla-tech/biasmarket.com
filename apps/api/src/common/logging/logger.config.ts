import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Params } from "nestjs-pino";
import type { DestinationStream } from "pino";
import type { Options } from "pino-http";
import { scrubTokenUrl } from "@biasmarket/utils/sentry-scrub";
import { scrubRequestUrl } from "../scrub-request-url.js";

// Structured request logging (pino). Every request becomes one JSON line on
// stdout: method, scrubbed path, status, duration, a request id, and the store
// it touched. Nest's own `Logger` calls (about a third of the API's modules)
// go through the same pipeline, see `app.useLogger` in main.ts.

// Nest's own boot chatter (one line per module, route and mapping, 100+ per
// container start). Useful on a local console, noise in the searchable store,
// so it is not forwarded to GlitchTip (see error-tracking.ts).
export const FRAMEWORK_LOG_CONTEXTS = new Set([
  "InstanceLoader",
  "RoutesResolver",
  "RouterExplorer",
  "NestFactory",
  "NestApplication",
]);

const REQUEST_ID = /^[\w.-]{8,64}$/;
const HEALTH_PATH = /\/health\/?$/i;

type ExpressRequest = IncomingMessage & {
  id?: string;
  originalUrl?: string;
  params?: Record<string, string | undefined>;
};

// The path only: a query string can carry an email, a reset token or a search
// term, and none of that belongs in a log. The private order link and the
// assisted-order page token are replaced the same way the error tracker does.
export function loggedPath(url: string | undefined): string {
  return scrubTokenUrl(scrubRequestUrl(url ?? ""));
}

// Reuse a sane inbound id so a request can be followed across the proxy,
// otherwise mint one. It is only a correlation label, never trusted for
// anything else, so it is length- and charset-limited.
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers["x-request-id"];
  const id =
    typeof inbound === "string" && REQUEST_ID.test(inbound)
      ? inbound
      : randomUUID();
  res.setHeader("x-request-id", id);
  return id;
}

// Docker and Uptime Kuma probe /health every few seconds. Logging each one
// would bury the real traffic and spend the log budget on nothing.
export function ignoreRequest(req: IncomingMessage): boolean {
  return HEALTH_PATH.test(
    loggedPath((req as ExpressRequest).originalUrl ?? req.url),
  );
}

export function levelFor(
  statusCode: number,
  error?: Error,
): "info" | "warn" | "error" {
  if (error || statusCode >= 500) return "error";
  if (statusCode >= 400) return "warn";
  return "info";
}

// Fields are flat on purpose: GlitchTip stores nested objects as JSON strings,
// so `req.url` could not be filtered while `path` and `statusCode` can.
//
// pino-http evaluates `customProps` twice (when the request starts and when it
// finishes) and merges both, so it must only return values that are already
// known at the start, otherwise the line carries duplicate keys. These also
// tag any log a handler writes through the request-scoped logger.
export function requestProps(req: IncomingMessage): Record<string, string> {
  const request = req as ExpressRequest;
  const props: Record<string, string> = {
    method: req.method ?? "",
    path: loggedPath(request.originalUrl ?? req.url),
  };
  if (request.id) props.requestId = request.id;
  return props;
}

// What is only known once the response is done: its status, and the store the
// route resolved (Express fills `params` after routing). Added to the
// completion line only.
export function completionProps(
  req: IncomingMessage,
  res: ServerResponse,
): Record<string, string | number> {
  const params = (req as ExpressRequest).params ?? {};
  const props: Record<string, string | number> = { statusCode: res.statusCode };
  if (params.storeId) props.storeId = params.storeId;
  if (params.slug) props.storeSlug = params.slug;
  return props;
}

// `destination` is only for tests, to read the lines back; production writes
// to stdout, which Docker collects.
export function buildLoggerParams(destination?: DestinationStream): Params {
  const options = {
    // `||`, not `??`: an unset var in an env file arrives as "".
    level: process.env.LOG_LEVEL || "info",
    // Fixed fields only. pid/hostname are dropped: the container name
    // already says where a line came from.
    base: { service: "api" },
    genReqId: requestId,
    customLogLevel: (_req, res, error) => levelFor(res.statusCode, error),
    customProps: requestProps,
    customSuccessObject: (req, res, value) => ({
      ...value,
      ...completionProps(req, res),
    }),
    customErrorObject: (req, res, _error, value) => ({
      ...value,
      ...completionProps(req, res),
    }),
    autoLogging: { ignore: ignoreRequest },
    // pino-http's default `req`/`res` dump includes every header (cookies,
    // authorization). Everything worth keeping is in customProps instead, so
    // these two keys are dropped (pino omits a key whose serializer returns
    // undefined).
    serializers: { req: () => undefined, res: () => undefined },
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
  } satisfies Options;
  return { pinoHttp: destination ? [options, destination] : options };
}
