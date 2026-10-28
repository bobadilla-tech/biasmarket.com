# Implementation handoff: buyer page for "Pedido asistido" (#268) and leftovers

Paste this into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com`. Written for: the implementation agent.
The plan it executes is
`.artifacts/2026/10/20261027--assisted-order-buyer-page/plan.md` (read it fully
first; it is the source of truth, this prompt is the entry point). The review
history is in `review-log.md` next to it.

## Mission

Make the private link that sellers already send,
`/es/store/{slug}/pedido/{token}`, open a working, private, mobile-first buyer
page (issue #268), and land the leftovers: checkout race #333, token-safe
logging (web Sentry scrub, Caddy error logs, #340), seller "other orders of the
same number" list, and #337. Deliver as small independent PRs against `main`. Do
not merge, push to main, or post on GitHub without the user's explicit approval.

## Context (verified on origin/main `d88be078`, re-check `git log origin/main`)

- Seller-side assisted-order stack is merged (#324-#331, #344). Also merged
  since the planning started: #321 (storefront redesign; `ContactSellerButton`
  now takes `message`/`label`/`icon`), #343 (`trust proxy` 1 + Caddy trusted
  proxies), #345 (tracking + private package photo; public DTO has
  `trackingNumber`, `trackingUrl`, `packedPhotoAvailable`), #347 (payment rules
  and voids; public payments have `voidedAt`). #258 and Epic #253 are already
  closed by others.
- `GET /public/orders/:token` exists (`public-order-events.controller.ts`):
  unknown and revoked tokens give an identical 404, the first valid read stamps
  `linkFirstOpenedAt` (fail-closed since #344), `no-store`/`no-referrer`
  headers. There is no web route yet. The generated SDK already has
  `apiClient.publicOrders.getByToken(token, options?)`.
- Hosted CI runs only for PRs whose base is `main` (`ci.yml:10-11`); the handoff
  of the previous session claimed otherwise. Do not stack branches.
- Probed facts (details and probe code paths in plan.md section 2): the checkout
  race returns 201 + 500 and fails on `BuyerAccount_phone_key` and
  `CustomerStoreLink_buyerAccountId_storeId_key` (not only Customer); Caddy's
  default error logger writes the token (request URI and `Referer`) when an
  upstream is down; a deep-walk Sentry scrub must not `JSON.stringify` a
  transaction event as is (`sdkProcessingMetadata` is circular); the shared SDK
  mutator ignores a per-call `credentials`.

## Decisions already made (do not re-litigate; details in plan.md section 3)

- D1: the browser fetches the order, the server never does; `page.tsx` makes no
  API/fetch call. Link-preview bots (no JS) therefore never stamp first-open.
- D2: unknown, revoked, rotated and wrong-slug links render one identical
  "invalid link" state (UX guard, not access control); unknown slug also renders
  it (no `notFound()`).
- D3: reuse `FulfillmentTimeline`, `ContactSellerButton` (with
  `message`/`label`) and the existing checkout `PaymentMethodDetails` (widen its
  prop type); no new allow-list renderer; do not reuse `AccountOrderDetail` or
  `OrderStatusBadge`.
- D4: API computes `orderNumber` (last 4 chars, uppercase, no `#`); no new utils
  package.
- PR3 uses `Refs #268`, never `Closes` (the user closes it after a manual phone
  check).

## Reviewed plan: PRs, branches, bases (all base = `main`; see plan.md sections 4-6)

Build order (merge order differs, see plan.md section 5):

1. **PR4** `fix/caddy-token-logs` (Refs #340): global
   `log { format filter ... }` in `infra/vps/Caddyfile` (snippet in plan 4.3),
   `ensure_caddyfile_current` helper in `infra/vps/lib/caddy.sh` called in
   `cmd_deploy` after `assert_production_topology` (hash compare, validate the
   NEW file via `docker cp`, force-recreate Caddy only when hashes differ; never
   in canary/rollback), docs in `docs/core/deploy.md`. First reproduce the stale
   single-file-mount behaviour on a Linux runner/VM; if nobody can, ship the
   guard anyway and mark the evidence unverified.
2. **PR-S** `fix/web-scrub-order-token` (Refs #268, #279):
   `buildSentryOptions()` extraction for client and server, deep-walk scrub (not
   on the raw transaction event), fake-transport tests that assert a
   `transaction` envelope item arrived.
3. **PR-A** `feat/public-order-dto-fields` (Refs #268): `customerAlias`
   (sanitised), `orderNumber`, `createdAt` on the public DTO; token format guard
   `/^[A-Za-z0-9_-]{20,128}$/` returning the same 404; update the stale comment
   in `public-order.service.ts`; regenerate openapi + metadata + SDK.
4. **PR3** `feat/public-order-page` (Refs #268): route +
   `features/public-order/`, headers, robots, i18n, `packages/types/http.ts`
   one-liner (`init.credentials ?? config.credentials ?? "include"`), curl
   header check in `scripts/ci/web-e2e.sh`, Playwright invalid-state spec, hide
   `orderNumber`/`createdAt` when absent (version skew). Open as draft until
   PR-S, PR4 (deployed) and PR-A are on main.
5. **PR1** `fix/checkout-customer-race` (Closes #333): per-phone advisory lock
   at the top of `findOrCreateCustomer`, `INSERT ... ON CONFLICT DO NOTHING` +
   re-find for BuyerAccount, link and Customer (explicit `id`), typed
   `updateMany` guards for the Google attach and `change-phone`, guest result
   when the attach is lost, `upsertStoreContact` reuse; e2e (a)-(g) and
   unit-spec rewrite.
6. Phase 2 (can be cut, independent): **PR5** `feat/order-related-orders` (Refs
   #265) and **PR6** `fix/hide-ghost-customers` (Closes #337).

## Review findings to preserve (the traps; full table in review-log.md)

- Never put try/catch around statements inside the transaction (Postgres aborts
  it, 25P02).
- Lock order: pickup point -> courier -> phone advisory lock -> Customer step ->
  stock -> Order insert; never lock the Customer row with `FOR UPDATE`.
- A conditional `UPDATE ... NOT EXISTS` is not race-safe under READ COMMITTED
  (probed).
- Render `isError` before `data` (React Query keeps old data after a failed
  refetch); `gcTime: 0`; slug check inside `queryFn`.
- Do not sum `payments` client-side; use `paidAmount`/`pendingAmount`; voided
  rows say "Anulado".
- `depositPercent` is not the order's adelanto; use
  `requiredAmount`/`totalAmount`/`pendingAmount`.
- The page renders no DTO-sourced `href` (not `trackingUrl`), no packed photo,
  no account invitation.
- Deploy PR-A before PR3; do not roll back PR-S, PR4 or #343 while PR3 is live.
- Format only touched files (never `prettier --write` a directory).

## Verification (labelled PLANNED: nothing below has been run for the implementation)

Per PR, run each as a separate invocation: `pnpm --filter <pkg> test`, `lint`,
`typecheck`; `pnpm --filter api test:e2e` (own Postgres/Redis on non-default
ports, workers app with `MAIL_DRIVER=file` on its own `PORT`; storage-dependent
specs need MinIO and fail locally with ECONNREFUSED :9000, which is
environmental); `pnpm turbo run build --filter=api` and `pnpm db:generate`
before e2e/vitest that import workspace packages. For DTO changes:
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`,
then `bash scripts/ci/check-openapi-drift.sh` (env from
`scripts/ci/e2e.env.example`) must exit 0, and commit `apps/api/src/metadata.ts`
if `typecheck` regenerates it. PR3: `next build`, the `next start` header curl
block, the Playwright spec, and the manual no-JS `curl` leaves
`linkFirstOpenedAt` null on a seeded link. PR4: `shellcheck -x`,
`caddy validate`/`adapt`, the 503 probe with no token in container logs.

## Acceptance criteria

plan.md section 9 (items 1-10 and 1b), each tagged [CI] or [manual].

## Constraints and blockers

- Do not push to `main`, merge, close issues, comment on GitHub, or deploy.
  GitHub writes (only after the user approves) need
  `env -u GITHUB_TOKEN gh ...`. Review comments get a reply + resolve citing the
  commit.
- PR4 changes production deploy tooling: open it, but do not merge or deploy it
  without explicit approval (Q10). Ask the user first whether #343's Caddyfile
  change is live on the VPS (compare `sha256sum ~/biasmarket/Caddyfile` with
  `docker compose exec caddy sha256sum /etc/caddy/Caddyfile`).
- Open questions and the default to use if the user does not answer: Q1
  browser-only fetch (D1); Q3 do not close/comment on any issue; Q4 no tracking
  issue for the related-orders list; Q5 keep PR5/PR6 as Phase 2; Q6 leave the
  public throttle unchanged; Q7 rely on `no-store`, ask whether a Cloudflare
  cache-everything rule exists; Q8 `Refs #268`; Q10 as above; Q11 keep
  `line1`/`reference` and the sanitised alias in the DTO.
- Stop and ask if: the public DTO or controller on main changed in a way that
  breaks the plan; a probe contradicts a plan claim; PR4's stale-mount behaviour
  cannot be reproduced AND the guard would change deploy behaviour beyond a
  no-op; any step needs a schema migration.
- Do not touch: `packages/db` schema, `packageManager` pin, `caddy.sh` generated
  `active/*.caddy` logic, the first-open stamping contract of
  `GET /public/orders/:token`.
- Planning leftovers to ignore: nothing in the planning scratch worktree is
  meant for a PR.

## Stack base policy

No stacked branches: every PR targets `main` (hosted CI only runs there). PR3
may be developed locally on a branch containing PR-A's commits, but is opened as
a draft only after PR-A has merged, rebased on main. Never push to `main`.
Retarget command if a PR was opened against the wrong base:
`env -u GITHUB_TOKEN gh pr edit <n> --base main` (ask first).

## PR instructions

Open the PRs in the build order above with `gh pr create` (ask before using gh
writes), using the repo's PR format (check `.github/pull_request_template.md` if
present): summary, what was verified (only what you ran), "Blocked by" list for
PR3, the #268 checkbox-to-evidence table for PR3, the note about extra CI
fan-out from `packages/types`, and the Closes/Refs line from the plan. Commit
trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR bodies
end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do
not merge.

## First action

Read `plan.md` fully, `CLAUDE.md`, `apps/web/AGENTS.md`, `.artifacts/AGENTS.md`.
Then `git fetch`, create a fresh worktree off `origin/main` under your
scratchpad (not the user's checkout), run plan step 0, and tell the user which
of Q10 (is #343 live?) needs an answer. Start with PR4 and PR1 (PR1 is
independent), report, then continue.
