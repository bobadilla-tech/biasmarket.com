# Production deployment

Production has one supported path: the blue/green VPS stack in `infra/vps/`. The
old source-built Compose deployment has been removed.

## Automatic deployment

Merges to `main` that include at least one path not ignored by the CI push
trigger follow this chain:

```text
push/merge to main
  -> CI workflow (includes the API E2E job on pushes)
  -> CD workflow after successful push CI
  -> build api/web/workers images for the exact commit SHA
  -> push images to GHCR
  -> sync infra/vps/ to /home/deploy/biasmarket
  -> launch deploy.sh <sha> over the restricted SSH dispatcher
  -> wait for the secret-free deploy result
```

The CD workflow only deploys successful `push` runs from this repository's
`main` branch. Pull requests and fork workflow runs cannot deploy. Pull requests
run the per-package CI checks and run the API E2E suite only when relevant paths
change; on a push to `main` the E2E job always runs, and `CI Success` has to
pass before CD can start (see [ci.md](ci.md)).

Pushes whose changes are only ignored paths (`*.md`, `**/*.md`, or `.gitignore`)
do not start CI or CD at all, so a docs-only merge never deploys.

If the E2E job flakes and blocks a deployment, use **Re-run failed jobs** on the
CI run. A passing rerun updates the workflow result and emits a fresh successful
`workflow_run` event for the same push, allowing CD to continue. Do not push an
empty or no-op commit just to retry: that would trigger an additional production
cutover.

Automated CD passes `--force` to the restricted deploy command so rapid
successive merges do not wait for the older benched release's 30-minute cleanup
window. The currently live color remains the rollback target after a successful
cutover; only the older benched release is discarded.

### Variables and secrets

Deploy credentials are secrets in the GitHub `production` environment, which the
`sync-and-deploy` job in `cd.yml` and the cleanup fallback workflow declare. The
`NEXT_PUBLIC_*` values are **not** in that environment: they are
repository-level Actions variables, read by the `build-push` job and baked into
the `web` image as build args (they are public in every browser bundle).

| Where                              | Group                   | Names                                                          |
| ---------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `production` environment (secrets) | SSH access to the VPS   | `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KNOWN_HOSTS` |
| `production` environment (secrets) | the two restricted keys | `DEPLOY_SSH_KEY_RSYNC`, `DEPLOY_SSH_KEY_DISPATCH`              |
| Repository variables (not secret)  | web build-time values   | the `NEXT_PUBLIC_*` names passed as `build-args` in `cd.yml`   |

Full list: the `build-args` block of the `build-push` job in
`.github/workflows/cd.yml`. `NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS` falls
back to a pilot store slug defined in that workflow when the variable is unset.
`api` and `workers` receive the same build args as unused no-ops. How to create
the secrets and variables is in
[provisioning.md](provisioning.md#step-6-github-secrets-variables-the-production-environment).

The first production setup must complete the steps in
[provisioning.md](provisioning.md). After bootstrap, a normal merge to `main` is
the deployment trigger.

## Manual deployment or recovery

Use the VPS `deploy` user, never `ubuntu` or root for the deploy process:

```bash
sudo -iu deploy bash -lc '
  cd /home/deploy/biasmarket &&
  ./deploy.sh <40-hex-commit-sha>
'
```

The deploy script migrates the candidate image, starts the inactive color, waits
for Docker health, runs direct smoke tests, canary-switches Caddy, checks the
public domains, and then commits the new color as live. The previous color
remains available for the rollback window. The phase-by-phase description is in
[blue-green-migrations.md](blue-green-migrations.md#how-a-deploy-actually-runs).

Before doing any migration, it verifies that no retired uncolored `api`, `web`,
or `workers` containers are running and that the shared services are attached to
the `biasmarket_stack` network. A topology mismatch stops the deployment with
the current live color untouched.

Useful supervised operations:

```bash
sudo -iu deploy bash -lc 'cd /home/deploy/biasmarket && ./deploy.sh --rollback'
sudo -iu deploy bash -lc 'cd /home/deploy/biasmarket && ./deploy.sh --cleanup'
sudo -iu deploy bash -lc 'cd /home/deploy/biasmarket && ./deploy.sh --print-current-sha'
```

Manual production recovery uses the same `infra/vps/docker-compose.yml` and
`deploy.sh` files as automatic CD. Do not start another Compose project, build
from a source checkout on the VPS, or use a bare `docker compose down`.

## Runtime layout

```text
/home/deploy/biasmarket/
  docker-compose.yml       blue/green Compose definition        (synced by CD)
  Caddyfile                edge config                          (synced by CD)
  deploy.sh                deployment state machine             (synced by CD)
  lib/*.sh                 sourced by deploy.sh                 (synced by CD)
  bin/*.sh                 SSH dispatcher, migration watchdog,
                           admin helper                         (synced by CD)
  systemd/                 watchdog service and timer units     (synced by CD)
  env/*.env.example        templates                            (synced by CD)
  env/*.env                runtime secrets                      (never synced)
  caddy/active/*.caddy     generated live routing               (never synced)
  state/                   deploy state                         (never synced)
  releases/                history.log, pre-migration dumps     (never synced)
```

The "never synced" paths are excluded from the CD rsync and are only ever
written on the VPS. Production images are immutable GHCR images tagged with the
commit SHA. The VPS does not build application images from a source checkout.

### State files

Everything under `state/` is written by `deploy.sh` (or the SSH dispatcher) and
contains no secrets. Constants are defined in `infra/vps/lib/state.sh`.

| File                                        | Holds                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `current_color`, `current_sha`              | which color is live and which commit it runs                                                                      |
| `rollback_target`, `rollback_target_set_at` | the sidelined color and when it was benched (cleanup refuses to act before its minimum age)                       |
| `last_deploy_result`                        | secret-free outcome of the latest run (SHA, outcome, phase); what CD polls                                        |
| `deploy.lock`, `deploy.lock.meta`           | the `flock` file and who or what holds it, with the current phase                                                 |
| `migration_pending`                         | present while a migration phase is in flight; watched by the systemd watchdog                                     |
| `shared_env.sha256`                         | known-good checksum of `env/shared.env`, asserted on every invocation                                             |
| `scheduled_cleanup.pid`, `.meta`, `.log`    | the self-scheduled old-color cleanup (see [blue-green-migrations.md](blue-green-migrations.md#scheduled-cleanup)) |
| `last_launch.log` (+ `.previous`)           | stderr of the latest dispatcher-launched run, rotated one deep                                                    |

`releases/` holds `history.log` (one line per deploy, rollback and bootstrap)
and the `pre-migrate-*.sql.gz` dumps described in
[operations.md](operations.md#restore).

## Configuration files

Real env files live only on the VPS and are never committed or synced. The
`.example` templates in `infra/vps/env/` carry the header comments; this table
says who reads what. It names variable groups, not values.

| File                                            | Read by                                                                                       | Variable groups                                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env/shared.env`                                | Compose interpolation (via `lib/compose.sh`) and every service that declares it as `env_file` | Postgres, Redis, auth and buyer-session secrets, public URLs, internal-jobs secret, object storage (endpoint and buckets), mail, monitoring webhook secret, error-tracking DSNs |
| `env/blue.runtime.env`, `green.runtime.env`     | the app services of that color                                                                | `INTERNAL_API_URL`, the only value that differs per color                                                                                                                       |
| `env/watchdog.env`                              | the migration-watchdog systemd service                                                        | the Kuma push URL and the stuck-migration threshold                                                                                                                             |
| `infra/terraform/terraform.tfvars` (gitignored) | Terraform                                                                                     | see [provisioning.md](provisioning.md#variables-and-credentials)                                                                                                                |
| `infra/docker/.env.example`                     | local development only                                                                        | see [docker-dev.md](docker-dev.md)                                                                                                                                              |

The security-critical names in `shared.env` are `BETTER_AUTH_SECRET`,
`CUSTOMER_ACCOUNT_TOKEN_SECRET`, `INTERNAL_JOBS_SECRET` and the `GOOGLE_*` pair;
see [security-payments.md](security-payments.md). `deploy.sh` refuses to run
when `env/shared.env` no longer matches its recorded checksum, so a rotation is
a reviewed, manual step (see the rotation procedure in
[incident-response.md](incident-response.md#rotating-monitoring_webhook_secret)).

## Verification

```bash
curl https://api.biasmarket.com/api/health
curl https://biasmarket.com/api/health
curl -I https://biasmarket.com
sudo -iu deploy bash -lc 'cd /home/deploy/biasmarket && cat state/current_color'
sudo -iu deploy bash -lc 'cd /home/deploy/biasmarket && cat state/current_sha'
```

## Caddy changes

A change to `infra/vps/Caddyfile` is not picked up by a normal deploy; see
[caddy.md](caddy.md) for the one-time container recreate and the check that
confirms it. Merge Caddyfile changes alone, after the other pending deploys have
finished.

For health, migration, rollback, and incident procedures, see
[blue-green-migrations.md](blue-green-migrations.md) and
[incident-response.md](incident-response.md).

## Related

- [provisioning.md](provisioning.md) for server setup and the first cutover.
- [blue-green-migrations.md](blue-green-migrations.md) for deploy mechanics and
  migration discipline.
- [operations.md](operations.md) for shared services and restore.
- [ci.md](ci.md) for what gates CD.
