# Developer setup experience spike

## Context

Triggered by a coworker (Carlos) hitting a container-crashing bug in
`docker:dev` (missing `procps`/`ps` binary in `node:26-slim`, breaking
`concurrently -k`'s `tree-kill` dependency — fixed separately this session).
That fix only stops one crash. This spike looks at the broader "new
contributor / coworker gets a working, fast local dev loop" experience to see
how much friction is structural versus one-off.

Audited: root docs, `docs/core/*`, env var files, both dev workflows
(`pnpm dev` vs `pnpm docker:dev`), both Dockerfiles, CI config, and every
`docs/plans/*.md` entry that mentions a setup gotcha. No code changed yet —
this is findings + a prioritized punchlist for a follow-up pass.

## Findings

### Onboarding path is broken at the front door

- Root has two duplicate files, `README.md` and `readme.md` (byte-identical,
  both tracked in git) — a landmine on case-sensitive filesystems and two
  places to keep in sync by hand.
- `README.md` links to `docs/README.md`, which doesn't exist. The real file is
  `docs/core/readme.md`.
- Neither root readme says how to actually run the project — no `pnpm
  install`, `pnpm dev`, `pnpm docker:dev`, `pnpm env:init`, Node version, or
  Docker requirement anywhere in them.
- `docs/core/infra.md` (which calls Docker dev "the primary, sanctioned dev
  workflow") itself links to three more paths that don't exist:
  `docker/readme.md`, `caddy/readme.md`, `docker/DEPLOY_ORACLE.md`.
- `pnpm env:init` (`scripts/init-env.ts`) is prod-only and only referenced from
  the prod deploy runbook — nothing in onboarding docs tells a new dev it
  exists, which is fine since dev doesn't need it, but nothing else fills that
  gap either.
- No `CONTRIBUTING.md`. Root `package.json`'s full script list (`dev`,
  `build`, `admin:*`, `seed:*`, etc.) is never enumerated in any doc — you have
  to open `package.json` to know `pnpm docker:dev` exists.

### Two dev workflows, no guidance on which to use

- `pnpm dev` (host, `turbo run dev --parallel`) starts only `api`+`web` — no
  Postgres, no MinIO. A new contributor following the README's stack
  description ("Next.js · NestJS · Prisma · PostgreSQL") and typing `pnpm dev`
  hits an unexplained Prisma connection failure.
- `pnpm docker:dev` is the only workflow that "just works," per
  `docs/core/infra.md`, but that claim lives in a doc unreachable from the
  broken root README link.
- Host mode requires hand-building `.env`/`.env.local` in four separate
  locations (root, `apps/api`, `apps/web`, `packages/db`) with **zero example
  template** — only one `.env.example` exists in the whole repo
  (`infra/docker/.env.example`), and it's Docker-flavored (`db:5432`,
  `api:3000` hostnames that don't work on host mode as-is).
- Confirmed locally: host-mode dev is currently wired to a native Homebrew
  Postgres with a real `RESEND_API_KEY` sitting in a gitignored, undocumented
  `apps/api/.env`.
- Two documented incidents directly caused by these workflows coexisting:
  native Postgres silently winning port 5432 ahead of the Docker one
  (`role "biasmarket" does not exist`), and a stale host-mode `nest start
  --watch` holding port 3000 and blocking `docker:dev` from starting.

### Docker inner loop is fast to break, slow to recover

- Every container start/restart reinstalls, regenerates, migrates, rebuilds,
  and reseeds before the app comes up — there's no cheap "just restart the
  process" path.
- Three separate real incidents in the last month from the same
  `concurrently -k -n ...` shell-pipeline pattern: a YAML folded-scalar bug
  that silently mangled the command, a `nest-cli.json` `deleteOutDir` race
  against `nodemon`, and now this session's `procps`/`tree-kill` crash. Same
  design keeps producing new failure modes.
- Schema changes to `packages/db/prisma/schema.prisma` don't propagate to the
  running `api` container automatically — a manual `docker compose restart
  api` is required every time, an accepted-but-unautomated gap.
- One incident (`2026-07-31-review-fixes-and-prod-reset.md`) already burned a
  coworker on exactly this repo: `ERR_MODULE_NOT_FOUND` on a fresh clone
  because seeding ran before `packages/{i18n,types,utils}` were built,
  compounded by the same coworker's `git pull` no-op'ing over locally-edited
  `docker-compose.dev.yml`, so a fix that had already shipped looked like it
  hadn't.

### CI doesn't actually catch setup regressions

- CI never touches Docker/MinIO/a real Postgres — `DATABASE_URL` is a dummy
  string purely to satisfy `prisma generate`'s schema validation, no
  `migrate deploy`, no seed.
- **CI's "Lint" step for `api` and `web` is a complete no-op** — neither
  package defines a `lint` script, so `turbo run lint --filter=...` runs 0
  tasks and exits green. This is already known and intentionally accepted
  (see `docs/plans/2026-08-03-lint-formatting-spike.md`, blocked on
  TypeScript 7 / ESLint ecosystem support), not new, but worth folding into
  this punchlist since it's part of the same "green CI, false confidence"
  problem space.

### Silent toolchain traps

- No `.nvmrc`, `.node-version`, `engines` field, or Volta/asdf/mise config
  anywhere. Node 26 consistency across Dockerfiles/CI/`@types/node` is
  currently emergent (five separate files happen to agree), not enforced —
  nothing warns a contributor running an older/newer Node locally.
- `packageManager: pnpm@10.11.0` is pinned but not hardened: a documented
  incident (`2026-07-19-pnpm-lockfile-corruption.md`) shows a newer global
  `pnpm` on `$PATH` silently corrupting `pnpm-lock.yaml` on install, with the
  only fix being per-developer discipline (`npx pnpm@10.11.0 install`) that
  isn't mentioned anywhere a new contributor would see it.
- No `.editorconfig`, no `.vscode/`, no devcontainer, no root ESLint/Prettier
  config — only `apps/api/.prettierrc` exists, nothing shared workspace-wide.

### Where the knowledge already lives

Every gotcha above is already written down somewhere in `docs/plans/` (each
plan doc explicitly frames itself as capturing this so "the next person
shouldn't have to rediscover" it) — but `docs/plans/` is a changelog, not a
backlog or onboarding doc, and none of it is linked from anywhere a new
contributor would look first.

## Decisions

Priority order, and what actually happened when this pass executed it (see
"What changed" below):

1. **Fix the front door.** Done, with one correction: `README.md`/`readme.md`
   and `CLAUDE.md`/`claude.md` are not duplicate files — this machine's
   filesystem (APFS, case-insensitive) was resolving both spellings to the
   same git-tracked (lowercase-named) file, making them look like two files
   when inspected with `ls`/`Read`. The real bug was the *case itself*:
   the repo had `readme.md`/`claude.md` tracked in git, which is invisible
   here but would break tools (and GitHub's own README auto-render, and any
   case-sensitive Linux clone/CI runner) expecting the conventional
   `README.md`/`CLAUDE.md`. Fixed via `git mv` case-only rename, not deletion.
   Also fixed: the `docs/README.md` dead link, the three dead links in
   `docs/core/infra.md`, a broken relative link in `docs/core/deploy.md`, and
   — found while fixing the above, same root cause (stale `docs/spec/*` paths
   from before a rename to `docs/core/*`) — six more stale references across
   `CLAUDE.md` itself and one in an `apps/api` source comment. Added a
   "Getting started" section to `README.md` pointing at `pnpm docker:dev` as
   the one documented path.
2. **Surface the known gotchas.** Done — added a "Known issues" section to
   `docs/core/infra.md` covering the pnpm lockfile corruption, the native-vs-
   Docker Postgres port collision, and the schema-change-needs-restart gap,
   each linking back to the plan doc with the full root-cause writeup.
3. **Harden the pnpm pin — reclassified, not done as originally framed.**
   Re-reading `docs/plans/2026-07-19-pnpm-lockfile-corruption.md` in full
   during this pass showed this was already investigated and its "Decisions"
   section explicitly concluded **no repo-side workaround is possible**: both
   `devEngines.packageManager` and an `.npmrc` `manage-package-manager-versions`
   setting were tried and ruled out, because the corruption happens inside
   pnpm's own version-downgrade path (upstream bug
   [pnpm/pnpm#11264](https://github.com/pnpm/pnpm/issues/11264)) before any
   repo config is consulted. Re-attempting that here would have contradicted
   already-documented findings for no benefit. Folded into item 2 instead —
   documenting the trap and its one working fix (`npx pnpm@10.11.0 install`)
   prominently is the actual mitigation available.
4. **Decide the env-file story for host-mode dev.** Done — retired as a
   supported path rather than building out four new `.env.example` templates.
   `README.md` and `docs/core/infra.md` now both say `pnpm dev` (host mode) is
   unsupported and to use `pnpm docker:dev` unless there's a specific reason
   not to, rather than presenting them as co-equal options.
5. **Everything else** (Docker inner-loop rebuild speed, CI/local parity, the
   already-tracked lint no-op) — left as-is, per the original call that these
   are real but lower-severity and each is a bigger, riskier change than a
   docs/config pass (rewriting the Docker command chain, changing CI, or
   picking a TypeScript-7-compatible lint stack). One cheap item from this
   bucket, a root `.editorconfig`, was added since it carried no risk.

## What changed

**Renamed** (case-only, via `git mv` — content preserved):

- `readme.md` → `README.md`
- `claude.md` → `CLAUDE.md`

**Edited:**

- `README.md` — added a "Getting started" section (`pnpm docker:dev` as the
  one sanctioned command, prereqs, pnpm-mismatch callout), fixed the dead
  `docs/README.md` link to point at `docs/core/`.
- `CLAUDE.md` — fixed six stale `docs/spec/*.md` / `infra/docker/DEPLOY_ORACLE.md`
  references to their actual current paths under `docs/core/`.
- `docs/core/infra.md` — fixed three dead links (`docker/readme.md` →
  `readme.md`, `caddy/readme.md` → `caddy.md`, `docker/DEPLOY_ORACLE.md` →
  `deploy.md`); added a "Known issues" section (pnpm lockfile corruption,
  Postgres port collision, schema-change restart gotcha); marked host-mode
  `pnpm dev` explicitly unsupported.
- `docs/core/deploy.md` — fixed a broken relative link and a stale
  `docs/spec/roadmap.md` reference.
- `apps/api/src/modules/customer-auth/origin.guard.ts` — fixed a stale
  `infra/docker/DEPLOY_ORACLE.md` path in a comment.

**New:**

- `.editorconfig` — root-level, matches the indent/charset/EOL conventions
  already implied by `apps/api/.prettierrc` (2-space, LF).
- `docs/plans/2026-08-03-dev-setup-spike.md` — this doc.

**Deliberately not done** (see Decisions §3 and §5): no `devEngines`/`.npmrc`
pnpm-version enforcement (already ruled out upstream), no changes to the
Docker inner-loop rebuild chain, CI, or lint tooling.

## Verification

Static repo inspection (root/docs readmes, `.env.example` files, both
Dockerfiles, `docker-compose.dev.yml`, `.github/workflows/ci.yml`,
`docs/plans/*.md` for prior incidents), plus a repo-wide grep after editing to
confirm no remaining dead links (`docs/README`, `docs/spec`, `caddy/readme`,
`docker/readme`, `DEPLOY_ORACLE`) in any live `.md`/`.ts`/`.tsx` file outside
`docs/plans/` (left untouched there — it's a changelog of past state, not
meant to be retroactively edited) and outside build output
(`node_modules`, `.next`, `dist`). `git status` confirmed the two renames
tracked cleanly as renames, not delete+add. No servers or containers started —
this pass didn't touch anything that needs a running stack to verify.
