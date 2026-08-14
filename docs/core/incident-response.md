# Incident response

Single-operator runbook for the Uptime Kuma monitoring setup described in
[`docs/plans/2026-08-09-uptime-kuma-monitoring-plan.md`](../plans/2026-08-09-uptime-kuma-monitoring-plan.md),
updated for the blue/green production stack described in
[`blue-green-migrations.md`](blue-green-migrations.md). No on-call rotation or
escalation policy here — this is a runbook, not a paging schedule.

## Blue/green rollback

If a deploy has landed (Caddy fully switched to the new color) but something
looks wrong that the deploy's own automated smoke tests didn't catch:

```bash
# on the VPS, as the deploy user, from /opt/biasmarket — or via CI's
# restricted dispatch key, see infra/vps/bin/ssh-deploy-dispatcher.sh
./deploy.sh --rollback
```

Health-checks the sidelined color **before** flipping traffic back to it —
refuses loudly instead of blindly restoring service to something that silently
degraded while benched. If it refuses, the sidelined color itself needs manual
attention (check its logs: `docker compose logs api-<color>` from
`/opt/biasmarket`) before a rollback is possible; at that point you're choosing
between fixing the sidelined color or rolling forward with another
`deploy.sh <sha>` deploy.

Rollback does **not** undo an already-applied database migration — Prisma
generates no down-migrations for `migrate deploy`. If the incident is
migration-related (the new schema broke something), the pre-migration snapshot
in `/opt/biasmarket/releases/pre-migrate-*.sql.gz` is the real recovery path,
and it's a manual, deliberate restore — not something `deploy.sh --rollback`
attempts automatically. See
[`blue-green-migrations.md`](blue-green-migrations.md#migration-discipline-expandcontract)
for why expand/contract discipline is the actual prevention here, not the
recovery mechanism.

## Stuck deploy (`migration_pending`)

A deploy that applied its migration but never finished cutting over (crashed,
hung, or lost its SSH/systemd session mid-phase) leaves
`/opt/biasmarket/state/migration_pending` in place. This is alertable: an
independent systemd timer (`biasmarket-migration-watchdog.timer`, deliberately
**not** part of `deploy.sh` itself) pings a dedicated Kuma push monitor once a
minute, but only while `migration_pending` is absent or younger than ~3 minutes
— once it's older than that, the timer withholds the ping, the push monitor
misses its heartbeat, and Kuma's own state-transition notification fires the
same real-time Slack/Discord alert the existing HTTP/TCP monitors already use.

On this alert: SSH to the VPS, check `state/deploy.lock.meta` (who/what was
running and at what phase) and `state/migration_pending`'s contents (which
SHA/color), then
`docker compose -f docker-compose.yml logs api-<candidate-color>` from
`/opt/biasmarket` to see what actually happened. Do not blindly re-run
`deploy.sh <sha>` against a stuck lock — check `state/deploy.lock.meta` first;
if the previous process is genuinely dead (not just slow), the flock releases on
its own once that process's file descriptor closes.

## The monitors

Updated for blue/green (see
[`blue-green-migrations.md`](blue-green-migrations.md#uptime-kuma-monitors)):
the old bare-hostname internal monitors (`api`/`web`) stopped resolving once
only the colored services exist, replaced by 4 static per-color monitors.

| Monitor                      | Target                                  | Proves                                  |
| ---------------------------- | --------------------------------------- | --------------------------------------- |
| API (external)               | `https://api.biasmarket.com/api/health` | DNS + TLS + Caddy + app, end to end     |
| API (internal, blue)         | `http://api-blue:3000/api/health`       | api-blue itself, independent of edge    |
| API (internal, green)        | `http://api-green:3000/api/health`      | api-green itself, independent of edge   |
| Web (external)               | `https://biasmarket.com/api/health`     | DNS + TLS + Caddy + Next.js             |
| Web (internal, blue)         | `http://web-blue:3001/api/health`       | web-blue's Next.js process itself       |
| Web (internal, green)        | `http://web-green:3001/api/health`      | web-green's Next.js process itself      |
| DB                           | TCP `db:5432`                           | Postgres accepting connections          |
| MinIO                        | `http://minio:9000/minio/health/live`   | Object storage liveness                 |
| `migration_pending` watchdog | Kuma push monitor (see above)           | A deploy didn't get stuck mid-migration |

One of the two internal monitors for a given app is expected to show down
whenever only one color is running (the normal steady state between deploys) —
that's not an incident on its own; check which color is currently live
(`cat /opt/biasmarket/state/current_color` on the VPS) before treating an
internal monitor's down state as a problem.

## First triage step: isolate edge vs. app

Every critical surface has an external and an internal monitor. Check both
before doing anything else:

- **External down, internal up** → Caddy/DNS/TLS problem. From
  `/opt/biasmarket`, check `docker compose logs caddy`, confirm DNS still
  resolves (`dig +short api.biasmarket.com`), and check for an expired cert.
- **Both down** → the app itself. Go straight to the common fixes below.
- **DB down** → almost always cascades into both API monitors going down too;
  fix DB first.
- **Only one internal color's monitor is down** → not necessarily an incident,
  see the note under [The monitors](#the-monitors) above — confirm which color
  is actually live first.

## Common fixes

On the blue/green stack (from `/opt/biasmarket` — **never** a bare
`docker compose down`, see `infra/vps/docker-compose.yml`'s header comment):

```bash
# which color is live right now
cat state/current_color

# tail logs / restart ONE service — always name it explicitly, api-blue or
# api-green, never bare `api` (that service doesn't exist in this stack)
docker compose -f docker-compose.yml logs -f api-<color>
docker compose -f docker-compose.yml restart api-<color>
```

If `api-<color>` is unhealthy, it is **not** mid-migration — migrations run in
the explicit deploy phase, not on container boot. An unhealthy API past its
healthcheck's `start_period` is a real problem, not a "still migrating, give it
a second" false alarm.

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

1. `/opt/biasmarket/env/shared.env`, read by the live `api-<color>` services.
2. Kuma's own Webhook notification-provider config (Settings → Notifications →
   the webhook provider → edit the `X-Webhook-Secret` header value), stored in
   Kuma's SQLite.

To rotate on the blue/green stack: `env/shared.env` is checksum-gated
(`deploy.sh` refuses to deploy if it changes unexpectedly — see
`blue-green-migrations.md`). Edit `MONITORING_WEBHOOK_SECRET`'s value in
`/opt/biasmarket/env/shared.env` by hand, update the recorded baseline
(`sha256sum /opt/biasmarket/env/shared.env | cut -d' ' -f1 > /opt/biasmarket/state/shared_env.sha256`
— write just the hash, matching the format `deploy.sh` itself writes), then
restart both running app services that read it, explicitly naming the live
color:
`docker compose -f docker-compose.yml restart api-<live-color>
workers-<live-color>`.

Then manually copy the new value into Kuma's webhook notification-provider
config. Until you do, Kuma's webhook calls 401 — the Slack/Discord path is
unaffected, so this doesn't create a blind spot, just a gap in the durable
incident history until the values match again.

## Accepted limitations (blue/green)

Deliberately not fixed by this migration — documented tradeoffs, not bugs:

- **Rate limiting is in-memory, per container** (already true pre-blue/green —
  `@nestjs/throttler` with no shared backing store). Blue/green raises deploy
  _frequency_, which widens the reset-window attack surface more than it used to
  (every cutover resets every rate-limit counter for whichever color just
  started, not just occasional redeploys). Filed as a follow-up to back the
  throttler with the already-provisioned Redis — not addressed here.
- **Stale Next.js client chunks across a cutover.** A browser tab that loaded
  HTML from the old color before a switch holds that color's hashed chunk
  filenames; once the old color is torn down (cleanup, ~30 min later), that
  tab's next client-side navigation can 404 on a chunk load. Standard Next.js
  deploy behavior, not specific to this stack — a hard refresh recovers.

## Status page

`https://status.biasmarket.com` shows only the two external monitors (API, Web)
— the user-facing surfaces. The other four (internal API/web, DB, MinIO) are
intentionally left off any public page and are only visible in Kuma's main
dashboard, used for triage.
