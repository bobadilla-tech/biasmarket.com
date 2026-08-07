# Pickup-point weekday availability — schema + API + checkout guard

## Context

Issue 3 of the four-issue batch plan
(`2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md`):
sellers wanted per-pickup-point weekday availability plus a manual
"not available today" override — `PickupPoint` only had `enabled`
(a permanent on/off switch), no day-of-week data. The plan split issue 3
into two PRs because its scope grew during review; this is 3a, the
schema + API + defense-in-depth layer. 3b (the dashboard weekday-editor UI)
is a separate follow-up PR, landed after this one since it depends on this
PR's API surface.

## Approach

- **`openDays Int[]`**, using JS's native `Date.getDay()` convention
  (0=Sunday..6=Saturday) rather than inventing one — confirmed via review
  there's no existing day-of-week storage precedent anywhere in this
  codebase to follow (the one runtime day-of-week usage,
  `features/stats/lib/payment-date-ranges.ts`, is a plain `today.getDay()`
  call using this exact convention). Empty array means "no restriction,
  open every day."
- **`closedOverride Boolean @default(false)`** for v1, not a dated
  `unavailableUntil` range — simpler for a seller to operate (one toggle to
  remember to turn back off, vs. picking a date range). Every other mention
  of this field across the original plan (API validation,
  `findEnabledForSlug`, `CreateOrderUseCase`'s check, dashboard UI,
  checkout's fallback, Orval regen, tests) was already written in terms of
  this boolean shape.
- **`findEnabledForSlug` stays enabled-only, unfiltered by day/override** —
  a deliberate decision, not an oversight: the "not available today, next
  available: Thu" messaging the checkout redesign (issue 4) will show needs
  the *next* available day, which requires the full `openDays`/
  `closedOverride` data reaching the frontend. Filtering server-side would
  hide the very data needed to compute that.
- **`CreateOrderUseCase` defense-in-depth**: rejects a submitted
  `pickupPointId` that's `closedOverride`'d or outside `openDays` for the
  current day, placed right after the existing enabled/ownership check.
  Mirrors the placement pattern from this session's zero-payment guard
  (issue 1) — without this, a stale client cache or a direct API call
  bypasses whatever the storefront shows.
- **Minimal storefront consumer, not the full redesign**: the plan
  explicitly warns against shipping this data model with zero storefront
  consumer. Since the card-selector redesign with day-availability badges
  is issue 4 (a later PR), `checkout-form.tsx`'s existing `<select>`
  dropdown now just filters out `closedOverride`'d/not-open-today points
  instead of listing them unconditionally — no new UI, just not offering an
  option the backend would reject anyway.

## What else came up

- Regenerating `openapi.json` + the Orval client produced a much larger
  diff than the actual schema change: every generated file under
  `packages/types/generated/` got reformatted (quote style, object-type
  line-wrapping). This repo has no `prettier` config or binary of its own —
  Orval bundles its own formatter, and whatever version is currently
  installed doesn't match whatever produced the previously-committed
  files. Confirmed via `git log` that this has happened before (a prior
  "fix: format" commit exists). Not a content change, just noise; accepted
  per CLAUDE.md's "regenerate, commit the diff" convention rather than
  hand-reverting formatting on 23 files.

## Tests

- `pickup-points.service.spec.ts`: new cases for `create`/`update`
  persisting `openDays`/`closedOverride`.
- `create-order.usecase.spec.ts`: new cases for the `closedOverride`
  rejection, the not-open-today rejection, and the open-today success path;
  updated the shared pickup-point test fixture to include the new fields
  (needed once the guard reads them unconditionally, not just in the new
  test cases).
- `pickup-points.e2e-spec.ts`: extended the existing create/update
  round-trip test to also assert `openDays`/`closedOverride` persist
  correctly through the real HTTP+DB path; added a new case confirming
  checkout 400s against a `closedOverride`'d point end-to-end.
