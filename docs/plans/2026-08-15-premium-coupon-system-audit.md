# Audit: feat/premium-coupon-system

Status: FINAL — reviewed by 4 independent subagents (draft-verification,
service/controller deep-dive, admin-web/migration review,
auth-session/test-coverage review). All 8 draft findings confirmed; 8 additional
findings surfaced. Consolidated, deduplicated, severity-classified list is in
"Final findings" below.

## What this branch does

Adds a minimal premium-entitlement system, per the original
`docs/plans/2026-08-14-premium-coupon-system.md`:

- Prisma: `Coupon` + `CouponRedemption` models, plus `User.plan` /
  `User.premiumUntil`.
- API (`apps/api/src/modules/coupons/*`): admin CRUD for coupons
  (`/admin/coupons*`, `@Roles(["admin"])`), a user-facing redeem endpoint
  (`POST /coupons/redeem`), and an admin unredeem/audit endpoint.
- `redeemCoupon` runs inside a Prisma `$transaction`: checks duplicate
  redemption, `maxUses`, then stacks `durationDays` on top of any remaining
  premium window and writes both `CouponRedemption` and `User.plan`/
  `premiumUntil`.
- `better-auth` gets two `additionalFields` (`plan`, `premiumUntil`,
  `input: false`) so the session payload exposes them to the frontend.
- Web: admin coupon management page (`admin/coupons`), redeem widget on the
  account page, `features/coupons` (user-facing) and `features/admin`
  (admin-facing) React Query hooks/schemas.
- Branch history shows this went through several self-corrections already
  (`fix: validate coupon and redemption id before interpolating into url`,
  `fix: move validation for maxUses in database transaction`,
  `fix: stack
multiple coupons premiumUntil`) — the DTO/URL-injection issue and
  the maxUses-outside-transaction issue were already caught and fixed before
  this audit.
- Branch was merged with `main` at `834a411` (merge base `064f2ca` == current
  `main` HEAD, so the branch is otherwise up to date).

Diff: 43 files, +3200/-187 vs `main`
(`git diff main...origin/feat/premium-coupon-system --stat`).

## My draft findings

### 1. [HIGH] Merge with `main` silently dropped the sitemap internal endpoints

`apps/api/src/modules/stores/stores.controller.ts`

`main` has `GET internal/sitemap/count` and `GET internal/sitemap`
(`SitemapInternalTokenGuard` + `ThrottlerGuard`, added by `feat: sitemap
system`
on main). The feature branch's merge commit `834a411` ("Merge remote-tracking
branch 'origin/main' into feat/premium-coupon-system") resolved the conflict by
dropping both endpoints entirely — confirmed via
`git show 834a411 -- apps/api/src/modules/stores/stores.controller.ts`, and
`git show origin/feat/premium-coupon-system:...stores.controller.ts | grep
internal/sitemap`
returns nothing, while the same grep against current `main` returns both routes.
This is unrelated to the coupon feature; it's a bad conflict resolution. Merging
this branch as-is would delete a production sitemap API (used by whatever calls
`X-Internal-Sitemap-Token`, presumably the sitemap-generation job per
`docs/plans/2026-08-14-sitemap-source-split-architecture-plan.md`). **Blocks
merge** until fixed — re-resolve the merge conflict to keep both endpoints.

### 2. [HIGH/MEDIUM — needs judgment] `maxUses` race condition survives despite the fix commit

`apps/api/src/modules/coupons/coupons.service.ts:341-356` (`redeemCoupon`)

The count-then-insert check for `maxUses` now runs inside the `$transaction`,
per commit `94ce1d3`, and the code comment explicitly reasons about isolation
level:

> under Postgres' default READ COMMITTED isolation a fully serialized guarantee
> would additionally require SERIALIZABLE, not needed for this admin-flow limit.

But being _inside_ the transaction doesn't serialize concurrent transactions
against each other under READ COMMITTED — two concurrent `redeemCoupon` calls
from two different users can both run `count()` before either commits its
`create`, both see `redemptionCount < maxUses`, and both succeed, letting total
redemptions exceed `maxUses`. (The per-user duplicate check is safe — that's
enforced by the `@@unique([couponId, userId])` constraint at the DB level, not
by the pre-write read.) Whether this is worth fixing depends on how tightly
`maxUses` needs to be enforced for this "admin-flow" feature — for `maxUses: 1`
single-code giveaways the exposure is small, but the comment states a guarantee
the code doesn't provide. Fix options: `SELECT ... FOR UPDATE` on the coupon row
before counting, or a Postgres advisory lock keyed on `coupon.id`, or accept the
race and correct the comment to not overclaim.

### 3. [MEDIUM] No rate limiting on `POST /coupons/redeem`

`apps/api/src/modules/coupons/coupons.module.ts`,
`apps/api/src/modules/coupons/coupons.controller.ts`

Every other sensitive/abuse-prone endpoint in this codebase registers
`ThrottlerModule` in its module and applies `@Throttle` in its controller —
confirmed present in `customer-auth`, `contact`, `products` (search), `stores`
(the very sitemap endpoints in finding #1), `restock`, `orders` (checkout,
payments). `coupons.module.ts` has no `ThrottlerModule.forRoot` import and
`redeemCoupon` has no `@Throttle`. Codes are 4-8 alphanumeric chars — a
plausible brute-force space for an authenticated attacker trying to guess a live
promo code (especially low-entropy ones an admin might choose, e.g. `LAUNCH`,
`VIP2026`). Should follow the same pattern as the rest of the repo.

### 4. [LOW] `coupon.plan` field is written and returned but never actually applied on redemption

`apps/api/src/modules/coupons/coupons.service.ts:397-403`

`redeemCoupon`'s final `tx.user.update` hardcodes `plan: "premium"`, not
`coupon.plan`. The `Coupon.plan` column (default `"premium"`), the
`CreateCouponDto.plan` field, and the plan value returned in `CouponResponseDto`
are all effectively vestigial — an API consumer setting `plan: "vip"` on a
coupon would see it echoed back in the coupon record but every redemption would
still grant the literal string `"premium"`. Currently low-impact because the
admin form (`apps/web/features/admin/schemas/coupon.schema.ts`) doesn't expose a
`plan` field to set in the first place — but the field exists in the
DTO/schema/API surface and silently does nothing, which is confusing for future
maintenance. Either wire `coupon.plan` through to the user update, or drop the
field until there's a second plan type (per the original plan doc's own
"Follow-up scope" note about not over-building this).

### 5. [LOW] `unredeemCoupon` ignores `:couponId`, trusts only `:redemptionId`

`apps/api/src/modules/coupons/coupons.controller.ts:80-88`,
`coupons.service.ts:266-302`

Route is `POST admin/coupons/:couponId/redemptions/:redemptionId/unredeem`, but
the controller destructures `:couponId` as `_couponId` (unused) and the
service's `unredeemCoupon(redemptionId)` never checks that the redemption
actually belongs to `couponId`. Admin-only, so not an authz bypass across
tenants/users, but the route's own URL shape implies a scoping check that isn't
there — a UI bug or copy-pasted URL could unredeem an unrelated coupon's
redemption without any error. Cheap fix: verify
`redemption.couponId === couponId` (404 otherwise) since the data is already
loaded.

### 6. [LOW] Redeemed-premium state doesn't refresh in the UI after a successful redemption

`apps/web/features/coupons/mutations/use-redeem-coupon.ts`,
`apps/web/features/coupons/queries/use-my-plan.ts`

`useUserPlan` reads `plan`/`premiumUntil` off `authClient.useSession()`.
`useRedeemCoupon` has no `onSuccess` that invalidates/refetches the better-auth
session query. After a successful redeem, the toast fires and `onRedeemed`
callback runs with the fresh `expiresAt`, but the "You're premium until …"
banner rendered from `useUserPlan()` keeps showing the pre-redemption (stale)
session state until something else triggers a session refetch (e.g. navigation,
manual reload). Minor UX correctness bug, not a security issue.

### 7. [LOW] Redeem form bypasses the zod schema that already exists for it

`apps/web/features/coupons/components/redeem-coupon-section.tsx`,
`apps/web/features/coupons/schemas/redeem-coupon.schema.ts`

`redeemCouponSchema` (trim/length 4-8/alphanumeric) is defined and exported from
`features/coupons/schemas` but `redeem-coupon-section.tsx` doesn't use
`react-hook-form` + `zodResolver` like the rest of the codebase's form
convention (per `apps/web/AGENTS.md`) — it just does manual
`code.trim().toUpperCase()` with an uncontrolled-length `maxLength={8}` on the
input and no min-length feedback before submit. Not a bug (the server still
validates via `RedeemCouponDto`), but it's dead code / inconsistent with the
stated convention and gives worse inline validation UX than the admin coupon
form gets from `couponFormSchema`.

### 8. [LOW] Error-to-i18n mapping is a hardcoded match against backend English strings

`apps/web/features/coupons/components/redeem-coupon-section.tsx`
(`errorMessageKey`)

Maps `err.message` via exact string match against the literal English strings
thrown by `CouponsService` (`"Coupon not found"`, `"Coupon is inactive"`, etc.)
to pick an i18n key. Any wording change in the service's
`BadRequestException`/`NotFoundException` messages silently falls through to the
generic error, with no type-level link between the two files. Consider an
error-code field on the API error response instead of matching prose, though
this may be out of scope for this feature vs. a broader API error-shape
decision.

## Subagent review process

4 agents ran independently, each with full repo access via
`git show
origin/feat/premium-coupon-system:<path>` (branch is not checked out
locally):

1. **Verifier** — re-derived each of the 8 draft findings from the actual code,
   confirmed all 8, flagged one new DTO gap.
2. **Service/controller deep-dive** — fresh read of
   `coupons.service.ts`/`coupons.controller.ts`/`dto/coupon.dto.ts` with no
   knowledge of the draft; independently found the maxUses race, the brute-force
   gap, and two findings the draft missed (lost-update race on `premiumUntil`
   stacking, hard-delete cascading away the audit trail). Judged the race
   condition and brute-force gap as HIGH (the draft had flagged them MEDIUM) —
   reasoning kept below since it changed the final call.
3. **Admin web UI + migration** — reviewed the admin table/dialog/mutations and
   the migration SQL against `schema.prisma`; cache invalidation, XSS, and the
   web→api HTTP boundary all checked out clean; found a stale "Uses" column in
   the admin coupon table and reconfirmed the session-refresh gap with the exact
   reason it's unwired.
4. **Auth session field + test coverage** — confirmed `input: false` is
   genuinely enforced by better-auth (read the library source, not just the
   config), confirmed no backend code trusts a cached session `plan` value
   (always re-reads from DB before granting/revoking), flagged the frontend
   `useUserPlan` hook as a forward-looking risk (currently dead code, but would
   become a real bypass path if a future feature gates on it without a backend
   re-check), and mapped which of the above bugs the existing
   `coupons.service.spec.ts` suite cannot catch (everything race-related, since
   it mocks `$transaction`).

## Final findings

Ordered by severity. File:line references are against
`origin/feat/premium-coupon-system`.

### HIGH

**H1 — Merge with `main` silently dropped the sitemap internal endpoints.**
`apps/api/src/modules/stores/stores.controller.ts`. Merge commit `834a411`
dropped `GET internal/sitemap/count` and `GET internal/sitemap` (present on
`main`, added by `feat: sitemap system`) while resolving a conflict — confirmed
by diffing the file's content on both refs. Unrelated to the coupon feature; a
bad conflict resolution. **Blocks merge**: production sitemap generation would
break the moment this branch lands, until the conflict is re-resolved to keep
both endpoints.

**H2 — `maxUses` cap can be exceeded by concurrent redemptions from different
users.** `apps/api/src/modules/coupons/coupons.service.ts:341-356`
(`redeemCoupon`). The count-then-insert check runs inside a
`prisma.$transaction`, but Prisma's default transaction isolation is Postgres
READ COMMITTED, not SERIALIZABLE, and there's no `SELECT ... FOR
UPDATE` /
advisory lock on the coupon row. Two concurrent `POST
/coupons/redeem` calls
from two different users can both `count()` before either commits, both see
`count < maxUses`, and both `create()` — the per-user unique constraint
(`couponId_userId`) doesn't stop this because the two requests are from
different users. A `maxUses=1` single-use code can be redeemed by 2+ users
simultaneously. The inline code comment claims the transaction placement makes
this safe; it only protects against a _pre-transaction_ stale read, not
concurrent transactions — the comment overclaims. Classified HIGH because this
is a business-logic/entitlement bypass reachable by any authenticated user with
no special access, on a platform whose whole point is gating a "premium" plan.

**H3 — No rate limiting on `POST /coupons/redeem`, and weak code-format
validation, make coupon codes brute-forceable for free premium.**
`apps/api/src/modules/coupons/coupons.module.ts` (no `ThrottlerModule`),
`coupons.controller.ts` (`redeemCoupon` has no `@Throttle`), `dto/coupon.dto.ts`
(`RedeemCouponDto.code` has only `@IsString
@IsNotEmpty`, missing the
`@Length(4,8) @Matches(/^[A-Za-z0-9]+$/)` that
`CreateCouponDto`/`UpdateCouponDto` both have). Every other abuse-prone endpoint
in this codebase throttles (`customer-auth`, `contact`, `products` search,
`stores`, `restock`, `orders` checkout/payments all import `ThrottlerModule`) —
coupons is the outlier. Combined with a 4-char code floor (36^4 ≈ 1.68M
combinations against an indexed unique lookup), any authenticated user can
script through the space and self-grant premium access for free. Classified HIGH
for the same reason as H2: untrusted-actor-reachable bypass of a paid/gated
feature.

### MEDIUM

**M1 — Lost-update race on `User.premiumUntil` when the same user redeems two
different coupons concurrently.** `coupons.service.ts:358-401`. The "stack
remaining time" logic reads `user.premiumUntil`, computes a new absolute expiry
outside any row lock, and writes it. Two concurrent redemptions by the same user
each read the same pre-redemption value and each write their own computed result
— the later commit wins and the earlier coupon's granted duration is silently
lost instead of both stacking. Same root cause class as H2 (no row lock),
smaller blast radius (self-inflicted, one user, no cross-user exposure).

**M2 — Hard delete on `Coupon` cascades away the redemption audit trail.**
`coupons.service.ts:218-229` (`deleteCoupon`), schema's
`CouponRedemption.coupon` relation is `onDelete: Cascade`. Deleting a coupon
permanently destroys every historical `CouponRedemption` row for it — who
redeemed it, when, what expiry was granted — with no soft-delete and no
admin-facing warning about the blast radius. For a system whose stated purpose
(per the audit trail language already in `getRedemptions`) is being able to
identify who redeemed what, this undermines that goal.

**M3 — `coupon.plan` is stored and returned by the API but never actually
applied on redemption.** `coupons.service.ts:397-403` hardcodes
`plan:
"premium"` in the final `tx.user.update`, ignoring the redeemed coupon's
own `plan` field entirely (`Coupon.plan`, `CreateCouponDto.plan`, both exist and
default to `"premium"`). Low-impact today only because the admin web form
doesn't expose a `plan` input — but the field is live on the API surface and
silently does nothing, which will bite whoever adds a second plan tier later
expecting it to already work.

**M4 — Admin coupon table shows a stale/wrong "Uses" count for every
non-selected coupon.**
`apps/web/features/admin/components/admin-coupons-table.tsx:102` reads
`redemptionsByCoupon[coupon.id]`, which is only populated for the
currently-selected coupon (per `coupons-page-client.tsx`'s memo). Every other
row renders `0/maxUses` regardless of actual usage, even though the API already
returns the correct count as `coupon.redemptionCount`
(`AdminCoupon.redemptionCount`) — that field is never read by the table. An
admin scanning the list has no way to tell which codes are exhausted without
clicking into each one.

**M5 — Redeeming a coupon doesn't refresh the premium status shown in the UI.**
`apps/web/features/coupons/mutations/use-redeem-coupon.ts` has no `onSuccess`;
`use-my-plan.ts`'s `useUserPlan` reads only from `authClient.useSession()`'s
cache. `account-page-client.tsx` mounts `<RedeemCouponSection />` with no
`onRedeemed` handler either, so nothing triggers a session refetch after a
successful redemption — the success toast fires but the "Premium until …" badge
keeps showing pre-redemption state until the page reloads or the session cache
happens to revalidate on its own.

### LOW

**L1 — `unredeemCoupon` ignores the `:couponId` route param.**
`coupons.controller.ts:80-88` destructures it as `_couponId` (unused);
`coupons.service.ts:266` only scopes by `redemptionId` (which is globally
unique, so it functionally works) with no check that
`redemption.couponId === couponId`. A mismatched couponId/redemptionId pair in
the URL silently succeeds instead of 404ing. Admin-only route, so no
cross-tenant/user exposure — just a misleading API contract.

**L2 — Frontend redeem form bypasses the zod schema already written for it.**
`redeem-coupon-section.tsx` doesn't use `redeemCouponSchema` /
`react-hook-form` + `zodResolver` like the rest of the codebase's form
convention — manual `useState` + `code.trim().toUpperCase()` instead. Server
still validates (modulo H3's DTO gap), so this is convention drift / dead code,
not a functional bug.

**L3 — Error-to-i18n mapping hardcodes a match against the backend's literal
English exception strings.** `redeem-coupon-section.tsx`'s `errorMessageKey`
matches `err.message` against exact strings like `"Coupon
not found"` with no
shared error-code contract with `coupons.service.ts`. Any wording change in the
service silently falls through to the generic error message.

**L4 — `useUnredeemCoupon` is called with no `fallbackErrorMessage`, unlike
every sibling mutation.** `coupon-redemptions-table.tsx:31`. On a network
failure with an empty body, unredeem shows the hardcoded English
`"Network
error"` instead of the localized fallback (`tCommon("networkError")`)
every other coupon mutation uses.

**L5 — `useUserPlan` reads `session.user.plan` directly and is currently
unused/dead code — forward-looking risk, not exploitable today.**
`apps/web/features/coupons/queries/use-my-plan.ts`. Backend confirmed clean
(every authorization decision re-reads `plan`/`premiumUntil` fresh from the DB
inside the transaction, never trusts the session). No cookie-cache/JWT plugin is
configured, so today's session reads hit the DB fresh too. But if a future
feature gates access on this hook client-side without a server-side re-check,
and/or if cookie caching is later enabled, this becomes a real staleness/bypass
path — worth a comment noting the assumption, at minimum.

### Test-coverage gaps (not bugs themselves, but why H2/M1/M3 shipped

undetected)

`coupons.service.spec.ts` mocks `PrismaService`/`$transaction` (per repo
convention — unit tests never hit a real DB), so it cannot exercise true
concurrency. It asserts the _sequential_ logic for maxUses, stacking, and
plan-assignment is correct, but the suite can't and doesn't catch H2 or M1 (both
require two real concurrent transactions), and no test constructs a
non-default-`plan` coupon and asserts what's actually granted (M3 would be
caught immediately by such a test). Recommend: add an integration/e2e test
(vitest e2e config, real `AppModule`, per `apps/api`'s existing `test:e2e`
pattern) that fires concurrent redemption requests against a real Postgres
transaction to catch H2/M1 regressions going forward, plus a unit test asserting
`coupon.plan` flows through to `User.plan` once M3 is fixed.

## Second-pass findings (external AI-reviewer comments, verified against code)

A batch of automated PR-review comments (posted on GitHub PR #116) was checked
against the actual branch content before trusting any of it. Two claims were
refuted outright; the rest surfaced real issues, including one structural bug
(H4) the first pass missed entirely.

**Refuted — no action:**

- _"Stub `@biasmarket/db` in `coupons.service.spec.ts`"_ — false.
  `apps/api/vitest.config.ts` already aliases `@biasmarket/db` globally for
  every unit test in the workspace; `coupons.service.spec.ts` follows the exact
  same pattern as the pre-existing `stores.service.spec.ts` (neither imports
  `@biasmarket/db` directly — both inject a fake `PrismaService` via
  `useValue`).
- _"Move `AdminCouponsPageClient` out of `app/` into `features/admin`"_ — false.
  This is the established convention, not a deviation:
  `admin/inquiries/page.tsx` + `admin/inquiries/inquiries-page-client.tsx`
  follow the identical colocated layout, same for `stores`/`users`.

### New HIGH

**H4 — `unredeemCoupon` corrupts entitlement state for any user who has stacked
more than one coupon; no concurrency required, pure normal usage.**
`coupons.service.ts:266-302`. The equality check
(`user.premiumUntil ===
redemption.expiresAt`) only makes sense for a user's
_single_ redemption. Once stacking is involved (which the branch explicitly
supports — see `fix: stack
multiple coupons premiumUntil`), it breaks both ways:

- Unredeeming an **earlier** stacked coupon: `user.premiumUntil` (the combined
  window) never equals that specific redemption's own `expiresAt`, so the check
  silently no-ops — the user keeps the full stacked duration, including the
  revoked coupon's contribution. Net effect: free premium time an admin
  explicitly tried to revoke.
- Unredeeming a **later** stacked coupon: `user.premiumUntil` _does_ match that
  redemption's `expiresAt`, so the user gets reset straight to
  `plan: "basic", premiumUntil: null` — wiping out an earlier, still-valid,
  non-revoked redemption's entitlement entirely. Root cause: the aggregate
  `User.premiumUntil` field can't be decomposed back into per-redemption
  remaining time. Fix requires recomputing the user's entitlement from their
  remaining (non-unredeemed) `CouponRedemption` rows — e.g., after deleting the
  target redemption, take the max `expiresAt` among the user's remaining
  redemptions (or `null`/ `"basic"` if none remain) instead of comparing a
  single stored timestamp.

### New MEDIUM

**M6 — `CouponsController` was never added to `apps/api/openapi.json`, so
`packages/types/generated` has no coupons namespace, so the web layer falls back
to hand-rolled `fetch` wrappers instead of the generated SDK.**
`git show origin/feat/premium-coupon-system:apps/api/openapi.json | grep -i
coupon`
returns nothing, confirming `pnpm --filter api generate:openapi` was never
re-run after adding the module — a step CLAUDE.md documents as required
("Regenerate both by hand after changing a migrated module's response DTOs...
then commit the diff"). The practical effect:
`admin-coupons.api.ts`/`user-coupons.api.ts` hand-type their response shapes and
manually guard against unsafe ID interpolation (already fixed, see history),
duplicating work the generated client (used by the newer `users`/ `stores` admin
features already, per `admin-users.api.ts`) would do for free, with no
compile-time drift protection between the DTOs and the frontend's hand-written
types. Fix: run
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`,
commit the diff, then migrate the two coupon API wrapper files onto
`apiClient.coupons.*` the way `admin-users.api.ts` already does. (Restoring H1
will also change `apps/api/src/metadata.ts`'s content again since that file is
regenerated from live route/DTO metadata — do the openapi/metadata regen for
both H1 and M6 in the same pass rather than twice.)

**M7 — Nothing resets `User.plan` back to `"basic"` once `premiumUntil`
naturally expires.** No cron/sweep job touches `plan`/`premiumUntil` (grepped
the whole branch for `cron`/`sweep` file names — none). This is the same class
of problem the repo already solved for orders (`expire-orders.usecase.ts`,
called out in CLAUDE.md's Database section) but left unsolved here: `plan` stays
the literal string `"premium"` in the DB indefinitely after expiry unless a
later redemption/unredeem happens to touch it. Not exploitable today — the
frontend correctly derives `isPremium` by comparing `premiumUntil > now`
(`use-my-plan.ts`), and no backend authorization path trusts the cached `plan`
value without also checking `premiumUntil` (per subagent #4's grep of the whole
branch) — but it's a real data-correctness gap: a DB field literally named
`plan` that lies about the user's actual plan indefinitely is a foot-gun for
whoever builds the next feature that gates on it. Recommend an
`expire-premium.usecase.ts`-style sweep mirroring the orders pattern, or a
computed-on-read check everywhere `plan` is consumed (weaker — requires every
future call site to remember).

### New LOW

**L6 — Redundant indexes in `schema.prisma`.** `Coupon.code` is already
`@unique` (which creates its own index), so the additional `@@index([code])` is
a duplicate. Same for `CouponRedemption`: `@@unique([couponId, userId])` already
serves as a leftmost-prefix index for `couponId`-only lookups, making the
standalone `@@index([couponId])` redundant. Harmless but adds write/storage
overhead and migration noise for no benefit.

**L7 — `createCoupon`/`updateCoupon` have a TOCTOU gap on the code-uniqueness
check.** `coupons.service.ts:91-97, 158-165`. Both do `findUnique` then
`create`/`update` with no try/catch around the write and no handling for
Prisma's `P2002` unique-constraint error — two concurrent requests for the same
code would have one throw a raw, unhandled Prisma error (500) instead of the
intended `BadRequestException("Coupon code already exists")` (400). Admin-only,
so low practical likelihood, but cheap to fix: wrap the create/update call,
catch `P2002`, map to the existing message.

**L8 — `getCouponStatus` never checks `startsAt`, so a coupon scheduled for the
future displays as `"active"`.** `coupons.service.ts:26-41`. A coupon with
`startsAt` in the future would still be rejected by `redeemCoupon` ("Coupon is
not available yet"), but the admin table shows it as live. Misleading, not
exploitable. Fix: add a `"scheduled"` status value (widen
`CouponResponseDto.status`'s union type and add the matching admin-table label).

**L9 — Coupon-code `<input>` in `redeem-coupon-section.tsx` has no associated
`<label>`/`aria-label`.** Accessibility gap, screen readers get no stable field
name.

**L10 — Mixed i18n: some coupon-admin UI strings are hardcoded English next to
sibling elements using `t()` in the same file.** Confirmed in
`coupon-form-dialog.tsx` ("Edit coupon", `aria-label="Close"`, both hardcoded
while `t("createTitle")` etc. are used two lines away) and
`coupon-redemptions-table.tsx` ("No redemptions yet." hardcoded). Should route
through the existing `admin.coupons`/`common` translation namespaces already in
use in the same files.

**L11 — `handleUnredeem` in `coupon-redemptions-table.tsx` doesn't catch
`unredeem.mutateAsync` rejections.** A failed unredeem throws unhandled in the
click handler instead of surfacing an error to the admin — inconsistent with
`redeem-coupon-section.tsx`'s user-facing flow, which does try/catch + toast
correctly.

**L12 — Date formatting in `redeem-coupon-section.tsx` ignores the app locale.**
Uses `toLocaleDateString(undefined, ...)` instead of the current next-intl
locale, inconsistent with an es/en-localized app.

**L13 — `auth.config.ts`'s `premiumUntil` additionalField is declared
`type: 'string'` for a `DateTime` column (low confidence, likely fine).**
Cosmetic/type-correctness only — the value is already consistently handled as an
ISO string end-to-end (`use-my-plan.ts` explicitly type-guards for
`typeof === "string"`) and nothing is currently broken by this. Worth
double-checking against better-auth's `'date'` field type semantics while
touching this file for other fixes, but not worth a dedicated pass.

**L14 — `durationDays` cannot be edited after coupon creation.**
`UpdateCouponDto` has no `durationDays` field, and `updateCoupon` always keeps
`existing.durationDays`. May be intentional (duration is baked into each
redemption at the time it happens, so retroactively changing it wouldn't affect
past redemptions anyway) — flagging as a product decision to confirm explicitly
rather than a silent gap, not necessarily a fix.

## Fix list (priority order for the execution pass)

1. H1 — re-resolve the merge conflict / restore the sitemap endpoints.
2. H2 — serialize `maxUses` enforcement (row lock or advisory lock keyed on
   `coupon.id`) inside the transaction; correct or remove the overclaiming
   comment either way.
3. H3 — add `ThrottlerModule` + `@Throttle` to the coupons module/redeem
   endpoint matching the repo's existing pattern (see `customer-auth`,
   `contact`); add `@Length(4,8) @Matches(...)` to `RedeemCouponDto.code`.
4. H4 — rework `unredeemCoupon` to recompute the user's entitlement from their
   remaining `CouponRedemption` rows instead of comparing a single stored
   `premiumUntil` timestamp; add tests covering unredeem-while-stacked in both
   directions (unredeem earlier, unredeem later).
5. M1 — lock the `User` row (or reuse the same lock as H2/H4, since all three
   touch the same entitlement state) before computing the stacked
   `premiumUntil`.
6. M3 — either wire `coupon.plan` through to the `User.plan` write, or remove
   the field from `CreateCouponDto`/`UpdateCouponDto`/the response DTO until a
   second plan type exists (per the original plan doc's own "don't over-build"
   framing).
7. M2 — switch `deleteCoupon` to a soft-delete (`isActive: false` already exists
   for this via `toggleCouponStatus` — consider whether hard delete needs to
   exist at all, or gate it behind an explicit confirmation that states
   redemption history will be lost).
8. M4 — read `coupon.redemptionCount` in `admin-coupons-table.tsx` instead of
   the selection-scoped map.
9. M5 — invalidate/refetch the better-auth session in `useRedeemCoupon`'s
   `onSuccess` (or wire `account-page-client.tsx`'s `onRedeemed` to do it).
10. M6 — regenerate `openapi.json`/`packages/types/generated` (same pass as H1's
    metadata regen) and migrate `admin-coupons.api.ts`/ `user-coupons.api.ts`
    onto the generated `apiClient`.
11. M7 — add an expiry sweep for `User.plan`/`premiumUntil`, mirroring
    `expire-orders.usecase.ts`.
12. L1-L5, L6-L14 — cheap, low-risk cleanups; bundle together. Skip L13/L14
    unless touching those exact lines for another fix anyway (both are
    low-confidence/product-decision items, not confirmed bugs).
13. Add the concurrency e2e test (H2/M1) + unredeem-while-stacked tests (H4)
    - plan-assignment unit test (M3) alongside their respective fixes, not as an
      afterthought — write the test that proves each is closed.
