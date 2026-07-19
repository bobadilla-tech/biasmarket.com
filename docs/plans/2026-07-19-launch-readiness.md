# MVP launch readiness: Oracle deploy, rebrand, Vitest migration, health check

## Context

Goal for the session: get the MVP onto a public URL on Oracle Cloud so pages
could go on Google and the link could be shared — "basic/insecure is fine to
start." That single ask expanded into four connected threads over the session:
fixing the one real deploy blocker, rebranding the repo to the real product
identity (Bias Market / biasmarket.com), replacing Jest with Vitest+SWC across
the app, and wiring up production subdomain routing with an actual health check.
Each thread surfaced its own pre-existing bug along the way — none of them were
introduced by this session's changes, but all three would have blocked a first
deploy or silently broken monitoring if left as found.

## 1. Oracle Cloud deploy readiness

The prod Docker Compose stack (`infra/docker/docker-compose.yml` + Caddy) was
already well-built, but `infra/docker/api.Dockerfile`'s `CMD` was a bare
`node apps/api/dist/main` — no `prisma migrate deploy` step. A fresh Oracle VM
would boot against an empty Postgres schema and every DB query would fail. Dev's
compose already ran migrations via a command override; prod never did.

**Decisions:**

- Moved the migration step into the image itself
  (`CMD ["sh","-c","pnpm --filter @biasmarket/db exec prisma migrate deploy && exec node apps/api/dist/main"]`)
  so a redeploy can never forget it — not a documented manual step.
- `prisma` (the CLI) was a `packages/db` devDependency; prod's
  `pnpm install --prod` prunes devDependencies, so the CLI would go missing from
  the exact image that needs to run migrations. Moved to `dependencies`.
- Caddyfile had `barristore.example.com` hardcoded — replaced with an
  obviously-fake placeholder plus a comment pointing at the deploy doc, so it
  can't be missed before `docker compose up`.
- Wrote `infra/docker/DEPLOY_ORACLE.md`: VM provisioning (reserved IP, OCI
  Security List), the OCI iptables gotcha (ports open in the console ≠ open on
  the box — the classic first-Oracle-deploy trap), Docker install, DNS, secrets,
  verify steps, day-2 ops. Documented `@nestjs/throttler` being
  installed-but-unwired, no CSRF/helmet, no env validation as known limitations
  rather than fixing them — matches the "basic is fine" bar.

**Verification:** built the api image, ran it against a real local Postgres —
confirmed migrations applied and Nest booted cleanly before trusting the fix.

## 2. Rebrand: BarriStore → Bias Market (biasmarket.com)

**Decisions** (each confirmed with the user before the mechanical rename):

- pnpm workspace scope `@barristore/*` → `@biasmarket/*`.
- Brand text `BarriStore` → `Bias Market` everywhere, including dated
  `docs/plans/*` and `docs/business/*` records (user's call — full consistency
  over preserving historical wording).
- Infra internals renamed too since nothing was deployed yet: Postgres user/db,
  Docker Compose project names, container naming.
- Node 24 → 26 across all four Dockerfiles and CI's `NODE_VERSION`;
  `@types/node` → `^26` everywhere.

**Bugs found and fixed as a direct consequence of the bump** (not pre-existing,
but not part of the rename/bump itself either):

- Node 26 no longer bundles Corepack — `corepack enable pnpm` started failing
  with `corepack: not found` in every Dockerfile. Fixed by adding
  `npm install -g corepack@latest` before `corepack enable` (npm itself is still
  bundled).
- A concurrent Prisma 7 upgrade (landing in the same window, elsewhere) made
  `prisma generate` require a resolvable `DATABASE_URL` even at build time with
  no real connection. Broke both local `pnpm turbo run typecheck` and the Docker
  build. Fixed with a build-time dummy `DATABASE_URL` in `api.Dockerfile` plus
  `"globalEnv": ["DATABASE_URL"]` in `turbo.json` (Turbo 2.x defaults to strict
  env mode and was silently stripping the var from child tasks) — same dummy-URL
  pattern CI already used for the identical reason.

Root `README.md`'s stale "Pre-code — spec stage" status line updated to match
reality.

**Verification:** `pnpm turbo run typecheck` green across all 7 packages;
rebuilt and re-ran the api Docker image end-to-end against real Postgres.

## 3. Test runner migration: Jest → Vitest + SWC

Ask: move tests to Vitest with SWC, per NestJS's own Vitest+`unplugin-swc` docs.

**Decisions:**

- `apps/api`: Jest+ts-jest → Vitest+`unplugin-swc`. Added `.swcrc` with
  `decorators`/`decoratorMetadata` enabled — without it, Nest's DI silently
  breaks (constructor param types stop resolving). Split into `vitest.config.ts`
  (unit) and `vitest.config.e2e.ts` (e2e), mirroring the old Jest split exactly
  — unit config keeps the same `@biasmarket/db` → `test/mocks/biasmarket-db.ts`
  alias Jest used (real package is ESM-only, unit tests mock the Prisma boundary
  anyway), e2e config doesn't alias it (boots the real `AppModule`). Five spec
  files converted `jest.mock`/`jest.fn`/`jest.Mock` → `vi.mock`/`vi.fn`/`Mock`
  (explicit imports, not relying on ambient globals for the mock API — only
  `describe`/`it`/`expect` stay ambient via `vitest/globals` in tsconfig).
- `apps/web`: had zero test infrastructure. Bootstrapped fresh per Next.js's own
  Vitest guide (jsdom + React Testing Library + `vite-tsconfig-paths`), one
  smoke test against the real root page, wired into CI's `web` job (which
  previously had no `Test` step at all).
- Left `packages/utils`'s existing zero-config Vitest setup untouched — it's a
  pure function with no decorators, doesn't need SWC.

**Bug found, not fixed:** running the (previously never-executed-in-CI) e2e
suite for the first time surfaced `GET /` returning 401 instead of the expected
200/"Hello World!". Confirmed this was pre-existing behavior drift, not a
migration regression — a clean 401 means the auth guard is working correctly
(SWC decorator-metadata breakage would look like a crash or a guard failing
open, not a well-formed 401). The root route had no `@Public()`, and e2e was
never wired into CI, so nobody had caught it. Flagged for a product decision
rather than guessed at — resolved in thread 4.

**Verification:** 27 unit tests passing, typecheck clean for both apps.

## 4. Public root redirect + health endpoint + subdomain deploy

Three follow-up asks landed together: fix the 401 found in thread 3 (root should
be unauthenticated and redirect to the main site, not serve API content), add a
health endpoint reporting DB status, and switch the prod deploy from
single-domain path routing to `api.biasmarket.com` / `biasmarket.com`
subdomains.

**Decisions:**

- `AppController`'s root route now uses `@AllowAnonymous()` (the non-deprecated
  replacement for the library's `@Public()`) and `@Redirect()`, returning
  `{ url: process.env.WEB_URL, statusCode: 302 }`. The now-dead
  `AppService`/`getHello()` was removed rather than left unused.
- New `GET /api/health` (public): checks `prisma.$queryRaw`SELECT 1``, returns
  `{status:'ok',db:'ok'}` on success or throws `ServiceUnavailableException`
  (503) on failure — deliberately basic per the ask, no separate health module
  abstraction beyond a thin controller.
- Docker healthchecks (dev and prod compose) repointed from the bare `/api`
  prefix to `/api/health`.
- `infra/caddy/Caddyfile` simplified from single-domain path-splitting
  (`handle /api/* {...}`) to two plain domain blocks — `api.biasmarket.com` →
  `api`, `biasmarket.com` → `web` — each getting its own automatic cert. No path
  logic left for Caddy to own.
- `.env.example` comments and `DEPLOY_ORACLE.md` updated for the two-domain
  scheme: two DNS A records instead of one, `BETTER_AUTH_URL` →
  `https://api.biasmarket.com`, `WEB_URL`/`NEXT_PUBLIC_API_URL` split correctly
  per subdomain, verify steps check both domains plus `/health`.

**Bug found and fixed during verification, unrelated to this thread's own
changes:** `@swc/core` resolved to a build published hours earlier; pnpm's
supply-chain minimum-release-age policy correctly rejected it mid-install.
Pinned to `1.15.43` (a known-stable build, not a floating range) instead of
waiting out the policy window.

**Verification:** 29 unit tests (2 new for the health controller), both e2e
tests passing against a real Postgres (redirect status/Location header, health
endpoint body), both compose files validated with `docker compose config`,
typecheck clean for both apps.

## Follow-ups (not in scope this session)

- Rate limiting (`@nestjs/throttler` installed, never wired into `AppModule`),
  CSRF, helmet, and startup env-var validation are all still missing —
  documented as known limitations in `DEPLOY_ORACLE.md`, matches the session's
  explicit "basic is fine to start" bar.
- e2e suite still isn't wired into CI — needs a real Postgres service container
  in the workflow.
- A separate, concurrent session in this same repo handled a TypeScript 7 bump
  and diagnosed a local `pnpm` lockfile-corruption bug (Homebrew's pnpm 11 shim
  self-pinning against the project's pinned 10.11.0) — see
  [2026-07-19-typescript-7.md](2026-07-19-typescript-7.md) and
  [2026-07-19-pnpm-lockfile-corruption.md](2026-07-19-pnpm-lockfile-corruption.md).
  That corruption produced several transient `ERR_PNPM_BROKEN_LOCKFILE` /
  "command not found" failures during this session's own verification passes;
  all were confirmed transient and resolved on retry once the other session's
  fix landed.
