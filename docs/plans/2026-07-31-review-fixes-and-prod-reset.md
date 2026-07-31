# Code-review fixes + prod redeploy research + DB reset runbook

## Context

A code review of the buyer-accounts/email work
(`2026-07-31-buyer-accounts-email-confirmation.md`,
`2026-07-31-resend-mailer-signup-verification-payment-emails.md`) left a set of
inline and nitpick findings. Each was verified against current code and, where
relevant, against better-auth's actual source (`node_modules/better-auth`)
before touching anything — several findings referenced APIs that don't exist as
described, or flagged behavior that's already correct by design.

Separately: prod hadn't redeployed since `795130e`, and since it currently only
has seed/test accounts, the ask was to wipe it and start from an empty DB,
dropping the backfill scripts that only existed to migrate pre-wipe legacy data.

## Findings: fixed

- **`customer-account.service.ts` — account-hijack via phone match (most
  serious).** `findOrCreateCustomer` matched only on `(storeId, phone)` and,
  whenever the checkout's submitted email differed from what was on file,
  unconditionally overwrote it and reset `emailVerified: false` — with no proof
  of ownership. Knowing someone's phone number (far more casually shared than an
  email) was enough to reset a verified buyer's email to an attacker's, or link
  a fresh order to an existing `customerId` and read that phone's order history
  via `/account/confirm`. Fixed: a differing email now returns `customer: null`
  and leaves the existing row completely untouched — the order just falls back
  to a guest order, silently, so the fix itself can't become a new signal.
  Return type is now `customer: Customer | null`.
- **`create-order.usecase.ts` — customer lookup outside the order transaction.**
  `findOrCreateCustomer` ran on the bare `PrismaService` before `$transaction`;
  if order creation then failed, the customer create/update had already
  committed with nothing to roll it back. Fixed: moved inside
  `$transaction(async (tx) => ...)`, `findOrCreateCustomer` now takes the Prisma
  client (`tx` or `PrismaService`) as its first param.
- **`review-payment.usecase.ts` — double-processing race.** The status write was
  a plain `update` with no guard on the status it was read at — two concurrent
  `PATCH .../review` calls (double-click, retry) could both pass the in-memory
  transition check and both write, duplicating the email and, worse,
  double-decrementing stock. Fixed with a proportional guard scoped to this file
  only (the shared `OrderRepository.saveStatus` and its other two callers are
  untouched): the status write is now
  `tx.order.updateMany({ where: { id, paymentStatus: <status it was read at> }, ... })`;
  `count === 0` throws `ConflictException` before any stock mutation or email
  send. Skipped the outbox-pattern/idempotency-key version of this finding — no
  outbox infra exists anywhere in this repo, and the guard already eliminates
  the actual bad outcome directly.
- **`auth.config.ts` — signup blocked on `mailer.send`.** Confirmed in
  better-auth's `sign-up.mjs`: `sendVerificationEmail` is only backgrounded when
  `advanced.backgroundTasks.handler` is configured; we never set it, so every
  signup awaited the Resend call inline. Fixed by adding that handler —
  better-auth's own extension point for this, not a queue we built:
  ```ts
  advanced: { backgroundTasks: { handler: (p) => p.catch((err) => logger.error(...)) } }
  ```
- **`auth.config.ts` — `customSyntheticUser` for admin fields.** On a
  duplicate-email signup, better-auth returns a synthetic user built from the
  output schema's `defaultValue`s (`db/schema.mjs`'s `buildSyntheticUserOutput`,
  explicitly documented there as anti-enumeration design). The admin plugin's
  `role` field (`plugins/admin/schema.mjs`) has no schema-level `defaultValue` —
  the real `'seller'` default is applied by a DB hook at creation, not the
  schema — so a synthetic response leaked `role: null` where a genuine signup
  has `role: 'seller'`: a field-level email-enumeration side channel via the raw
  `/api/auth/sign-up/email` endpoint (not exploitable through our own UI, which
  never reads that field, but the endpoint itself is public). Fixed by adding
  `emailAndPassword.customSyntheticUser`, mirroring better-auth's own documented
  example, setting `role`/`banned`/`banReason`/`banExpires` to match a real
  account's defaults.
- **`auth.config.ts` — `sendOnSignIn: true`.** Real, confirmed option
  (`sign-in.mjs`): on an unverified login attempt it resends the verification
  email before returning the same `403 EMAIL_NOT_VERIFIED` — closes the "no
  resend" gap the mailer doc's own Follow-ups flagged, without a dedicated
  endpoint.
- **HTML injection via unescaped `storeName`/`url`.** `Store.name` is
  seller-controlled and was interpolated raw into email HTML sent to
  buyers/sellers in three places (`review-payment.usecase.ts`'s flagged
  `buildPaymentStatusEmailHtml`, plus the identical pattern in
  `customer-account.service.ts`'s `buildCustomerVerificationEmailHtml` and
  `auth.config.ts`'s `buildVerificationEmailHtml`'s `url`, not flagged but same
  bug). Added `escapeHtml` to `packages/utils/src/strings/index.ts` (already
  home to `slugify`), applied everywhere a store name or URL gets interpolated
  into an email template.
- **Dedicated token secret.** `customer-account.service.ts` and the seed
  script's `buildCustomerConfirmUrl` (`apps/api/scripts/seed/apply.ts`) both
  reused `BETTER_AUTH_SECRET` to sign the buyer confirm-link token — coupling an
  unrelated app-level token to the auth framework's session secret for no
  reason. New `CUSTOMER_ACCOUNT_TOKEN_SECRET` env var, added to
  `infra/docker/.env.example`, `scripts/init-env.ts` (auto-generated in prod the
  same way `BETTER_AUTH_SECRET` is), and local `apps/api/.env`.
- Test coverage added alongside: `create-order.usecase.spec.ts` (customer.id
  linkage assertion, null-customer/mismatch-guard case),
  `customer-account.service.spec.ts` (both mismatch branches — verified and
  unverified existing customer, different email),
  `review-payment.usecase.spec.ts` (typed mailer mock, approve/reject email
  assertions, the new `ConflictException` case),
  `packages/utils/src/strings/index.test.ts` (`escapeHtml`).

## Findings: skipped, with reason

- **Distinguish duplicate-signup from new-signup messaging
  (`apps/web/.../onboarding/page.tsx`).** Would reintroduce a vulnerability.
  better-auth's synthetic-user design makes both cases return an identical
  `{ token: null, user }` shape _on purpose_ — our page already does the right
  thing by not branching on anything beyond `token === null`.
- **Verify-email success shown just from absence of `?error=`
  (`apps/web/.../verify-email/page.tsx`).** Confirmed in better-auth's
  `email-verification.mjs`: on success it does a bare `redirect(callbackURL)`
  with no extra param at all. `?error=<code>` on failure is the _only_ signal
  the library ever sends — there's no alternative "explicit success" signal to
  check instead. The residual edge case (someone manually visits the bare URL)
  is cosmetic-only, doesn't affect the real `emailVerified` DB state or grant
  access.
- **Rotate `RESEND_API_KEY`, verify absent from repo history.** History check
  done: `git log --all -p` and `git grep` across every commit for the live key
  value — zero matches. `apps/api/.env`/`infra/docker/.env` are gitignored and
  untracked. The key was never committed. It _was_ pasted into a chat session
  previously per the mailer doc's own note — rotating the Resend dashboard key
  is an external manual action, flagged to the user, not something executable
  here.
- **Browser e2e coverage for the mailer doc's untested flows.** No
  browser-automation tool available in this environment. Did curl-level
  verification instead (see Verification below) — real coverage of the
  underlying behavior, just not literally browser-driven.
- **Outbox pattern / idempotency key for the payment-review race** — see "Fixed"
  above; the conditional-update guard already prevents the actual bad outcome
  without new infra.
- **Retries/failure metrics for the backgrounded verification email** — no
  metrics/queue system exists anywhere in this repo; log-on-failure matches
  every other fire-and-forget email send already in this codebase.

## Prod deploy-gap research

`infra/docker/api.Dockerfile`'s prod `CMD` runs `prisma migrate deploy` on
**every** container boot/restart, already documented in `docs/core/deploy.md`.
Since `795130e`, exactly one new migration exists
(`20260731151214_customer_email_verification`) — a normal redeploy applies it
automatically, no manual migration step needed. The one new manual requirement
from this session: `CUSTOMER_ACCOUNT_TOKEN_SECRET` must exist in prod's `.env` —
handled by the reset below since `env:init --force` regenerates it fresh.

## Backfill script removal

`apps/api/scripts/backfill-pickup-points.ts` and `backfill-payment-methods.ts`
only existed to migrate prod rows created before `PickupPoint`/
`PaymentMethodConfig` existed as models. Referenced nowhere else in the repo
except `apps/api/package.json`'s two script entries (removed) and one historical
plan doc (left as-is — changelog record, not current-state docs). Once prod
starts from an empty DB there's nothing left to ever backfill.

## Prod DB reset

Added a "Reset (wipe DB, start clean)" section to `docs/core/deploy.md` with the
full command sequence — targets only the `db_data` Docker volume, not
`caddy_data`/`minio_data`. See that doc for the exact commands.

## Verification

- `pnpm --filter api exec tsc --noEmit` and `pnpm --filter api exec vitest run`
  — clean, 175/175 (was 169; 6 new tests from the findings above).
- `pnpm --filter @biasmarket/utils exec vitest run` — clean, `escapeHtml`
  covered.
- Curl-level check of the two previously "logic-only" mailer-doc flows:
  duplicate `sign-up/email` now returns a `role`-complete synthetic user
  matching a genuine signup's shape; `/verify-email` with a bad token still
  correctly redirects with `?error=`.
- Local check of the hijack fix: checked out twice against the same phone with
  two different emails, confirmed via `psql` that the second checkout did not
  change the first `Customer` row's `email`/`emailVerified`.

## Follow-up

- Prod DB reset itself is a manual step for the user to run (server access, not
  executable from here) — command sequence lives in `docs/core/deploy.md`.
- `RESEND_API_KEY` rotation is a manual Resend-dashboard action for the user.

## Hotfix (same day): `seed:base:prod` crashed with `ERR_MODULE_NOT_FOUND`

User ran the reset runbook above; `pnpm seed:base:prod` failed:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/app/apps/api/src/modules/orders/application/customer-account-token.ts'
imported from /app/apps/api/scripts/seed/apply.ts
```

**Root cause**: `apply.ts` imported `createCustomerAccountToken` via a relative
path reaching into `apps/api/src/...` (added when the
`CUSTOMER_ACCOUNT_TOKEN_SECRET` fix above moved the seed script off
`BETTER_AUTH_SECRET`). `apps/api/src` is never copied into the prod runtime
image — `api.Dockerfile`'s final stage only `COPY`s `apps/api/scripts`,
`apps/api/dist`, and `packages/`. Worked in dev only because
`docker-compose.dev.yml` bind-mounts the whole repo. This exact cross-boundary
import pattern actually dates back to the original buyer-accounts session (not
today's fix) — it just never ran in prod until this deploy, since prod hadn't
redeployed since before that work landed.

**Fix**: moved `createCustomerAccountToken`/`verifyCustomerAccountToken` out of
`apps/api/src/modules/orders/application/customer-account-token.ts` into
`packages/utils/src/customer-account-token/index.ts` — a real workspace package
that _is_ copied to prod (`packages/` in the Dockerfile COPY list, already how
`escapeHtml`/`slugify`/whatsapp helpers are shared). Updated the three consumers
(`customer-account.service.ts`, its spec, `apps/api/scripts/seed/apply.ts`) to
import from `@biasmarket/utils/customer-account-token` instead. `packages/utils`
needed a new `@types/node` devDependency + explicit `"types": ["node"]` in its
`tsconfig.json` — first file in that package to touch `node:crypto`/`Buffer`.

**Still latent, not fixed**: `apps/api/scripts/send-test-email.ts` has the
identical pattern (`import { MailerCore } from '../src/mailer/mailer.core.ts'`)
— breaks the same way if `pnpm mail:test` is ever run in prod. Not touched since
it's a manual-only debug script, not part of any auto-run boot/seed path, and
out of scope for this fix.

**Verified**: ran the exact failing command inside the running dev container —
`pnpm --filter api run seed:base` — succeeded, seeded both stores. Repo-wide
`pnpm turbo run typecheck` clean; `pnpm --filter api exec vitest run` 171/171 (4
token tests moved to `packages/utils`, now 25/25 there — same total coverage,
relocated).

**Not yet done**: the actual prod redeploy — this fix needs merging to `main`,
then `git pull && pnpm docker:prod` on the server (rebuilds the image with the
fix baked in) before `pnpm seed:base:prod` will work there.

## Hotfix (same day, #2): dev docker seeded before `@biasmarket/utils` was built

Coworker (Carlos) hit the same `ERR_MODULE_NOT_FOUND` as the prod hotfix above,
but on `pnpm docker:dev` from a fresh clone — one layer deeper.

**Root cause**: `infra/docker/docker-compose.dev.yml`'s `api` service `command`
ran the seed step (`node scripts/seed/run.ts`) _before_ `@biasmarket/utils` (and
`i18n`/`types`) ever got built — those three packages were only built inside the
trailing `concurrently` block, which starts _after_ seed. `packages/utils`'s
exports point at `dist/*/index.js`; on a genuinely fresh clone (empty named
volumes, no pre-existing `dist/`) that path doesn't exist yet when seed runs.
This gap predates today — `apps/api/scripts/seed/*.ts` never imported from any
`@biasmarket/*` package besides `@biasmarket/db` (whose build step,
`prisma generate`, was already sequenced correctly) until hotfix #1 above moved
`customer-account-token.ts` into `packages/utils`, adding the first such import
and exposing the ordering gap. Didn't reproduce locally because a
stale-but-present `dist/` from an earlier manual `pnpm build` sat on the
bind-mounted host filesystem, masking it.

Separately, an open PR (#40, "Build NestJS before running concurrently," not
merged) fixed an adjacent but different race: `nest build --watch` and the
`nodemon` process that execs `apps/api/dist/main.js` both start in parallel
inside the same `concurrently` block, nothing guaranteeing the first
`nest build` finishes before `nodemon`'s first exec attempt. Confirmed correct
via `gh pr diff 40`, but it doesn't touch the seed step — wouldn't have fixed
Carlos's crash on its own.

Prod unaffected by either: `api.Dockerfile`'s build stage runs
`turbo run build --filter=api`, which (per `turbo.json`'s
`dependsOn: ["^build"]`) transitively builds every workspace dependency before
the image is even created — nothing builds at prod container-boot time.

**Fix**: two one-shot build steps added to the same `api` `command` in
`docker-compose.dev.yml`:

1. `pnpm exec turbo run build --filter=@biasmarket/i18n --filter=@biasmarket/types --filter=@biasmarket/utils`
   before the seed step.
2. `pnpm --filter api exec nest build` after seed, before `concurrently` — folds
   in PR #40's fix (same line region, same root-cause category).

New order: install → `db:generate` → `migrate deploy` → **build
i18n/types/utils** → seed → **`nest build`** → `concurrently` (unchanged: turbo
watch build + `nest build --watch` + nodemon).

**Verified**: `docker compose ... down -v` + deleted all `dist/` dirs (true
fresh-clone repro) → `pnpm docker:dev` clean boot → seed completed with zero
errors → `/api/health` 200 → confirmed hot-reload still works (edited
`packages/utils/src`, watched rebuild + app restart).

**Follow-up incident, same fix**: Carlos re-ran `git pull` and hit
`error: Your local changes to ... docker-compose.dev.yml would be
overwritten by merge ... Aborting`
— his pull silently no-opped (uncommitted local edits to that exact file, likely
a hand-applied copy of PR #40's line), so he re-ran `docker:dev` against his
still-stale pre-fix file and saw the identical crash again. Not a bug in the fix
— confirmed the fix was already committed and pushed to `origin/main`
(`4eae5e7`, verified present in the actual file content). Resolution is local to
his machine: first preserve any local edits he wants to keep with
`git stash push -- infra/docker/docker-compose.dev.yml` or by copying the file
elsewhere. If the local edit is disposable, intentionally discard it with
`git checkout -- infra/docker/docker-compose.dev.yml`, then update with
`git pull --ff-only` before retrying.
