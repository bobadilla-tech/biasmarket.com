# Incident response

Single-operator runbook for the Uptime Kuma monitoring setup described in
[`docs/plans/2026-08-09-uptime-kuma-monitoring-plan.md`](../plans/2026-08-09-uptime-kuma-monitoring-plan.md).
No on-call rotation or escalation policy here — this is a runbook, not a paging
schedule.

## The monitors

| Monitor        | Target                                  | Proves                              |
| -------------- | --------------------------------------- | ----------------------------------- |
| API (external) | `https://api.biasmarket.com/api/health` | DNS + TLS + Caddy + app, end to end |
| API (internal) | `http://api:3000/api/health`            | App itself, independent of edge     |
| Web (external) | `https://biasmarket.com/api/health`     | DNS + TLS + Caddy + Next.js         |
| Web (internal) | `http://web:3001/api/health`            | Next.js process itself              |
| DB             | TCP `db:5432`                           | Postgres accepting connections      |
| MinIO          | `http://minio:9000/minio/health/live`   | Object storage liveness             |

## First triage step: isolate edge vs. app

Every critical surface has an external and an internal monitor. Check both
before doing anything else:

- **External down, internal up** → Caddy/DNS/TLS problem. Check
  `docker compose -f infra/docker/docker-compose.yml logs caddy`, confirm DNS
  still resolves (`dig +short api.biasmarket.com`), check for an expired cert.
- **Both down** → the app itself. Go straight to the common fixes below.
- **DB down** → almost always cascades into both API monitors going down too;
  fix DB first.

## Common fixes

```bash
# tail logs for the failing service
docker compose -f infra/docker/docker-compose.yml logs -f <service>

# restart a single service
docker compose -f infra/docker/docker-compose.yml restart <service>
```

If `api` is unhealthy, check whether it's mid-`prisma migrate deploy` (runs on
every boot, see `deploy.md` step 6) before assuming it's crash-looping — give it
the healthcheck's `start_period` before restarting again.

## What happens automatically when a monitor fires

```
Kuma detects a state change (important=true)
  ├─→ Slack/Discord (direct, real-time page — independent of api/web)
  └─→ POST /api/monitoring/webhook (durable record)
        ├─ 401 if X-Webhook-Secret mismatch
        └─ PlatformIncident opened/closed by monitorId, queryable via
           GET /api/monitoring/incidents (admin-only)
```

If `api` itself is the thing that's down, the webhook call fails and Kuma
retries per its own policy — the Slack/Discord alert still fires because it's an
independent path. This is an accepted gap, not a bug: you're never blind, you
just might be missing one history row for that specific incident. Not solved
further (see the plan doc's "Decision" sections for why).

## Rotating `MONITORING_WEBHOOK_SECRET`

The secret lives in two places that don't sync automatically:

1. `infra/docker/.env` on the server (read by `api`).
2. Kuma's own Webhook notification-provider config (Settings → Notifications →
   the webhook provider → edit the `X-Webhook-Secret` header value), stored in
   Kuma's SQLite.

To rotate:

```bash
# on the server
cd ~/biasmarket
pnpm env:init --prod --force   # generates a fresh MONITORING_WEBHOOK_SECRET
                                # among other secrets — see deploy.md's
                                # "Reset" section for what else this rotates
docker compose -f infra/docker/docker-compose.yml restart api
```

Then manually copy the new value from `.env` into Kuma's webhook
notification-provider config. Until you do, Kuma's webhook calls 401 — the
Slack/Discord path is unaffected, so this doesn't create a blind spot, just a
gap in the durable incident history until the values match again.

## Status page

`https://status.biasmarket.com` shows only the two external monitors (API, Web)
— the user-facing surfaces. The other four (internal API/web, DB, MinIO) are
intentionally left off any public page and are only visible in Kuma's main
dashboard, used for triage.
