# CD audit: current blue/green VPS pipeline vs. Kamal

**Date:** 2026-08-29 **Scope:** Continuous delivery only (build → ship → cut
over → migrate → roll back). CI (`ci.yml` per-package
lint/typecheck/build/test/e2e) is out of scope except where CD depends on it.
**Question asked:** Would [Kamal](https://kamal-deploy.org) have been a better
fit — fewer bespoke scripts/YAML, a structure engineers already know, more
battle-tested — without losing (ideally improving) the expand/contract migration
discipline and the zero-downtime property? Canary/weighted rollout is
**explicitly not a priority**; the open worry is breaking `workers` when we
change something they depend on.

> Location note: repo convention is `docs/audits/` (plural), so this lives there
> rather than `docs/audit/`.
>
> **v5.** Four review rounds, each running parallel Kamal fact-check,
> current-setup fact-check, and reasoning/bias-review agents (~12 agent-runs
> across the rounds), plus a final consistency pass. Recommendation history: v1
> "keep as-is" → v2 "staged partial migration" → v3–v5 **"trim in place now;
> revisit a full migration when a concrete trigger fires; if it proceeds, do the
> full migration, not a hybrid."** Changelog at the end.

---

## 1. Verdict

**Would Kamal have been a better fit? In hindsight, yes — had Kamal in its
current form existed when this pipeline was built, starting on it would have
saved most of these ~2,100 lines at little cost. The bespoke build was a
defensible call on the timeline, but nothing in it is worth keeping for its own
sake. That said, on deploy _mechanics_ the two approaches are now roughly a
wash; Kamal's real edge is a structure a new engineer recognises on day one and
a much smaller surface to own — which matters more as the team or the
infrastructure grows, and less while it is one VM and one or two operators.
Right now: trim the current system in place, and put a real trigger on the
migration decision rather than a date.**

Why not migrate now:

1. **The system is under a month old and still churning.** Every file under
   `infra/vps/` and the current `cd.yml` was written from 2026-08-10 onward —
   ~25 + ~15 commits in the ~2.7 weeks to 2026-08-29 (§2). Porting a design that
   is still discovering its own edge cases means chasing a moving target and
   losing the git-history rationale behind each guard.
2. **There is no automated coverage of the deploy path to port against.**
   Migrating an untested state machine is how its subtle invariants
   (reconcile-with-reality, out-of-order-deploy rejection, the cleanup age-check
   race) get quietly dropped.

The review corrections (§7, §8, changelog) cut **both ways**: they reduce the
_urgency_ of migrating (the `workers` worry is bounded and mostly already
handled; canary — unwanted — is not in shipped Kamal anyway) **and** they reduce
the _risk and effort_ of a future port (the cross-version worker window is now
known to be tiny; graceful drain already works). So they are not an argument
that migration is a bad idea — only that it is not time-critical, and the two
blockers above are.

### The options

|                                 | What                                                                                                                                                                              | Bespoke bash+YAML after                                         | Effort                         | Risk                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| **A. Full migration**           | Kamal owns build/deploy/proxy/TLS/accessories; idiomatic stock setup; provisioning rewritten                                                                                      | ~350–550 (hooks + CI + `deploy.yml`) + a Ruby gem + kamal-proxy | ~1.5–2 wk + supervised cutover | Medium, one-time, converges on a setup engineers recognise |
| **B. Staged partial**           | Kamal + kamal-proxy for app cutover only, behind existing Caddy; accessories left in the current compose                                                                          | ~700–950 + gem + proxy + a two-orchestrator setup               | ~1–1.5 wk + spike + cutover    | Medium, and it is a _stopping point_, not a destination    |
| **C. Trim in place** _(do now)_ | No Kamal. Delete the canary path + the 30-min dual-run window; old color torn down at the start of the next deploy; fix the worker stop-timeout; add a state-machine test harness | ~1,500–1,600                                                    | ~6–9 d (harness included)      | Low–Medium                                                 |

- **Do C now.** It shrinks the `workers` danger window from ~30 min to seconds,
  removes ~230–290 lines of the most intricate bespoke code (canary
  choreography, self-scheduled cleanup, the hourly fallback workflow), and
  builds the test harness that any later decision depends on. It also has real
  costs — it drops the 10% canary for switch-then-verify, and past the point the
  old color is torn down (the start of the next deploy) a rollback is a cold
  `compose up`, not a Caddy reload (§10C). Those are acceptable for a single-VM
  merch store but they are not "nothing".
- **Put a trigger, not a date, on the A decision** (§12): re-evaluate when
  **any** of — churn has settled (`< 5` commits to `infra/vps/` in a rolling 90
  days) _and_ the harness is in CI _and_ a 1–2 week bandwidth window exists;
  **or** a second person needs to operate deploys / the team grows; **or** a
  second host or environment appears; **or** a production deploy incident is
  traced to a `deploy.sh` / `lib/*.sh` defect. Realistically the first arm is
  weeks-to-months after C lands, because C itself removes the churniest code and
  builds the harness.
- **If the A decision fires, do A — the full idiomatic migration — not B.** B is
  a _stopping point_, not a destination: it leaves two orchestration mechanisms
  on one host (Kamal for app containers, plain compose for `db`/`redis`/`minio`)
  as standing operational debt, it fails the same "not yet" gate A does, and its
  integration spike never exercises the failure modes §3 credits the current
  system for. B's one genuine value is as an _incremental path_ — first real
  Kamal exposure on the app tier before betting TLS and stateful services on it
  — but if taken, its end state must be treated as temporary, not settled. §10B.
- **"Keep a trimmed C-permanent" is an acceptable long-run answer.** For one VM
  and a small team, owning a ~1,500-line pipeline you understand may simply beat
  adopting a toolchain. The trigger review is where that gets decided, not
  foreclosed here.

---

## 2. Current CD architecture (inventory)

Trigger chain (`docs/core/deploy.md`, `docs/core/blue-green-migrations.md`):

```
push to main
 → ci.yml  (per-package checks + full API E2E on push)
 → ci-success gate  (scripts/ci/check-ci-success.sh, wired as the "CI Success" job)
 → cd.yml  workflow_run: ["CI"] completed
     gate            event=='push' && head_branch=='main' && same-repo  (fork-PR guard)
     build-push      matrix api|web|workers, native ubuntu-24.04-arm, → GHCR, tag=<sha>
     sync-and-deploy
       staleness guard   git merge-base --is-ancestor vs `deploy.sh --print-current-sha`
       rsync infra/vps/  → /opt/biasmarket/  (SSH key A, rrsync-restricted)
       launch deploy.sh  detached via SSH key B (ssh-deploy-dispatcher.sh anchored allowlist)
       wait-for-result   second SSH call, polls state/last_deploy_result (secret-free)
 → cleanup-fallback.yml   hourly cron backstop: deploy.sh --cleanup (idempotent no-op)
```

`deploy.sh` `cmd_deploy` phases: reconcile `state/current_color` ↔ live Caddy →
assert `shared.env` checksum → pick candidate color + rollback-target guard →
assert production topology → **migration phase** → start candidate
`api/web/workers-<color>` → Docker health wait → direct-to-container smoke (3×
retry, bypasses Caddy) → weighted-canary Caddy config (10% for 30s) →
public-domain smoke (3× retry) → 100% switch → commit `state/*` → cancel +
self-schedule old-color cleanup +30 min. Failure at any step: tear down the
candidate only, live color and routing untouched. `on_exit` always writes
secret-free `state/last_deploy_result`.

Migration phase order (`lib/migrate.sh` `run_migration_phase`): write
`state/migration_pending` marker → list pending (`prisma migrate status`) → scan
pending `migration.sql` for
`DROP TABLE|DROP COLUMN|DROP TYPE|ALTER COLUMN…TYPE`, `die` unless
`--i-understand-this-is-destructive` → `pg_dump | gzip` pre-snapshot (empty-file
check) → `prisma migrate deploy` with `lock_timeout=5000ms` on the session
`DATABASE_URL` → on failure grep for `advisory lock`, `die` with a dedicated
retryable message → clear the marker.

### Bespoke surface

| Area                                                                                                            | Files                                         | LOC                                       |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| Deploy state machine                                                                                            | `infra/vps/deploy.sh`                         | 555                                       |
| Deploy libs (`caddy.sh` 71, of which ~35 is canary-specific; `cleanup_schedule.sh` 108; `log.sh` helpers 18; …) | `infra/vps/lib/*.sh` (9 files)                | 637                                       |
| SSH dispatcher + migration watchdog                                                                             | `infra/vps/bin/*.sh` (2 files)                | 147                                       |
| CD workflow                                                                                                     | `.github/workflows/cd.yml`                    | 215                                       |
| Cleanup backstop workflow                                                                                       | `.github/workflows/cleanup-fallback.yml`      | 66                                        |
| SSH-setup composite action                                                                                      | `.github/actions/deploy-ssh-setup/action.yml` | 48                                        |
| systemd watchdog unit + timer                                                                                   | `infra/vps/systemd/*`                         | ~20                                       |
| Static Caddy routing                                                                                            | `infra/vps/Caddyfile`                         | 69                                        |
| CI migration-safety gate                                                                                        | `scripts/ci/check-destructive-migrations.sh`  | 46                                        |
| **Subtotal — deploy-specific bash + YAML**                                                                      |                                               | **≈ 1,800** (≈ 1,760 without the CI gate) |
| Blue/green Compose (6 app services: api/web/workers × blue/green)                                               | `infra/vps/docker-compose.yml`                | 302                                       |
| **Total**                                                                                                       |                                               | **≈ 2,100**                               |

Plus a 2-key restricted-SSH model and a systemd timer.

**Churn:** first commit touching `infra/vps/` and `cd.yml` is `d97db5b`,
**2026-08-10**. ~25 commits to `infra/vps/` and ~15 to `cd.yml` in the ~2.7
weeks since. The mechanism is under three weeks old and still moving fast.

---

## 3. What the current setup does well

- **Correctness under partial failure.** `reconcile_state_with_reality`,
  `assert_production_topology`, the staleness guard, and the candidate-only
  teardown path are well thought through. A crash between the Caddy switch and
  the state write is detected, not guessed around.
- **Public-repo secret discipline.** No `set -x` near a `DATABASE_URL`,
  secret-free completion signal, GH Variables vs Secrets split. Real constraint
  (public repo, no GHA masking for VPS-only values), respected throughout.
- **Graceful worker shutdown already exists.** `apps/workers/src/main.ts` calls
  `app.enableShutdownHooks()`; on `SIGTERM`, `@nestjs/bullmq` closes each Worker
  and BullMQ's `close()` waits for the in-flight job (up to BullMQ's own close
  timeout). Residual gaps: `compose stop` is invoked with no `-t`, so the ~10s
  Compose default applies (§8), and a job outliving that is re-run from scratch
  by the new-color worker via BullMQ stalled-job recovery — safe only for
  idempotent handlers (§8).
- **Hot rollback for `api`/`web`.** Old color stays running, so a rollback is a
  health-gated Caddy reload (tens of seconds — 30s health gate + 3× smoke, no
  image pull), not a container restart. Under Option C this holds only until the
  next deploy tears the old color down — §10C.
- **Bounded-blast-radius cutover.** The 10%/30s canary means a candidate that
  passes direct smoke but fails under real traffic shape is caught with 10% of
  users affected, not 100%. Option C changes this to switch-then-verify — §10C.
- **Layered migration safety.** CI PR gate + runtime keyword gate + `pg_dump`
  pre-snapshot + short `lock_timeout` (migration loses fast to live traffic
  instead of FIFO-queuing) + advisory-lock failure as its own retryable class +
  `migration_pending` marker watched by an out-of-band systemd timer.

---

## 4. Costs and risks of the current setup

- **Not "hardened" — still settling.** <3 weeks old, ~40 commits across
  `infra/vps/` + `cd.yml` in that window, and **no automated coverage** of the
  deploy path. Reason to (a) add tests and (b) not port it until it stops moving
  — porting an unstable, untested state machine is harder, and flattening it
  into hooks loses the per-guard git-history rationale.
- **Maintenance surface / bus factor.** ~1,800 lines of interacting bash with
  subtle invariants (lock-fd inheritance across `setsid`, the `--delay-updates`
  rsync race window, the PID-reuse guard via `/proc/$pid/cmdline`). Safely
  modifying it is a days-not-hours ramp.
- **Non-transferable knowledge.** Nobody joins already knowing `deploy.sh`'s
  phase model. This is the strongest standing argument for Kamal; its _urgency_
  scales with team size and operator count, which is why it is a migration
  trigger (§12).
- **Two GitHub workflows + one systemd timer + one cron** for a single-VM
  deploy.
- **Reinvented primitives.** Deploy locking, versioning, rollback, container
  retention, health-gated cutover — all standard tooling territory, all
  hand-built.

---

## 5. Kamal in brief

Kamal 2 (current release 2.12.0, Aug 2026; Ruby CLI wrapping Docker + SSHKit — a
gem, or the `ghcr.io/basecamp/kamal` image, but the dockerized image **cannot**
use the secret-manager adapters, so CI-driven deploys install the gem):

- **`config/deploy.yml`** — `servers` by role (here: `api`, `web`, `workers` — 3
  roles, 3 images, matching the 3 Dockerfiles), `registry`, `builder`
  (`arch: arm64` / remote builder), `env`, `proxy`, `healthcheck`, `accessories`
  (db/redis/minio as declarative side-containers, managed **separately** from
  `kamal deploy` — not updated on a deploy; an accessory _can_ optionally sit
  behind kamal-proxy, but db/redis/minio would not), `boot`, `retain_containers`
  (default 5), `drain_timeout` (default 30s), `stop_timeout`.
- **kamal-proxy** — small Go reverse proxy. Cutover: boot new container beside
  old, poll `GET /up` (1s interval, 5s per-request timeout, until
  `deploy_timeout` = 30s), atomically switch, drain old. Optional request
  `buffering` (memory, spills to disk above ~1 MB — Kamal's own docs are
  internally inconsistent, prose says 1 MB, the example YAML says 2 MB).
  Optional Let's Encrypt TLS. Routing is **host
  - path prefix only** — no arbitrary `respond`/`header`/`redir`. The knobs to
    run it with TLS off, no `host`, on a fixed internal port all exist
    (`ssl: false`, `host` optional, `app_port`/`http_port`, `publish: false`) —
    but running it behind another proxy is not a documented arrangement (§9).
- **`kamal deploy`** — build → push → pull → boot → health-gate → cut over →
  stop old (retained). Auto-runs `prune:all` at the end.
  `-r, --roles=api,web,workers` restricts to named roles; only the primary role
  is proxied, so `--roles=workers` skips the proxy step. `-P/--skip-push` skips
  the build+push (needed when running `kamal deploy` twice for role ordering —
  see below). `--hosts` restricts to a server subset (useless on one VM).
- **`kamal rollback [version]`** — starts a container from the **retained
  image** (nothing pulled). Retained containers are bounded **by count**
  (`retain_containers`, default 5) — current Kamal prunes purely by count; an
  older "pruned after 3 days" line still in Kamal's docs is not what the 2.12.0
  code does.
- **`kamal lock` / auto-lock** — server-side deploy lock.
- **Hooks** —
  `.kamal/hooks/{docker-setup,pre-connect,pre-build,pre-deploy,
  post-deploy,pre-app-boot,post-app-boot,pre-proxy-reboot,post-proxy-reboot}`,
  plain executables. Every `kamal deploy` fires `pre-deploy`/`post-deploy`
  (including a `--roles=workers` run), so a `pre-deploy` migration hook must be
  idempotent — `prisma migrate deploy` is.
- **Secrets** — `.kamal/secrets` (env / 1Password / Bitwarden / Doppler / AWS /
  GCP / Passbolt adapters); pushed to servers as env files.
- **Destinations** — `config/deploy.<dest>.yml`. **Official GitHub Actions
  guide** for CI-driven deploys.

**Kamal does _not_ have** (verified, 2026-08 — §11): weighted / percentage /
canary rollout in the shipped CLI; migration awareness of any kind;
pre-migration snapshots; out-of-order-deploy rejection; a "keep old version
running hot for N minutes" mode; arbitrary proxy routing; a first-class
role-ordering primitive (ordered role deploys are a _convention_ — two
`kamal deploy --roles=` invocations, `-P` on both plus a prior
`kamal build push`, and `--version=<sha>` pinned; in a CI-driven deploy
divergence can't happen anyway because each run builds from the fixed CI
checkout).

---

## 6. Feature-by-feature mapping

| Capability today                                                  | Kamal equivalent                                          | Assessment                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build 3 images (api/web/workers), native arm64, tag `<sha>`, GHCR | `builder.arch: arm64`; `kamal build push`                 | **Parity.** ~10 lines vs the matrix job.                                                                                                                                                                                         |
| Immutable SHA-tagged images, no VPS-side builds                   | Kamal default                                             | **Parity.**                                                                                                                                                                                                                      |
| Blue/green via 6 explicit compose services                        | Kamal: 3 roles, versioned containers                      | **Kamal simpler.** No `*-blue`/`*-green` duplication.                                                                                                                                                                            |
| Health-gated cutover, candidate-only teardown on failure          | kamal-proxy health check + `deploy_timeout`               | **Parity**, native.                                                                                                                                                                                                              |
| Direct-to-container pre-switch smoke                              | `healthcheck` + a `pre-deploy` curl                       | **Near parity.**                                                                                                                                                                                                                 |
| Weighted 10%/30s canary + public gate                             | _none shipped_                                            | **Loss — non-priority.** But note Option C also drops this (§10C).                                                                                                                                                               |
| Zero dropped requests at switch                                   | kamal-proxy drain + optional buffering                    | **Parity** (HTTP).                                                                                                                                                                                                               |
| Hot rollback (`api`/`web`)                                        | `kamal rollback` — container from retained image (last 5) | **vs today:** ~parity (both run a health gate then switch; no image pull, tens of seconds). **vs Option C:** an _improvement_ — once C's old color is torn down at the next deploy, a rollback is a cold `compose up` (minutes). |
| 30-min dual-`workers` consumer window                             | old `workers` stopped seconds after cutover               | **Net positive for `workers`** (§8) — the long window mostly extends the compat obligation.                                                                                                                                      |
| Scheduled cleanup + hourly fallback + age guard                   | `retain_containers` + auto `prune:all`                    | **Kamal much simpler.** `cleanup_schedule.sh` + `cleanup-fallback.yml` + `rollback_target_set_at` all gone. Option C also removes these.                                                                                         |
| `state/current_color` + reconcile-with-Caddy                      | Docker labels + Kamal versions                            | **Kamal simpler.**                                                                                                                                                                                                               |
| Deploy lock (`flock`, fd 9, meta, `setsid` fd close)              | `kamal lock`                                              | **Kamal simpler.**                                                                                                                                                                                                               |
| Out-of-order `workflow_run` staleness guard                       | _none_                                                    | **Keep ours** — `merge-base --is-ancestor` in the Action. (neutral)                                                                                                                                                              |
| 2-key restricted SSH (rrsync + forced-command)                    | Kamal SSHes as a docker-capable user                      | **Regression in blast radius.** Mitigable (dedicated user, jump host), not as tight.                                                                                                                                             |
| Public-repo secret hygiene                                        | our hooks' responsibility                                 | **Neutral.**                                                                                                                                                                                                                     |
| `env/shared.env` checksum assertion                               | _none_                                                    | **Keep ours** as a hook. (neutral)                                                                                                                                                                                               |
| `migration_pending` systemd watchdog                              | _none_                                                    | **Keep ours.** (neutral)                                                                                                                                                                                                         |
| Custom Caddy (4 hostnames, edge rules)                            | host + path routing + TLS only                            | **Caddy stays.** (neutral) — §9                                                                                                                                                                                                  |

**Honest tally of 18 rows:** ~9 genuine Kamal _simpler_/parity, ~5 neutral
("keep ours" — not a Kamal win either way), 3 regressions vs today (canary —
unwanted; SSH surface — mitigable; rollback latency — immaterial), 1
net-positive change (`workers`). The maintenance-surface case for Kamal is the
~9 simpler rows plus deleting the state machine — real, but several of those
wins (2-key SSH retirement, cleanup scheduling) are also delivered by Option C
without a new tool.

---

## 7. Canary status in Kamal (for the record)

The 37signals Kamal 2.0 announcement (26 Sep 2024, Rails World) says maintenance
mode, request pausing, and canary deploys "will be coming to Kamal soon" —
designed _on top of_ kamal-proxy but not shipped. As of the current docs
(2026-08), the CLI and the `kamal-proxy deploy` subcommand expose **no weighted
/ percentage / cookie-based rollout**; a deploy "takes over all the traffic". So
"Kamal natively supports canary-like progressive rollouts" is **not accurate for
the shipped tool today**. Since canary is not a priority, this does not change
the recommendation — noted so the doc is not wrong.

---

## 8. The `workers` / shared-dependency problem

### The real dependency surface (narrow)

`apps/workers` depends on exactly **one** workspace package: `@biasmarket/queue`
(`apps/workers/package.json`). Nothing from `@biasmarket/db` / `types` /
`utils`; `infra/docker/workers.Dockerfile` says so outright. **No direct
database access.** The `orders`/`premium` jobs carry **no payload** — they
`fetch()` `/internal/{orders,premium}/expire-sweep` on `api`. Two of the four
queues carry a real zod payload (`mailer` → `sendEmailParamsSchema`; `ping` → a
placeholder `pingJobPayloadSchema`). Queue names
(`packages/queue/src/queue-names.ts`) are hard-coded and **unnamespaced**
(`ping`/`mailer`/`orders`/`premium`).

So the cross-version danger is confined to: (a) a `@biasmarket/queue` change — a
new required field in a job payload, or a queue-name change; (b) a behavior
change in the internal `api` endpoints the payload-less jobs call (an `api`
expand/contract concern). It is **not** a broad "shared package or DB schema"
surface.

### Today

`workers-blue` and `workers-green` both stay live consumers for the **full
~30-min rollback window** (`deploy.sh` never stops the old color's
`workers-<color>` at cutover; it runs until `cmd_cleanup`, gated to
`CLEANUP_MIN_AGE_SECONDS=1800`). New required job fields must be `.optional()`
for at least one full deploy cycle.

Graceful drain on shutdown **already works** (`enableShutdownHooks()`, §3). Real
gaps:

- `teardown_candidate` / `cmd_cleanup` run `compose stop "…workers-${color}"`
  with **no `-t`**, so a job longer than the ~10s Compose default is
  `SIGKILL`ed. Fix: `compose stop -t 60` (and set BullMQ's own worker close
  timeout to match — the Docker grace alone won't help if BullMQ abandons the
  job first).
- A job that outlives the grace is **re-run from scratch** by the new-color
  worker via BullMQ stalled-job recovery (`stalledInterval` 30s,
  `maxStalledCount` 1), and `default-job-options.ts` already sets `attempts: 3`
  — so job delivery is _at-least-once regardless_. Stopping the old worker
  earlier is only safe for **idempotent handlers.** `orders`/`premium` are
  idempotent (they only call a sweep endpoint). `mailer` calls Resend with **no
  idempotency/dedupe key** and `concurrency: 5` — it can double-send on a
  kill-and-retry. A dedupe key on the mailer job (or accepting rare duplicate
  transactional emails) is a prerequisite for aggressively shortening the
  window.

### Under Kamal

`kamal deploy` boots the new `workers` container, health-gates, stops the old
one — overlap of **seconds**, not 30 minutes. Not zero: during that window both
consume the queue, so backward-compatible payloads are still required, and the
same idempotency caveat applies (Kamal's `stop_timeout`, default =
`drain_timeout` 30s for non-proxied roles, is the same knob as
`compose stop -t`). Ordered role deploys (`--roles=workers` then `--roles=web`)
let new consumers handle old + new jobs before any new-shape job is produced — a
supported _convention_, not a primitive.

### The actual fix (tool-independent)

- **Backward-compatible `@biasmarket/queue` changes for one deploy cycle** — new
  job fields `.optional()` with producer defaults; required a deploy later. Same
  rule as DB expand/contract. Load-bearing in _both_ tools.
- **Idempotent job handlers** (dedupe key on `mailer`). Required for _any_
  scheme that stops the old worker before it has fully drained — which is
  at-least-once already.
- **Job-name / queue versioning** for anything not additive: producers write
  `sendEmail.v2`; new workers register `v1` + `v2` handlers; drop `v1` a deploy
  later. Removes the timing dependency entirely.

**Net:** the `workers` worry does not require a migration. Option C addresses it
with (1) `compose stop -t 60` + a matching BullMQ close timeout, (2) stopping
the old `workers` color right after a verified cutover instead of at +30 min —
shrinking the overlap to seconds — **contingent on the `mailer` dedupe key**,
and (3) the payload / queue-versioning discipline required regardless of tool.

---

## 9. Zero-downtime and the proxy

|                      | Current                                                                    | Kamal / kamal-proxy                                                           |
| -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Mechanism            | Caddy `weighted_round_robin`, canary 10%→100%, `caddy reload` (no restart) | boot new container, health-gate, atomic switch, drain old; optional buffering |
| Dropped requests     | None (graceful reload)                                                     | None (drain + optional buffering)                                             |
| Gradual exposure     | Yes — 10%/30s + public gate                                                | No (non-priority)                                                             |
| DB-schema safety     | Neither — expand/contract required identically                             |                                                                               |
| Worker-schema safety | Neither — §8                                                               |                                                                               |

**Zero-downtime for HTTP: parity.**

### Caddy stays

Four hostnames with non-trivial rules: `/internal/*` → 404, `/robots.txt` at the
edge, `cdn.biasmarket.com` → `minio:9000`, `status.biasmarket.com` `/` →
`/status/status` 302. kamal-proxy does host + path + TLS only. In any Kamal
option Caddy stays as the edge; the app hostnames' `active/*.caddy` imports
would point at kamal-proxy instead of `api-<color>:3000` / `web-<color>:3001`,
deleting `lib/caddy.sh`'s 71-line weighted generator. This is coherent with how
Caddy is wired today (`Caddyfile` → `import /etc/caddy/active/*.caddy` →
`caddy reload`), but Caddy → kamal-proxy is a two-proxy chain that Kamal's docs
do not describe — a standing cost a line count does not capture, and the core
reason Option B (§10) is not a destination.

---

## 10. The options in detail

### Option A — full migration (the right _later_ target)

Kamal owns build, deploy, proxy, TLS, and accessories.
`db`/`redis`/`minio`/`caddy` become `accessories:` in `deploy.yml`; kamal-proxy
terminates public TLS for the app domains (Caddy keeps
`cdn.`/`status.`/API-edge, or is retired). Idiomatic stock Kamal — the thing
engineers recognise.

- **Deletes:** `deploy.sh`, most of `lib/*.sh`, `bin/ssh-deploy-dispatcher.sh`,
  `cleanup-fallback.yml`, most of `cd.yml`, the 6 blue/green compose services,
  the 2-key SSH model, `lib/caddy.sh`.
- **Keeps / ports:** `migrate.sh` logic → `pre-deploy` hook (portability note,
  §11); `check-destructive-migrations.sh` (CI, unchanged); the watchdog; the
  staleness guard → Action step; `shared.env` checksum + topology asserts →
  hooks.
- **Bespoke bash+YAML after:** ~350–550, **plus** a Ruby gem and kamal-proxy.
- **Effort:** ~1.5–2 weeks incl. a `blue-green-migrations.md` provisioning
  rewrite (Steps 1–8 are dense — 1–2 days alone) and a supervised first cutover.
- **Risk:** medium, one-time, converging on a recognisable setup.
- **Why later, not now:** §1.1 (churn) and §1.2 (no tests), plus needing a
  bandwidth window. Port once the system has stopped moving and there is a
  harness to port against.

### Option B — staged partial migration (a stopping point, not a destination)

Kamal + kamal-proxy replace **only** app build + cutover. `db`/`redis`/`minio`
stay in the current compose on `biasmarket_stack`; Kamal's app containers join
that network. Caddy stays as the full edge and `reverse_proxy`es the two app
hostnames to kamal-proxy.

- **Deletes:** `deploy.sh`,
  `lib/{state,lock,compose,caddy,health,smoke,
  cleanup_schedule}.sh`,
  `bin/ssh-deploy-dispatcher.sh`, `cleanup-fallback.yml`, most of `cd.yml`, the
  6 blue/green services (→ 3 roles), the 2-key SSH model.
- **Keeps unchanged:** the `Caddyfile` + four-hostname routing;
  `check-destructive-migrations.sh`; the watchdog; the migration machinery
  ported into `pre-deploy`; the staleness guard in an Action step.
- **Bespoke bash+YAML after:** ~700–950, **plus** the gem, kamal-proxy, and two
  orchestration mechanisms on one host (Kamal for app containers, plain compose
  for accessories).
- **Effort:** ~1–1.5 weeks + a 1–2 day integration spike + a supervised cutover.
  Most of this work is also on A's path (deleting `deploy.sh` + `lib/*.sh` + the
  2-key SSH model, collapsing 6 services → 3 roles, porting `migrate.sh`); the
  residual B→A step is moving `db`/`redis`/`minio` to `accessories:` and giving
  kamal-proxy the public TLS. So B is not "half a migration thrown away" — it is
  a real checkpoint on the way to A.
- **What B buys:** first production Kamal exposure on the app tier before
  betting TLS and the stateful services on it. If the team wants incremental
  proof rather than a single big cutover, B is a legitimate _path_.
- **Why it is not the recommendation:**
  - It fails the **same "not yet" gate as A** — the churn and missing-harness
    blockers (§1.1/§1.2) apply to B identically.
  - Its end state is a **stopping point that ossifies**: two orchestration
    mechanisms on one host (Kamal for app containers, plain compose for the
    accessories) is standing operational debt, and a working intermediate state
    rarely gets finished. Landing there permanently satisfies priority (a) only
    partially and priority (b) barely.
  - Its integration spike only exercises plumbing (proxy reachability, network
    join, hook wiring, secret delivery) — not the failure modes §3 credits the
    current system for (failed migration mid-deploy, in-window `--rollback`,
    out-of-order `workflow_run`).
  - Most of B's non-Kamal wins (2-key SSH retirement, cleanup removal, canary
    removal) are delivered by Option C at a fraction of the cost and risk.

### Option C — trim in place (recommended, do now)

No Kamal. Shrink the current system toward what it actually needs.

1. **Delete the canary path** — `write_canary_config`, `CANARY_*`, the canary
   phase, and the weighted-`lb_policy` parts of `lib/caddy.sh` (~55–70
   canary-specific lines; `write_active_config`/`reload_caddy`/single-upstream
   `_caddy_block` stay). **Posture change:** the remaining public-domain smoke
   can only run _after_ the switch (before it, the public domain is 100% old
   color and proves nothing about the candidate), so this moves from
   _canary-then-verify_ (10% blast radius) to _switch-then-verify_ (100% for the
   smoke duration, then auto-revert). The pre-switch direct-to-container smokes
   still run. For a single-VM merch store this is acceptable; it is a real
   reduction in cutover safety and should be a conscious choice.
2. **Delete the 30-min dual-run window** — after a verified cutover, leave the
   old `api`/`web`/`workers` containers _running but idle_ (traffic is on the
   new color; `workers` old-color stopped promptly, contingent on §8's `mailer`
   dedupe key), and **tear the old color down at the start of the next deploy**
   instead of on a self-scheduled timer. No scheduler, no `sleep 1800`, no age
   check, no fallback cron. Removes `lib/cleanup_schedule.sh` (108),
   `cleanup-fallback.yml` (66), and the `rollback_target_set_at` + age-check
   code (~12 functional lines, ~40 with comments). **Rollback story:** until the
   next deploy, `--rollback` is still fast — it runs its 30s health gate + 3×
   direct smoke on `api`/`web`, then a Caddy reload (no cold `compose up`,
   because the old containers are still up). _After_ the next deploy has torn
   the old color down, a rollback is a cold `compose up` + health wait — minutes
   of degradation. This is the one axis where Kamal (`kamal rollback` from a
   retained image, last 5) is better than Option C.
3. **`compose stop -t 60`** for worker + app teardown, and set BullMQ's worker
   close timeout to match — the real drain gap (§8).
4. **State-machine test harness** — bats, or a containerised dry-run of
   `cmd_deploy`/`cmd_rollback`/`cmd_cleanup` against fakes, covering: failed
   migration mid-deploy, in-window `--rollback`, out-of-order deploy SHA,
   reconcile-mismatch abort. **Required**, not optional. It _materially closes_
   §4's test gap and is the precondition for any later Option A decision — but
   note the subtlest invariants (lock-fd inheritance across `setsid`, the
   `--delay-updates` rsync race window, the PID-reuse guard) are
   process/concurrency behaviours a fakes-based dry-run will not fully cover;
   those stay review-only.
5. **Update the docs** — `docs/core/deploy.md` and
   `docs/core/blue-green-migrations.md` both describe the canary switch and the
   30-minute window and go stale under items 1–2.

- **Deleted:** ~230–290 lines (canary ~55–70, `lib/cleanup_schedule.sh` 108,
  `cleanup-fallback.yml` 66, age-check ~12–40).
- **Bespoke bash+YAML after:** ~1,500–1,600 (net of the harness, which adds
  ~150–250 test lines that are an asset, not surface).
- **Effort:** ~6–9 days (items 1–3 + 5: ~2–3 d; item 4: ~4–6 d).
- **Risk:** low–medium. No new toolchain, no topology change, but the two named
  trade-offs (switch-then-verify; cold rollback once the old color is gone) are
  real reductions in safety margin.
- **Not part of C:** a bespoke consumers-first deploy mode — it adds custom code
  against priority (a); the payload / queue-versioning discipline (§8) covers
  the same ground, and ordered role deploys are cheap to add _later_ under
  Option A.

---

## 11. Research notes / sources

- kamal-proxy README + `deploy --help` — host + path-prefix routing only, no
  weighted option; a deploy "takes over all the traffic".
  <https://github.com/basecamp/kamal-proxy>
- Kamal proxy config — hosts, app port, SSL/redirect, forward headers, response
  timeout, path routing, healthcheck (`/up`, 1s, 5s timeout), buffering (prose
  "1MB", example YAML "2MB"), per-role enable/disable. No canary. `ssl: false` /
  optional `host` / `publish` knobs exist but "behind another proxy" is
  undocumented. <https://kamal-deploy.org/docs/configuration/proxy/>
- Kamal 2.0 announcement, 26 Sep 2024 — maintenance / pausing / canary "coming
  soon" (still unshipped 2026-08). <https://dev.37signals.com/kamal-2/>
- Config overview — `retain_containers` default 5; `drain_timeout` default 30;
  `stop_timeout` "default is the drain_timeout for non-proxied roles and 10s for
  proxied roles". <https://kamal-deploy.org/docs/configuration/overview/>
- `kamal deploy` flags `-r/--roles`, `-P/--skip-push`, `--hosts`, `--version`;
  only the primary role is proxied; `kamal deploy` auto-runs `prune:all`.
  <https://kamal-deploy.org/docs/commands/deploy/>
- **Container retention is count-only in Kamal 2.12.0**
  (`lib/kamal/commands/
  prune.rb#app_containers` — `tail -n +#{retain+1}`, no
  age filter). The "pruned after 3 days" line in `rollback.md` is stale relative
  to the code. <https://github.com/basecamp/kamal>
- Dockerized Kamal cannot use secret adapters.
  <https://kamal-deploy.org/docs/installation/dockerized/>
- Rails `bin/docker-entrypoint` runs `db:prepare` only for the server command —
  hence the workers-first-deploy schema-skew footgun; migrations belong in a
  `pre-deploy` hook regardless.
- Current-setup facts verified against `infra/vps/**`,
  `.github/workflows/{ci,cd,cleanup-fallback}.yml`, `scripts/ci/*`,
  `packages/queue/src/**`, `apps/workers/{package.json,src/**}` (incl.
  `mailer/mailer.processor.ts`, `default-job-options.ts`),
  `infra/docker/{api,workers}.Dockerfile`, and `git log`, on branch
  `chore/ci-shell-scripts` @ 2026-08-29.

### Portability note — `migrate.sh` → `pre-deploy` hook (Options A/B)

Not a verbatim copy. `lib/migrate.sh` calls `compose()` (`lib/compose.sh`),
`atomic_write()` (`lib/state.sh`), and `update_lock_phase()` (`lib/lock.sh`) —
all on the A/B delete lists — plus `deploy.sh` globals (`$ENV_DIR`,
`$RELEASES_DIR`, `$MIGRATION_PENDING_FILE`, …) and the
`compose run --rm --no-deps "api-${color}"` blue/green color model. The hook
needs a thin new harness (~30–50 lines): `compose
run` → `kamal app exec`,
re-implement the marker write, drop the color arg. `lib/log.sh` (`die`, `log_*`)
is not deleted, so that dependency survives. The _logic_ (destructive scan,
snapshot, `lock_timeout` URL, advisory-lock retry class) ports unchanged; the
plumbing around it does not.

---

## 12. Recommendation

**Now — Option C (§10C), harness included. ~6–9 days.** Delete the canary path
and the 30-minute dual-run window (old color torn down at the start of the next
deploy), pass `compose stop -t 60` (+ matching BullMQ close timeout), add a
dedupe key to the `mailer` job, build the state-machine test harness, and
refresh `deploy.md` / `blue-green-migrations.md`. Net: ~230–290 lines of the
most intricate bespoke code gone, the `workers` window down to seconds, and the
test gap materially closed.

Accept, explicitly, what C gives up: **switch-then-verify instead of a 10%
canary**, and — once the next deploy has torn the old color down — **a cold
`compose up` rollback (minutes)** instead of the health-gated Caddy reload (tens
of seconds) available while the old color is still up. Both are acceptable for
one VM and current traffic; both are places Kamal would be better.

**Put a trigger — not a date — on the full-migration (Option A) decision.
Re-evaluate when any one of:**

1. Churn has settled — `< 5` commits to `infra/vps/` in a rolling 90 days —
   **and** the harness is running in CI **and** a genuine 1–2 week bandwidth
   window is available; **or**
2. a second person needs to operate deploys, or the team grows past the current
   one-or-two operators (the point the "non-transferable knowledge" cost in §4
   starts to bite); **or**
3. a second host, or a staging environment, appears (the bespoke scripts' one-VM
   assumptions become the constraint the moment that changes); **or**
4. a production deploy incident is traced to a `deploy.sh` / `lib/*.sh` defect
   (the clearest possible signal that owning this code costs more than adopting
   a tool).

Because Option C removes the churniest code and builds the harness, trigger 1 is
plausibly weeks-to-a-couple-months out, not a fixed future quarter. **A trimmed
C-permanent is an acceptable long-run outcome** for a single-VM, small-team
store — the review is where that is chosen, not something this doc forecloses.

**If the A decision fires, do Option A, not Option B.** They share most of their
work, so B is a real checkpoint rather than wasted effort — but B's end state
(two orchestration mechanisms on one host, `db`/`redis`/`minio` outside Kamal,
Caddy in front of kamal-proxy) is a stopping point that ossifies and wants
finishing into A anyway. Take B only as a deliberately-temporary de-risking
step, not a destination.

**What changed across revisions:** v1 "keep as-is" leaned on sunk cost. v2
"staged partial migration" over-rotated — Option B is a stopping point, not a
destination, and the review's fact corrections cut both ways rather than only
favouring a move. v3–v5 land on: fix the current system's real, non-urgent
problems in place now; gate the migration on concrete events; and if it happens,
do it fully. The headline answers the retrospective plainly — Kamal would have
been the better starting point — while being modest about _now_: on mechanics
this is close to a wash, and Kamal's edge (recognisable structure, smaller
surface) is a growing-team argument, not a today-emergency.

---

## 13. References

- `docs/core/deploy.md`, `docs/core/blue-green-migrations.md`
- `docs/plans/2026-08-10-bluegreen-zero-downtime-deploy-plan.md`
- `docs/plans/2026-08-10-server-side-cleanup-scheduling-plan.md`
- `docs/plans/2026-08-28-e2e-ci-merge-gate-cd-block-plan.md`
- `infra/vps/deploy.sh`, `infra/vps/lib/*.sh`, `infra/vps/bin/*.sh`,
  `infra/vps/Caddyfile`
- `.github/workflows/cd.yml`, `.github/workflows/cleanup-fallback.yml`
- `apps/workers/src/main.ts`,
  `apps/workers/src/jobs/mailer/mailer.processor.ts`,
  `packages/queue/src/{queue-names.ts,default-job-options.ts,jobs/*.ts}`,
  `apps/workers/package.json`
- Kamal docs: <https://kamal-deploy.org> · Kamal source:
  <https://github.com/basecamp/kamal>

---

## Changelog

- **v5 (2026-08-29):** Consistency/honesty pass on round-4 review. The
  cleanup/grace mechanism, previously described three incompatible ways, is now
  one design everywhere: **old color torn down at the start of the next deploy**
  — no timer, no scheduler; `--rollback` stays a health-gated Caddy reload until
  then, cold `compose up` after. `--rollback` no longer described as "just a
  Caddy reload" (it always runs a 30s health gate + 3× smoke). Retrospective
  question ("would Kamal have been a better fit?") now answered plainly up
  front: yes, in hindsight. §10B's "costs ~80% of A / paid twice" math dropped;
  B reframed as a real checkpoint whose end state ossifies, with its one genuine
  value (incremental Kamal exposure) credited. Fourth migration trigger added (a
  deploy incident traced to a script defect). Harness "solved problem" →
  "materially closes" the gap, with the concurrency invariants it can't cover
  named. Number fixes: `cleanup_schedule.sh` is 108 (was "~80"/"~120");
  canary-specific deletion is ~55–70 lines (was "~120"); age-check is ~12
  functional lines; Option C "after" ≈ 1,500–1,600, effort ~6–9 d, risk
  low–medium; accessories "no proxy involvement" softened (they _can_ sit behind
  kamal-proxy). Added "update `deploy.md` / `blue-green-migrations.md`" to
  Option C's task list.
- **v4 (2026-08-29):** Reasoning/consistency pass. _(Effort and grace-window
  figures in this entry were revised in v5 — Option C is ~6–9 d, and there is no
  timed grace: the old color is torn down at the start of the next deploy.)_
  Headline softened from "Kamal is the better long-term shape" to "roughly a
  wash on mechanics; Kamal's edge is recognisable structure + smaller surface, a
  growing-team argument". §1.4's "every correction shrank the upside" reframed
  as cutting both ways (less urgency _and_ lower port risk). Option C's real
  costs now stated: switch-then-verify vs canary, cold rollback past a ~10-min
  grace; the test harness is a **required** part of C (effort → ~5–7 d); the
  `mailer` job needs a dedupe key before the worker window is shortened (BullMQ
  stalled-job retry ⇒ at-least-once). Defer reframed: an **OR-gated trigger**
  (churn+harness+bandwidth, _or_ a second operator/team growth, _or_ a second
  host/env) instead of a fixed 2027-Q1 date; "C-permanent is acceptable" stated.
  §10B rejection rebuilt on the durable arguments (same "not yet" gate as A; a
  stopping point) and the weak ones dropped ("paid twice", "no doc describes
  it"). Fact fixes: Kamal container retention is **count-only** in 2.12.0 (no
  ~3-day age prune — stale docs line); `-P/--skip-push` needed on the
  two-invocation role-ordering pattern; "fires `pre-deploy`/`post-deploy`" not
  "full hook set"; §5 role examples are 3-role. §10A now cites all three defer
  reasons.
- **v3 (2026-08-29):** Recommendation → "Option C now + defer + A not B".
  Corrected the false "SIGTERM handling must land first" (workers already
  drain), the "verbatim" migrate.sh port, image/role count, LOC accounting,
  `ping` payload. (Superseded by v4's honesty pass.)
- **v2 (2026-08-29):** Flipped to "staged partial migration (Option B)".
  (Superseded.)
- **v1 (2026-08-29):** "Keep the current pipeline." (Superseded — leaned on sunk
  cost, did not score alternatives.)
