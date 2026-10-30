# Operations

Runbooks for the always-on services in the production stack, and for restoring
data. Deploys and rollbacks are in [deploy.md](deploy.md),
[blue-green-migrations.md](blue-green-migrations.md) and
[incident-response.md](incident-response.md); this doc covers what runs beside
the blue/green app colors.

All commands run on the VPS as the `deploy` user from `/home/deploy/biasmarket`.
Never run a bare `docker compose down` there: it would stop the shared services
and leave the app containers running against a dead database. Always name the
service. The compose file requires `IMAGE_TAG` even for shared services, so use
the live commit as a placeholder:

```bash
IMAGE_TAG="$(cat state/current_sha)" docker compose --env-file env/shared.env ps
IMAGE_TAG="$(cat state/current_sha)" docker compose --env-file env/shared.env logs --tail 100 <service>
IMAGE_TAG="$(cat state/current_sha)" docker compose --env-file env/shared.env restart <service>
```

The services are defined in `infra/vps/docker-compose.yml`; image tags and
healthcheck details live there, not here.

## Shared services

| Service       | Purpose                                            | Volume                       | Health                                       |
| ------------- | -------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| `db`          | Postgres, the only database                        | `db_data`                    | `pg_isready` healthcheck; Kuma TCP monitor   |
| `redis`       | BullMQ queues for `api` and `workers`              | `redis_data`                 | `redis-cli ping` healthcheck                 |
| `minio`       | S3-compatible object storage                       | `minio_data`                 | `mc ready` healthcheck; Kuma HTTP monitor    |
| `minio-init`  | one-shot: creates buckets and sets access policies | none                         | exits after running; `api` waits for it      |
| `uptime-kuma` | monitoring and the public status page              | `uptime_kuma_data`           | no compose healthcheck; checked from outside |
| `caddy`       | TLS termination and routing to the live color      | `caddy_data`, `caddy_config` | none; the external Kuma monitors cover it    |

None of `db`, `redis` or `minio` publishes a port to the host; they are
reachable only on the Compose network (and `minio` through Caddy, see below).
Production volumes are named `biasmarket_<volume>` because the compose file pins
the project name; if `docker volume ls` shows a different prefix, stop and read
the header of `docker-compose.yml` before doing anything else.

### db

Postgres holds all application data. Restart with the command above; the API and
workers lose their connections while it is down, so check `api-<live-color>`
health afterwards. Do not delete the `db_data` volume. Restoring data is covered
in [Restore](#restore).

### redis

Redis runs with a password from `env/shared.env` and append-only persistence on
`redis_data`, so queued BullMQ jobs survive a restart. Both colors' `workers`
consume the same queues, so the queue contents are shared across a cutover (see
the BullMQ addendum in [blue-green-migrations.md](blue-green-migrations.md)).
Rate limiting is in memory per API container and does not use Redis.

### caddy

Caddy routes the four public hostnames to the live color and to `minio` and
`uptime-kuma`. Deploys change routing by rewriting `caddy/active/*.caddy` and
reloading, never by restarting. Certificates and ACME state live in
`caddy_data`; losing it only costs re-issuance. Access logs are capped by
Docker's `json-file` driver, so they do not fill the disk on their own. Edge
behavior and the bind-mount caveat for Caddyfile changes are in
[caddy.md](caddy.md).

### Disk full

1. `df -h /` and `docker system df` to see whether images, build cache, volumes
   or logs are the cause.
2. `deploy.sh --cleanup` already prunes unused images and build cache each time
   it tears down the old color (about 30 minutes after a deploy), so a growing
   image set usually means cleanup has not run; check
   `state/scheduled_cleanup.meta` and `state/rollback_target`.
3. If space is needed between deploys, `docker image prune -af` removes every
   image not used by a running container. Do not run it during a deploy or while
   you still want the benched color to be startable for a rollback: its image
   goes too.
4. Do not prune volumes. `docker volume prune` can remove data volumes that no
   running container currently references.
5. Pre-migration dumps in `releases/` are pruned automatically after a retention
   period (see [Restore](#restore)); remove older ones by hand only if you have
   a copy elsewhere.

## MinIO

MinIO stores uploaded images. `minio-init` is started with the stack (by
bootstrap, and as a dependency of `api`) and creates three buckets if they are
missing, named by `S3_BUCKET` (product images), `S3_LOGO_BUCKET` (store logos)
and `S3_PAYMENT_BUCKET` (payment proofs) in `env/shared.env`:

- the product and logo buckets get an anonymous **download** policy, so objects
  are publicly readable by URL;
- the payment bucket gets no anonymous policy and stays private.

The API talks to MinIO over the Compose network (`S3_ENDPOINT`) and builds
public URLs from `S3_PUBLIC_URL`, which points at the `cdn.` hostname. Caddy
maps that hostname to `minio` on its S3 port only; the MinIO admin console port
is not routed, so there is no browser console in production. To inspect buckets,
use `mc` inside the `minio` container (its healthcheck already relies on a
`local` alias there; `minio-init` defines its own through `MC_HOST_local`).

MinIO is pinned to a digest-pinned GHCR rebuild of the last open-source release
because Docker Hub and Quay no longer serve it (see the bootstrap lessons in
[provisioning.md](provisioning.md#bootstrap-lessons-and-operational-deviations)).
Object data lives only in `minio_data`; see the backup note under
[Restore](#restore).

## Uptime Kuma

Kuma runs behind Caddy on the status hostname. The status page is public; the
dashboard sits behind Kuma's own admin login. Kuma keeps its configuration and
history in `uptime_kuma_data`.

`scripts/setup-kuma.ts` configures Kuma over its admin socket and is idempotent
(it skips what already exists by name). It cannot run before `uptime-kuma` is
up, so for a new server run it right after `deploy.sh --bootstrap`
([provisioning.md](provisioning.md#first-production-cutover-t11)). Run it from a
checkout on your own machine with dependencies installed (`pnpm install`),
passing the admin credentials you want Kuma to use (the script creates the first
admin account if Kuma's setup wizard has not run):

```bash
export MONITORING_WEBHOOK_SECRET='<same value as in env/shared.env>'
KUMA_USERNAME='<kuma-admin-user>' KUMA_PASSWORD='<kuma-admin-password>' \
  node scripts/setup-kuma.ts
```

Optional variables (`KUMA_URL`, `API_URL`, `STATUS_PAGE_SLUG`,
`STATUS_PAGE_TITLE`) and their defaults are documented at the top of the script.
It creates:

- a webhook notification that posts state changes to the API's monitoring
  endpoint, authenticated with `MONITORING_WEBHOOK_SECRET`;
- the HTTP and TCP monitors (external and per-color internal checks for the API
  and web, plus database and MinIO), listed in
  [incident-response.md](incident-response.md#the-monitors);
- the `migration_pending watchdog` push monitor;
- the public status page, containing only the external monitors.

It does **not** create a real-time Slack or Discord notification. Add one by
hand in Kuma (Settings, Notifications) and attach it to the monitors.

After the script prints the push monitor's URL, put it in
`/home/deploy/biasmarket/env/watchdog.env` as `KUMA_MIGRATION_PUSH_URL` on the
VPS (treat it like a credential) and restart the timer:

```bash
sudo systemctl restart biasmarket-migration-watchdog.timer
```

Re-run the script after any VPS rebuild: monitors, the status page and the push
URL do not survive losing `uptime_kuma_data`, and hand-added notifications have
to be recreated in the UI. What fires when a monitor misses is in
[incident-response.md](incident-response.md).

## Restore

### Pre-migration dumps

Whenever a deploy has pending migrations, `deploy.sh` first takes a plain-SQL
`pg_dump` of the database from the `db` service, compresses it and writes it to
`/home/deploy/biasmarket/releases/pre-migrate-<sha>-<UTC timestamp>.sql.gz`
(`infra/vps/lib/migrate.sh`). A deploy with no pending migrations writes none. A
migration is refused if the dump is empty. After a successful migration, dumps
older than `SNAPSHOT_RETENTION_DAYS` (default set in `lib/migrate.sh`) are
deleted. Prisma writes no down migrations and `deploy.sh --rollback` does not
touch the database, so a dump is the recovery path when a migration itself did
damage.

These dumps live on the same server as the database. They cover "a migration
went wrong", not "the server is gone".

### Restore a dump into the live database

The dump is plain SQL without `DROP` or `CREATE DATABASE`, so it has to be
loaded into an empty database. This procedure is derived from how the dump is
produced; it is not automated and `deploy.sh` does not exercise it, so rehearse
it on a scratch copy before relying on it in an incident. Expect downtime.

1. Pick the dump taken just before the migration you want to undo (the file name
   carries the commit SHA and a timestamp): `ls -lt releases/pre-migrate-*`.
2. Stop writers, naming the live color explicitly (see
   [incident-response.md](incident-response.md#common-fixes) for the command
   form): stop `api-<color>`, `workers-<color>` and `web-<color>`, and confirm
   with `docker compose ps` that no other color's `api`, `workers` or `web`
   container is still running, because `DROP DATABASE` fails while any
   connection remains.
3. Take a fresh dump of the current database as a safety net, using the same
   form `migrate.sh` uses:

   ```bash
   IMAGE_TAG="$(cat state/current_sha)" docker compose --env-file env/shared.env \
     exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
     | gzip > releases/manual-before-restore-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
   ```

4. Recreate the database empty, connecting to the `postgres` maintenance
   database (the variables are expanded inside the container, so paste the
   command as is):

   ```bash
   IMAGE_TAG="$(cat state/current_sha)" docker compose --env-file env/shared.env \
     exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres \
       -c "DROP DATABASE \"$POSTGRES_DB\"" -c "CREATE DATABASE \"$POSTGRES_DB\""'
   ```

5. Load the chosen dump:

   ```bash
   gunzip -c releases/<chosen-dump>.sql.gz | \
     IMAGE_TAG="$(cat state/current_sha)" docker compose --env-file env/shared.env \
     exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
   ```

6. The dump includes Prisma's migration history, so the schema is back to its
   pre-migration state. Bring up code that matches that schema (the previous
   commit, via `./deploy.sh --rollback` or a normal deploy of that SHA) before
   starting the app services, otherwise the next deploy re-applies the
   migration. Then confirm with the checks in
   [deploy.md](deploy.md#verification).

### Server lost or reinstalled

1. Provision a replacement following [provisioning.md](provisioning.md); note
   that a reinstall wipes the volumes, including the dumps in `releases/`.
2. Recreate the four `env/*.env` files from the reviewed production secrets,
   using the same values as before: in particular the buyer-session secret,
   since changing it logs out every buyer.
3. Run `deploy.sh --bootstrap <sha>` (first cutover). It starts the shared
   services, runs migrations against an empty database and brings up the first
   color, so the result is an empty application.
4. To bring data back, restore a dump you kept off the server using steps 2 to 5
   above, then deploy a commit that matches the dump's schema.
5. Re-run the Kuma setup (see [Uptime Kuma](#uptime-kuma)).

### What is not backed up

The repository contains no scheduled backup of the database or of MinIO objects.
The pre-migration dumps are the only dumps, they are short-lived and local to
the server, and nothing in the repo copies MinIO's `minio_data` anywhere.
Restoring uploaded images therefore needs a copy taken by other means. See the
[scheduled-backup issue](https://github.com/bobadilla-tech/biasmarket.com/issues/485)
for the plan to change this.

## Related

- [provisioning.md](provisioning.md) for building or rebuilding the server.
- [incident-response.md](incident-response.md) for alerts, rollback, and error
  tracking.
- [caddy.md](caddy.md) for the edge.
- [deploy.md](deploy.md) for state files and the runtime layout.
