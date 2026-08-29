# Production deployment

Production has one supported path: the blue/green VPS stack in `infra/vps/`. The
old source-built Compose deployment has been removed.

## Automatic deployment

Merges to `main` that include at least one path not ignored by the CI push
trigger follow this chain:

```text
push/merge to main
  -> CI workflow
  -> API E2E suite on the resulting main push
  -> CD workflow after successful push CI
  -> build api/web/workers images for the exact commit SHA
  -> push images to GHCR
  -> sync infra/vps/ to /opt/biasmarket
  -> launch deploy.sh <sha> over the restricted SSH dispatcher
  -> wait for the secret-free deploy result
```

Pushes whose changes are only ignored paths (`*.md`, `**/*.md`, or `.gitignore`)
do not start this automatic CI/CD chain.

The CD workflow only deploys successful `push` runs from this repository's
`main` branch. Pull requests and fork workflow runs cannot deploy. Pull requests
run the normal per-package CI checks but do not run the API E2E suite.
Markdown-only and `.gitignore`-only pushes are ignored by the push trigger and
therefore do not start CI or CD. A merge push with at least one non-ignored
change runs all 24 API E2E specs before `CI Success` can authorize CD.

If the E2E job flakes and blocks a deployment, use **Re-run failed jobs** on the
CI run. A passing rerun updates the workflow result and emits a fresh successful
`workflow_run` event for the same push, allowing CD to continue. Do not push an
empty or no-op commit just to retry: that would trigger an additional production
cutover.

Automated CD passes `--force` to the restricted deploy command so rapid
successive merges do not wait for the older benched release's 30-minute cleanup
window. The currently live color remains the rollback target after a successful
cutover; only the older benched release is discarded.

Required production configuration is in the GitHub `production` environment:

- `DEPLOY_SSH_HOST`
- `DEPLOY_SSH_USER` (the VPS `deploy` user)
- `DEPLOY_SSH_KNOWN_HOSTS`
- `DEPLOY_SSH_KEY_RSYNC`
- `DEPLOY_SSH_KEY_DISPATCH`
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_SANITY_PROJECT_ID`, and `NEXT_PUBLIC_SANITY_DATASET` variables

The first production setup must complete the provisioning and bootstrap steps in
[blue-green-migrations.md](blue-green-migrations.md). After bootstrap, a normal
merge to `main` is the deployment trigger.

## Manual deployment or recovery

Use the VPS `deploy` user, never `ubuntu` or root for the deploy process:

```bash
sudo -iu deploy bash -lc '
  cd /opt/biasmarket &&
  ./deploy.sh <40-hex-commit-sha>
'
```

The deploy script migrates the candidate image, starts the inactive color, waits
for Docker health, runs direct smoke tests, canary-switches Caddy, checks the
public domains, and then commits the new color as live. The previous color
remains available for the rollback window.

Before doing any migration, it verifies that no retired uncolored `api`, `web`,
or `workers` containers are running and that the shared services are attached to
the `biasmarket_stack` network. A topology mismatch stops the deployment with
the current live color untouched.

Useful supervised operations:

```bash
sudo -iu deploy bash -lc 'cd /opt/biasmarket && ./deploy.sh --rollback'
sudo -iu deploy bash -lc 'cd /opt/biasmarket && ./deploy.sh --cleanup'
sudo -iu deploy bash -lc 'cd /opt/biasmarket && ./deploy.sh --print-current-sha'
```

Manual production recovery uses the same `infra/vps/docker-compose.yml` and
`deploy.sh` files as automatic CD. Do not start another Compose project, build
from a source checkout on the VPS, or use a bare `docker compose down`.

## Runtime layout

```text
/opt/biasmarket/
  docker-compose.yml       blue/green Compose definition
  deploy.sh                deployment state machine
  env/*.env                runtime secrets, never synced by CD
  caddy/active/*.caddy     generated live routing, never synced by CD
  state/                    deploy state, never synced by CD
  releases/                 migration snapshots and history
```

Production images are immutable GHCR images tagged with the commit SHA. The VPS
does not build application images from a source checkout.

## Verification

```bash
curl https://api.biasmarket.com/api/health
curl -I https://biasmarket.com
sudo -iu deploy bash -lc 'cd /opt/biasmarket && cat state/current_color'
sudo -iu deploy bash -lc 'cd /opt/biasmarket && cat state/current_sha'
```

For health, migration, rollback, and incident procedures, see
[blue-green-migrations.md](blue-green-migrations.md) and
[incident-response.md](incident-response.md).
