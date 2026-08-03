# Docker dev loop improvements

## Context

Follow-up to [dev-setup-spike](2026-08-03-dev-setup-spike.md) item 5, deferred
there as "real but lower-severity... bigger, riskier change than a docs/config
pass." Picked up now specifically: the inline `command:` shell chains in
`infra/docker/docker-compose.dev.yml` (three separate real bugs in the last
month — YAML folded-scalar mangling, a `deleteOutDir`/`nodemon` race, this
session's earlier `procps`/`tree-kill` crash), and the accepted-but-unautomated
gap where editing `packages/db/prisma/schema.prisma` needed a manual
`docker compose restart api`.

Not touched: install/build/seed re-running on every container start. Turbo's
own cache lives in the bind-mounted repo root (persists across restarts on the
host, unlike a `COPY`-based image build), and `pnpm install`/seed are
idempotent no-ops when nothing changed, so a warm restart was already fast in
practice — verified while testing below, no restart in this session took more
than a few seconds past the healthcheck. Rewriting that chain wasn't warranted.

## Decisions

- **Extract the compose `command:` into real `.sh` scripts**
  (`infra/docker/scripts/api-dev.sh`, `web-dev.sh`), referenced via
  `command: sh infra/docker/scripts/<name>.sh`. Removes the YAML
  folded-scalar risk entirely (normal shell quoting instead of
  escaped-inside-YAML), and each one-shot setup step is now `set -e` +
  sequential rather than a long `&&` chain — same fail-fast behavior, easier
  to read and diff.
- **`exec` into the final long-lived `concurrently` process** at the end of
  each script, instead of leaving it as a child of `sh -c`. Hands PID 1
  directly to `concurrently` so `docker stop`/compose-down's `SIGTERM` reaches
  it immediately. Verified below — went from "however long an intermediate
  shell takes to forward or time out" to ~0.44s wall time to stop both
  containers.
- **Automate the schema-change gap** rather than just documenting it (which
  is all `dev-setup-spike` did for it). Added a fourth `concurrently` process
  to `api-dev.sh`: an `nodemon` watching `packages/db/prisma/schema.prisma`
  that re-runs `prisma generate` on change, plus extended the existing
  app-restart `nodemon` to also watch `packages/db/generated` (and added `ts`
  to its extension filter — `packages/db` has no build step, its generated
  client is consumed directly as `.ts` via Node's native TypeScript support,
  so the existing `js,json` filter would never have seen it change). Verified
  end-to-end below, not just read through.

## What changed

**New:**

- `infra/docker/scripts/api-dev.sh`, `infra/docker/scripts/web-dev.sh` — the
  extracted, commented dev entrypoints.
- `docs/plans/2026-08-03-docker-dev-loop-improvements.md` — this doc.

**Edited:**

- `infra/docker/docker-compose.dev.yml` — both services' `command:` now point
  at the scripts above instead of an inline shell chain.
- `docs/core/readme.md` — hot-reload section rewritten to describe the
  4-process pipeline (was 3) and point at the new script files as the actual
  source of truth for the dev command.
- `docs/core/infra.md` — struck through the now-fixed "schema changes need a
  manual restart" known issue.

## Verification

All done against the real, already-running dev stack (`docker compose -f
infra/docker/docker-compose.dev.yml`, this machine had it up for ~22h), not
just read through:

- `docker compose ... up -d --build api web` — clean rebuild picked up both
  this change and the earlier `procps` fix from the same session; confirmed
  `docker exec biasmarket-dev-api-1 which ps` now resolves (`/usr/bin/ps`,
  was empty before), and both containers came up healthy.
- Confirmed all four labeled processes (`pkg`, `schema`, `build`, `run`)
  actually running via `docker logs ... | grep -oE "^\[[a-z]+\]" | sort -u`.
- **First attempt at the schema-watcher had a real bug**, caught by testing
  instead of assumed working: appended a comment to `schema.prisma`, saw
  `[schema]` fire `prisma generate` correctly, but `[run]`'s nodemon never
  restarted the app — its `-e js,json` extension filter silently excluded
  `packages/db/generated`'s `.ts` output. Fixed by adding `ts` to that
  filter, restarted the `api` container, re-tested the same way: `[schema]`
  regenerates → `[run]` nodemon restarts → Nest boots cleanly, confirmed via
  full log output and `curl localhost:3000/api/health` →
  `{"status":"ok","db":"ok"}`.
- Reverted the test edit to `schema.prisma` (`git checkout --`), confirmed the
  watcher fired again on the revert and the app came back up healthy.
- `time docker compose stop api web` → 0.44s total (previously undocumented
  baseline, but this is the number that matters going forward if it
  regresses) — confirms the `exec`/PID-1 change is doing what it's supposed
  to.
- `git status` after all of the above: only the intended files changed, test
  edits to `schema.prisma` left no diff.
