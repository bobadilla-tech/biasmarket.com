# Codacy review cleanup: verify findings, fix valid, skip the rest

## Context

A Codacy review (`@codacy-production` bot, on `tweaks/examinating-arounbd`)
flagged findings across `all-exceptions.filter.ts`,
`packages/utils/src/errors/index.ts`, `store-sections.service.ts`, and four
`docs/plans/2026-08-08-*` docs. Task: verify each finding against current code,
fix only still-valid issues, skip the rest with a brief reason, keep changes
minimal, validate.

Not a feature plan — a triage record, in case later reviews re-flag the same
spots. Findings that were already satisfied by existing code are documented as
"skip" here so the next reader doesn't re-litigate them.

## Fixed (code)

1. **`apps/api/src/common/filters/all-exceptions.filter.ts` — HIGH, valid.**
   `context.getNext<Request>()` returns NestJS's middleware `next` function, not
   the HTTP request, so `request.method`/`request.url` were `undefined` in the
   logger line and in every JSON error body's `path`. Changed to
   `context.getRequest<Request>()`. (Bug introduced with the filter itself in
   `1b2887d`; the `@js-temporal/polyfill` work in
   `2026-08-08-temporal-typecheck-fix.md` never touched this line.)
2. **`store-sections.service.ts` `reorder()` — inline comment, valid.** The
   preflight `findMany` validated `sectionIds` belong to the store, but the
   writes ran `update({ where: { id: sectionId } })` with no `storeId` — a
   TOCTOU/tenant gap vs. CLAUDE.md's "every query touching tenant data filters
   by storeId". Now an interactive transaction: per id,
   `updateMany({ where: { id, storeId }, data: { position } })`, throws
   `BadRequestException` if `count !== 1`, then returns the rows tenant-scoped
   (needed for the controller's `toSectionDto` map). The preflight read stays
   as-is (preserving the existing ownership validation). Note: this is the same
   `reorder()` the drag-drop-preview plan's Status section already described as
   fixed — that earlier fix added the preflight check; this pass made the writes
   tenant-scoped too.
3. **`apps/web/features/sections/lib/hydrate-sections.ts` — drag-drop plan
   inline comment, valid.** The builder preview was fed the seller-side
   `collections.findAll` response unfiltered, so DRAFT/deleted/discontinued
   products could render in the preview but never on the public page.
   `hydrateSections()` now filters
   `status === "PUBLISHED" && deletedAt === null
   && discontinued === false` —
   exactly `findPublicBySlug()`'s application-level filter. `soldOut`
   deliberately **not** filtered (the public query doesn't either; the renderer
   surfaces sold-out state).
4. **`apps/web/features/customer-auth/components/account-sidebar.tsx` —
   buyer-account plan inline comment, valid.** "Volver a la tienda" lived only
   in the desktop `<aside>`, so it was silently unreachable at the mobile
   breakpoint (logout was already in the mobile top bar). Added the link to the
   mobile top bar next to logout.
5. **New `apps/api/src/common/filters/all-exceptions.filter.spec.ts` —
   temporal-typecheck plan nitpick, valid.** Runtime response-contract test:
   unknown exception → 500 with `{ statusCode, message, path, timestamp }`,
   ISO-8601 timestamp wire format, logger invocation; `HttpException` →
   status/message passthrough, no log.

## Fixed (docs)

- **`2026-08-08-temporal-typecheck-fix.md`**: language identifiers on every
  diagnostic fence (`text` for compiler output, `console` for shell sessions);
  Status section notes the new response-contract spec and the `getNext` bug it
  surfaced.
- **`2026-08-08-buyer-account-panel-redesign.md`**: step 3 (mobile) now states
  logout + "Volver a la tienda" stay alongside the two-destination tab bar;
  execution notes record the mobile top-bar placement and the mobile-flow test.
- **`2026-08-08-restock-interest-dedicated-page.md`**: "Decided" section copy
  made self-consistent — a plain total is a waitlist-volume signal, **not** a
  "new since last viewed" indicator, and there's no contacted/status field to
  count "pending-only".
- **`2026-08-08-storefront-section-drag-drop-preview.md`**: stale "Open
  questions" resolved (hidden column confirmed over delete/recreate; one BANNER
  row per image confirmed) and the public-visibility hydration filter recorded
  in Status.

## Skipped (with reasons)

- **`packages/utils/src/errors/index.ts` — MEDIUM, false positive.** The finding
  claims `response !== null` is unnecessary because "`object` doesn't include
  null in strict mode". Wrong at runtime: `typeof null === "object"` is `true`,
  so removing the check makes `"message" in null` throw. The suggested change
  (move `response !== null` before the `typeof` check) is a no-op reorder —
  nothing to fix.
- **Restock plan `count()` ownership** — already implemented exactly as
  requested (`restock.service.ts` resolves the store, checks `ownerId`, then
  runs `.count()` scoped to `storeId`); no read state needed.
- **Drag-drop plan mutation flows** — already implemented and documented in the
  plan's Status: optimistic local state rolls back via `resyncLocalSections()`,
  failures surface via the `error` state, and post-success reconcile happens
  through query invalidation re-syncing `localSections`.
- **Drag-drop plan keyboard nitpick** — implementation already wires
  `PointerSensor` + `KeyboardSensor` with `sortableKeyboardCoordinates`
  (`sections-page-client.tsx`). User-facing keyboard instructions + a dedicated
  keyboard-reorder test are an enhancement beyond this cleanup for an already
  tested, shipped feature.
- **Drag-drop plan batch-hydration nitpick** — already satisfied: one
  `collections.findAll` request (products + variants included) + local join in
  `hydrateSections()`; no per-tile request to batch.

## Validation

- `pnpm exec tsc --noEmit -p tsconfig.json` clean in both `apps/api` and
  `apps/web` (turbo typecheck's `@biasmarket/db` prisma-generate step still
  can't run locally without a `DATABASE_URL`, same known local-env gap from
  `2026-08-08-temporal-typecheck-fix.md`).
- `apps/api`: `src/common` + `store-sections` + `restock` suites green (45/45).
- `apps/web`: `features/sections`, `features/customer-auth`, store-sidebar, and
  `sections-page-client` suites green (47/47).
- No `lint` script exists in any package (turbo's `lint` task is an empty
  passthrough) — `tsc` + vitest are the effective checks for this change set.

## Learnings / deviations

- **Codacy can be confidently wrong about JS runtime semantics.** The utils
  finding asserted TS behavior that doesn't hold at runtime
  (`typeof null ===
  "object"`). Verify each finding against the actual
  expression before acting.
- **`getNext()` misuse shipped unnoticed because nothing asserted it.**
  `request.method`/`request.url` logged as `undefined` and every API error body
  had `path: undefined`; no test covered the filter. The new spec closes that.
- **Tenant-scoped writes need the scoping in the write itself**, not just a
  validated preflight — the preflight + raw-`id` `update` combo had a race
  window (section reassigned/ownership changed between the read and the
  transaction). `updateMany({ id, storeId })` with a `count === 1` assertion is
  the pattern to copy (cf. `reorderProducts` in `collections.service.ts` has the
  same preflight-only shape — flagged, not changed, out of this review's scope).
- **`hydrateSections()` must mirror `findPublicBySlug()`'s filter exactly** —
  including _not_ filtering `soldOut`, since the public page doesn't. "Same
  public visibility predicates" means matching the query, not the reviewer's
  shorthand list.
- **Mobile "back to store" was a real regression, not just a plan-accuracy
  nit.** The buyer-account plan's "footer pinned to the sidebar" wording was
  satisfied only on desktop because the mobile top bar replaced the sidebar
  wholesale. jsdom tests can't exercise breakpoint CSS, so the coverage asserts
  both DOM copies are present (the component renders mobile + desktop markup
  unconditionally, toggled by `md:` classes).
