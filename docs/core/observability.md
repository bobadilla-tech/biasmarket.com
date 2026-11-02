# Observability

How to find out what the system is doing and why it broke: where logs, errors
and performance data live, how to read them, and how to debug with them. Read
this when something is slow or failing in production, before adding logging, and
when you want to understand how the pieces fit together.

Runbooks for specific alerts are in
[incident-response.md](incident-response.md); the always-on services and their
raw container logs are in [operations.md](operations.md). This doc is the guide
that connects them.

## The four signals

Observability is being able to answer "what is the system doing, and why?" from
the outside. Four kinds of data answer four different questions:

| Signal     | Question it answers                 | Example                                                       | Where it lives            |
| ---------- | ----------------------------------- | ------------------------------------------------------------- | ------------------------- |
| **Errors** | What broke, and where in the code?  | `TypeError` with a stack trace and the request that caused it | GlitchTip, Issues         |
| **Traces** | Where did the time go in a request? | `POST /checkout` took 420 ms, 300 ms of it in one query       | GlitchTip, Performance    |
| **Logs**   | What happened, in what order?       | `Job failed for good` with `queue=orders jobId=42`            | GlitchTip, Logs; `docker` |
| **Uptime** | Is it reachable right now?          | `/api/health` stopped answering                               | Uptime Kuma               |

They are most useful together. An error tells you _that_ something failed, the
log lines around it tell you _what led up to it_, and the trace tells you _how
long each step took_. The pieces are linked by identifiers (a request id and a
trace id, see [Following one request](#following-one-request)).

## How the pieces fit

```text
 browser ──errors──────────────────────────────┐
                                               ▼
 web (Next.js server) ──errors, traces──►  GlitchTip  ◄── issues.bobadilla.tech
                                               ▲
 api (NestJS) ──errors, traces, logs───────────┤   (separate server, not on the app VPS)
                                               │
 workers (BullMQ) ──errors, logs───────────────┘

 api / web / workers ──stdout──► Docker json-file logs (on the app VPS, short-lived)

 Uptime Kuma (on the app VPS) ──polls /health──► Slack/Discord alert
```

- **GlitchTip** is a self-hosted, Sentry-compatible tracker (version 6.x). Every
  app talks to it with the standard Sentry SDK (`@sentry/node`,
  `@sentry/react`), so there is no custom agent. It lives at
  `https://issues.bobadilla.tech`, on a different server from the app VPS.
- Organization **`agency`** holds two projects for this repo:

  | Project                 | Slug                     | Receives                                                |
  | ----------------------- | ------------------------ | ------------------------------------------------------- |
  | BiasMarket Nest.js API  | `biasmarket-nestjs-api`  | the `api`, and the `workers` (tagged `service:workers`) |
  | Bias Market Next.js App | `bias-market-nextjs-app` | the web server, and the browser                         |

- **Docker logs** are the raw stdout of each container. They are the fastest way
  to look at the last few minutes, but they are capped (5 files of 10 MB per
  container) and deleted with the container on every blue/green deploy, so they
  are not a history.
- **Uptime Kuma** answers "is it up?" and nothing else; see
  [operations.md](operations.md#uptime-kuma).

## Getting at logs

### Last few minutes: the VPS

On the VPS, as the `deploy` user, from `/home/deploy/biasmarket`. Find the live
color first (see [deploy.md](deploy.md)):

```bash
cd /home/deploy/biasmarket
COLOR="$(cat state/current_color)"
dc() { IMAGE_TAG="$(cat state/current_sha)" docker compose --env-file env/shared.env "$@"; }

dc logs --tail 100 "api-$COLOR"            # last 100 lines
dc logs -f "api-$COLOR"                    # follow live
dc logs --since 30m --no-log-prefix "api-$COLOR" | jq -R 'fromjson? // .'   # pretty-print
```

The `api` and `workers` write **one JSON object per line**, so `jq` is the
natural tool (it is installed on the VPS). Use `-R` with `fromjson?` as below:
plain `jq` aborts on the first line that is not JSON (a crash before the logger
starts, output from a library), while this form skips it.

```bash
# every server error in the last hour
dc logs --since 1h --no-log-prefix "api-$COLOR" | jq -cR 'fromjson? | select(.statusCode >= 500)'

# everything one store did
dc logs --since 1h --no-log-prefix "api-$COLOR" | jq -cR 'fromjson? | select(.storeId == "<storeId>")'

# one request, by the id from the x-request-id response header
dc logs --since 1h --no-log-prefix "api-$COLOR" | jq -cR 'fromjson? | select(.requestId == "<id>")'

# failed jobs
dc logs --since 24h --no-log-prefix "workers-$COLOR" | jq -cR 'fromjson? | select(.level >= 40 and .queue != null)'
```

### History: GlitchTip

Logs at `info` and above are also sent to GlitchTip, so they outlive a deploy
and are searchable next to errors and traces. In the web UI open the
organization, then **Logs**, and filter by:

- **level** (`info`, `warn`, `error`),
- **service** (`api` or `workers`),
- **environment** (`production`),
- **text** in the message, and
- **trace id**, to see every line of one request.

Fields such as `storeId`, `statusCode`, `path`, `queue` and `jobId` are stored
as attributes and show on each line.

**How long they stay** is configured on the GlitchTip server, not in this repo.
The documented defaults are 7 days "hot" (fast, in Postgres) and 90 days in
total (`GLITCHTIP_LOG_HOT_DAYS`, `GLITCHTIP_LOG_RETENTION_DAYS`). Confirm the
values on the server before relying on a specific window.

### From a Claude Code session

If your Claude Code has the GlitchTip MCP server configured, an assistant can
query the same data for you: `list_issues`, `get_event`, `list_logs`,
`list_transaction_groups`, `list_transaction_spans` and `detect_n_plus_one` map
to the UI screens above. Ask it to search by level, service, text or trace id,
and to open the full event for an issue.

## Anatomy of a log line

A request to the `api` produces one line when it finishes:

```json
{
  "level": 40,
  "time": 1793399125082,
  "service": "api",
  "method": "GET",
  "path": "/api/public/orders/:token",
  "requestId": "74202086-3437-4bca-9666-ffe4e8d7d056",
  "statusCode": 404,
  "responseTime": 1,
  "msg": "request completed"
}
```

| Field                   | Meaning                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `level`                 | 30 info, 40 warn, 50 error (pino numbers). 4xx is warn, 5xx is error.          |
| `service`               | `api` or `workers`.                                                            |
| `path`                  | The path only. The query string is never logged and order tokens are `:token`. |
| `requestId`             | A correlation id, also returned to the caller as the `x-request-id` header.    |
| `storeId` / `storeSlug` | The store the route touched, when it has one.                                  |
| `responseTime`          | Milliseconds.                                                                  |
| `context`               | On Nest `Logger` lines, the class that logged (`ExpireOrdersProcessor`).       |

Health probes are not logged. Config is in
`apps/api/src/common/logging/logger.config.ts`.

**Levels:** `error` means a person should look at it; `warn` means something
went wrong but was handled (a retry, a 4xx); `info` records normal business
events; `debug` is off in production. Set `LOG_LEVEL` to change what is written
to stdout; only `info` and above are sent to GlitchTip regardless.

Worker lines add `queue`, `job`, `jobId`, `attemptsMade` and `attempts`, and a
final failure carries the error under `err` (`type`, `message`, `stack`).

## Following one request

A single request leaves several traces, joined by two ids:

- **`requestId`** is on every stdout line of the request and in the
  `x-request-id` response header. When a user reports a failure, ask for that
  header from the browser's network tab (or take it from a screenshot of the
  failing request) and grep the logs for it. A well-formed id sent by the caller
  is reused, otherwise one is generated.
- **trace id** links the same request across **errors, traces and logs in
  GlitchTip**, and across services when the web server calls the api (the api
  honours the sampling decision when the caller sends one). It appears on the
  error event, the transaction, and each forwarded log line; it is not in the
  raw stdout.

So: from an error event, copy its trace id and open **Logs** filtered by it.
From a log line on the VPS, use the `requestId`.

## Debugging playbooks

### "A user reports something broke"

1. Get the time, the store, and if possible the `x-request-id`.
2. **GlitchTip, Issues:** the right project, `is:unresolved`, sorted by last
   seen. Open the event: the stack trace shows where, the **request** panel
   shows the (scrubbed) URL and method, and the **breadcrumbs** show what
   happened just before.
3. **Logs** around that time, filtered by `service:api`, level `warn` and above,
   and the store id. Follow the request id or trace id to the full sequence.
4. If there is no issue but the user saw a failure, it was probably a handled
   4xx. Look for `warn` lines with that path and status.
5. Fix, then resolve the issue in GlitchTip so a recurrence reopens it.

### "It's slow"

1. **GlitchTip, Performance:** transactions sorted by average or p95 duration.
   The **money paths are sampled at 100%**, so checkout and order routes have
   real numbers; other routes are sampled at 10% (see
   [Sampling](#sampling-and-cost)), so wait for a few dozen samples before
   trusting a percentile.
2. Open a slow transaction group and its **spans**: time per database query,
   HTTP call and Redis call. One span that dominates is the bottleneck.
3. Many near-identical short spans in one request is the **N+1 query** pattern
   (one query per row instead of one for all rows). Fix with an include or a
   batched query.
4. Compare to the same route before the change; the trend per transaction group
   shows whether a deploy made it worse.

### "A job didn't run" (workers)

1. **GlitchTip, Logs:** `service:workers`, level `warn` and above. A retry shows
   as `warn` ("will retry"); a job that gave up shows as `error` ("failed for
   good") **and** as one issue tagged with its `queue` and `job`.
2. On the VPS, the same lines from `workers-$COLOR` (see above).
3. To see what BullMQ itself recorded, read the failed set in Redis. This is
   read-only:

   ```bash
   dc exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ZCARD bull:orders:failed'
   ```

   Replace `orders` with `mailer`, `premium` or `ping`. A job's failure reason
   is in its hash (`HGET bull:<queue>:<jobId> failedReason`). Do not print the
   `data` field: it can contain buyer details.

4. Cron-style jobs (`expire-orders` every 5 minutes, `expire-premium` every 30)
   log a "Registered ... job scheduler" line at boot; if it is missing the
   scheduler never started.

### "Nothing shows up in GlitchTip"

Telemetry can fail silently, which is the worst kind of failure: you assume no
errors means no problems. In October 2026 a bug in the event scrubber dropped
every real API error for roughly two days and the only trace was a pile of
crashes inside the scrubber itself. Work down this list:

1. **Is the DSN set in the running container?**
   `docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' <container> | grep SENTRY_DSN | sed -E 's#//[^@]*@#//***@#'`
   (the sed hides the key). No DSN means tracking is off by design.
2. **Look for the scrubber's own warning** in the container logs:
   `Dropped a telemetry event, scrubbing failed`. It means events are being
   dropped on purpose (fail-closed) because the scrubber threw.
3. **Is the issue just not an error?** A handled 4xx never creates an issue; it
   is a `warn` log.
4. **Sampling:** a missing _transaction_ is normal outside the always-sampled
   paths. Errors are never sampled.
5. **Is GlitchTip itself up?** Open `https://issues.bobadilla.tech`. It has its
   own server, so an app outage and a tracker outage are independent.
6. Send a test: log a clearly labeled message and look for it in **Logs**.

## Sampling and cost

Every kept trace costs storage and CPU in GlitchTip, so traces are sampled by
route instead of at a flat rate. The rules live in one function,
`packages/utils/src/traces-sampler/index.ts`, used by the api, the workers and
the web server:

| Requests                                                                  | Rate |
| ------------------------------------------------------------------------- | ---- |
| Health probes, static assets, `favicon`, `robots.txt`, sitemap            | 0%   |
| Checkout, public orders, `/pedido`, payments, `/internal/*`, store orders | 100% |
| `/_next/image`                                                            | 2%   |
| Everything else                                                           | 10%  |

If a request arrives with a sampling decision from another service, that
decision is followed so a trace is never half-recorded. **Errors and logs are
not sampled.** The browser reports errors only (browser tracing is not enabled).

To change a rate, edit the sampler and its tests; to reduce storage, lower
`DEFAULT_TRACE_RATE` before dropping retention.

## What must never be logged

An assisted-order link carries a secret token in its path
(`/public/orders/:token`, `/store/<slug>/pedido/:token`). Anyone who gets the
link can see the order, so it must not reach a log line, an error event or a
trace. Several layers enforce this and **they do not share one list**:

- **Request logs:** only the path is logged (no query string) and the token is
  replaced by `:token` (`loggedPath`). pino's default request dump, which
  includes every header, is disabled.
- **Events and forwarded logs:** every event goes through the shared scrubber,
  `packages/utils/src/sentry-scrub/index.ts`. If scrubbing fails the event is
  **dropped**, not sent.
- **Caddy access logs:** redacted in the Caddyfile
  ([caddy.md](caddy.md#access-logs-and-token-redaction)).

Also keep out of log messages and attributes: passwords and tokens, cookies and
`Authorization` headers, full query strings, payment-proof image URLs, and buyer
contact details beyond what you need to debug. Prefer ids (`orderId`, `storeId`)
over personal data.

If you add a route that carries a secret in its path or query, update each layer
above and add a test next to the code. The full list of redaction layers is in
[incident-response.md](incident-response.md#error-tracking-and-redaction).

## Adding instrumentation

**Log with Nest's `Logger`.** It already goes through pino in the api and
workers, so there is nothing to configure:

```ts
private readonly logger = new Logger(PaymentsService.name);

// structured fields: each one becomes a searchable attribute
this.logger.log({ msg: "Payment proof submitted", orderId, storeId });

// an error: pass it as `err`, not as a second string argument
this.logger.error({ msg: "Could not store proof", err: error, orderId });
```

Rules of thumb: a stable message and the details as fields (so you can count and
filter), one line per event rather than per step, and the right level.

**New route:** nothing to do for the request log. If the path carries a secret,
see the previous section.

**New background job:** extend `ObservedProcessor`
(`apps/workers/src/common/observed-processor.ts`) instead of `WorkerHost`. It
gives the processor the retry and final-failure logging and the GlitchTip
report. A processor that extends `WorkerHost` directly fails silently.

**Reporting an error by hand:** unhandled exceptions are already reported by the
exception filter. To report a handled error you still want to see, call
`captureException` from `apps/api/src/common/error-tracking.ts`.

## Configuration reference

| Variable                 | Where        | Effect                                                                   |
| ------------------------ | ------------ | ------------------------------------------------------------------------ |
| `SENTRY_DSN`             | api, workers | Turns on error tracking, traces and log forwarding. Unset = off.         |
| `WEB_SENTRY_DSN`         | web server   | The web server's project. Unset = off.                                   |
| `NEXT_PUBLIC_SENTRY_DSN` | web browser  | Browser errors. A build argument, inlined into the client bundle.        |
| `LOG_LEVEL`              | api, workers | Minimum level written to stdout (default `info`). Empty counts as unset. |

All of them live in `infra/vps/env/shared.env`; locally they are optional, so
development and CI never need a GlitchTip account. The `workers` container reads
the same `SENTRY_DSN` as the api.

## Glossary

- **Structured log:** a log line that is data (JSON fields) instead of a
  sentence, so a machine can filter and count it.
- **Trace / span:** a trace is the full journey of one request; a span is one
  timed step inside it (a query, an HTTP call).
- **Sampling:** keeping only a fraction of traces to limit cost.
- **Correlation id:** an id carried through every record of one request so they
  can be joined (`requestId`, trace id).
- **p95:** the duration 95% of requests beat; it exposes slow outliers that an
  average hides.
- **N+1 query:** one query to load a list, then one more per item, instead of
  one query for all.
- **Hot / cold retention:** recent data kept fast and queryable (hot), older
  data kept cheaply and slower or archived (cold).
- **Fail closed:** when a safety step breaks, drop the data instead of sending
  it unprotected. The scrubber does this.

## Known gaps

- The **web server and browser** do not emit structured logs; they report errors
  and traces only.
- GlitchTip has **no alert rules** yet, and there is no uptime check that
  survives the VPS going down
  ([#535](https://github.com/bobadilla-tech/biasmarket.com/issues/535)).
- Some GlitchTip issues are **noise** (an exploit scanner, aborted prefetches, a
  crawler) and are being filtered
  ([#533](https://github.com/bobadilla-tech/biasmarket.com/issues/533),
  [#534](https://github.com/bobadilla-tech/biasmarket.com/issues/534)).
- The cause of the intermittent **Redis connection failures** is still being
  diagnosed
  ([#536](https://github.com/bobadilla-tech/biasmarket.com/issues/536)).
- Logs buffered in the last moments before a container stops may not reach
  GlitchTip.

## Related

- [operations.md](operations.md): the shared services and their raw logs.
- [incident-response.md](incident-response.md): what to do when a monitor fires,
  and the redaction layers.
- [deploy.md](deploy.md): blue/green colors and the `state/` directory.
- [caddy.md](caddy.md): the proxy's access logs.
