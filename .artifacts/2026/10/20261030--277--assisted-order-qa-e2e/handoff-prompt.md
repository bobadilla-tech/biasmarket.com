# Implementation handoff: #277 F1 — assisted-order QA end to end (CI-only)

## Mission

Add automated, CI-run coverage for the assisted-order flow: three stacked PRs
(API e2e gaps; Playwright foundation + golden path; Playwright invitations +
in-app browsers). Tests, CI wiring and docs only. **No production code.** There
are no real users, so no manual checks and no pilot: do not try to do them.

## Context

- Ticket: #277 (child of epic #256). All dependency issues are closed/merged.
  PRs must say `Refs #277`, never `Closes #277` (real-phone checks and the
  KoreaLexa pilot stay open for a human).
- Full reviewed plan:
  `.artifacts/2026/10/20261030--277--assisted-order-qa-e2e/plan.md` (read it end
  to end, especially §2.1, §2.2, §3.2–3.4, §5, §8). Review history:
  `review-log.md` in the same folder.
- Repo rules (CLAUDE.md): pnpm only; ESM only; relative imports in `apps/api`
  use explicit `.js` extensions; web never imports `packages/db`/Prisma (seed
  only through the seller API in web e2e); every tenant query filters by
  `storeId`.
- Today: `apps/web/e2e` has only unauthenticated a11y specs; `apps/api/test` has
  rich assisted-order e2e but misses a chained HTTP golden path, void e2e,
  PARTIALLY_PAID on assisted orders, spaced phone at create, no-payment-methods
  and expired public views, cancelled/expired invite absence, receipt invite
  moment.

## Decisions already made

- Layers: API e2e is authoritative for rules; Playwright covers user-visible
  journeys at 375 px in Spanish.
- Google is simulated with `scripts/ci/google-stub.mjs`, a Node `--import`
  preload that wraps `globalThis.fetch`, loaded only on the API exec line in
  `scripts/ci/web-e2e.sh` with `E2E_GOOGLE_STUB=1`; fake
  `GOOGLE_CLIENT_ID/SECRET` (`*.invalid`) on that process only; never in
  `e2e.env.example`. Playwright intercepts `accounts.google.com` and 302s to the
  real API callback using only the intercepted `state`.
- One host for the CI stack (default `127.0.0.1`, fallback `localhost`) so
  `SameSite=Lax` cookies work (plan §3.2).
- Flows project: `retries: 0`, 375×812, every test self-contained (own throwaway
  store/products via seller API, unique phone, unique Google code).
- WhatsApp is not tested (listed as not covered). Job name `Web E2E (a11y)`
  stays. Web E2E timeout 25 → 35 min; Playwright `globalTimeout` ~20 min.

## Reviewed plan (ordered steps, one PR per slice)

Branches (create from `origin/main` after `git fetch origin`; the user's
checkout may be on another branch: use a worktree and do not touch their
uncommitted work):

1. **PR-A** `test/f1-api-e2e-gaps` — base `main`. New
   `apps/api/test/assisted-order-journey.e2e-spec.ts` (HTTP chain create → open
   → proof → approve → `PATCH fulfillment` → receipt → claim with stub identity
   → other-device read; timeline summary vs full; notices don't change token)
   and new `it`s: void endpoint; PARTIALLY_PAID; `987 654 321` /
   `+51 987 654 321`; no payment methods public view; expired order (backdate
   `expiresAt` via Prisma, `POST /internal/orders/expire-sweep` once per file
   with the internal jobs secret header, then public GET); receipt-confirmation
   invite moment; no invite for cancelled/expired; 403 (foreign `storeId`) and
   404 (own `storeId`, foreign `orderId`) isolation; public DTO leak checks.
   Sign in once per file.
2. **PR-B** `test/f1-web-foundation-golden-path` — base `main`. Commit 1 = spike
   (plan §3.2 + ⚑ list in §2.2). Then config projects, `auth.setup.ts`, helpers,
   Google stub (+ Hygiene steps and grep guards), `web-e2e.sh`, ci.yml (filter,
   timeout, Hygiene), `.gitignore`, `docs/core/ci.md` Web E2E section,
   `golden-path.spec.ts`, `edge-cases.spec.ts`.
3. **PR-C** `test/f1-web-invites-in-app` — base PR-B branch.
   `invitations.spec.ts`, `in-app-browsers.spec.ts`
   (Instagram/Twitter/Facebook), one G1 test, claim-error redirect check.

PR-A and PR-B are independent; build in separate worktrees.

## Review findings to preserve

- Order of UI operations is forced: buyer proof (only while ORDERING) → seller
  approves via "Aprobar" **inside "Historial de pagos"** → seller "Marcar En
  camino" from the orders **table row** (8 s undo; wait for the PATCH) → buyer
  reload → "Ya lo recibí" → "Guardar con Google". Web path needs IN_TRANSIT
  only.
- `bm_claim` has path `/api/account/google`: use unfiltered `context.cookies()`.
- Negative assertions only after a positive marker (hydration effects).
- In-app test needs a partial validated payment; banner case needs `firstSeen`.
- Rate limits are per IP and shared: respect plan §8 table; one claim in PR-B.
- Traces/reports are CI artifacts: acceptable only because all data is
  disposable; never `trace:'on'`/`video:'on'`; keep `.auth` out of upload paths.
- Click "Crear pedido" once; ≤ 5 distinct phones per store per 10 min.

## Verification (planned unless you ran it)

- PR-A: `bash scripts/ci/e2e.sh` (needs Docker) or the CI `E2E (API)` job;
  `pnpm --filter api test`; `pnpm --filter api typecheck`;
  `pnpm --filter api lint`; `git diff --stat origin/main -- apps/api/src` empty.
- PR-B/C: `pnpm --filter web exec playwright test --list` (a11y projects list no
  new tests); `pnpm --filter web typecheck`; `pnpm --filter web lint`;
  `pnpm fix`; Hygiene commands from plan §3.4 incl. the git-grep guards run
  locally; CI `Web E2E (a11y)` green and **not skipped**; once,
  `--repeat-each=3 --workers=1 --project=flows` (record in PR); record per-phase
  durations and the headroom (≥ 5 min).
- Never claim a test passed unless you ran it or saw it in CI.

## Acceptance criteria

Plan §9 verbatim: CI Success green with relevant jobs running; original three
projects unchanged; every §7 row has a named test with verified `file:line`;
production code untouched; stub inert without `E2E_GOOGLE_STUB=1`; no `GOOGLE_*`
in env examples/deploy files; `docs/core/ci.md` updated; `--repeat-each=3`
recorded; #277 left open with the "not covered" list in each PR description.

## Constraints and blockers

- Do not change `apps/api/src`, `packages/db`,
  `apps/web/app|features|components`. **Stop and ask** if the spike or a ⚑ item
  (esp. 404-vs-403/200, cookies on the chosen host, stub interception) shows
  production must change.
- Do not edit the `packageManager` pin, `e2e.env.example` (no `GOOGLE_*`), or
  the check-ci-success job names.
- Defaults if the user doesn't answer: don't close #277; don't add WhatsApp to
  the in-app list; host `127.0.0.1`; throwaway stores (no seed mutation).
- Don't stash/reset/stage others' work. Don't merge PRs.

## Stack base policy

PR-A base `main`; PR-B base `main`; PR-C base the PR-B branch. Never push to
`main`. CI runs on stacked PRs but each web/api job only runs if the PR's paths
match its filter: check the run to confirm `Web E2E` / `E2E (API)` were not
skipped. Retarget after PR-B merges: `gh pr edit <PR-C> --base main`.

## PR instructions

Open PR-A, PR-B, PR-C in order using the repo PR format (Spanish or English as
the repo's recent PRs do); each description lists: what it covers, the §7 rows
it satisfies with verified `file:line`, the "not covered" list, verification
run, `Refs #277`. End PR bodies with the attribution line given in the session's
system reminder. Do not merge.

## First action

Read `plan.md` fully; `git fetch origin`; `git status`; create worktrees from
`origin/main`; record a baseline `playwright test --list` and Web E2E duration;
then start PR-B step 0 (spike) and PR-A in parallel.
