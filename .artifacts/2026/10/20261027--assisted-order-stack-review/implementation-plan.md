# Implementation plan: repair and review the assisted-order PR stack

Status: ready for implementation. Reviewed PR heads as of 2026-10-27; re-fetch
and re-verify them before starting because the remote state can change.

## 1. Context and outcome

Review the linear assisted-order stack #324–#331, repair the CI blocker, and
address confirmed review findings before treating the stack as ready. Success
means all eight PRs remain in their intended order, the API E2E suite and
required `CI Success` gate pass on every applicable exact head, user-facing
template strings render correctly, and the form/detail flows preserve the
selected buyer and order state.

The PRs are:

| PR   | Branch                                  | Base   | Current head                               |
| ---- | --------------------------------------- | ------ | ------------------------------------------ |
| #324 | `feat/assisted-order-core-extraction`   | `main` | `047a55ca93450fb3a5e453e18a8ae9c03f1bf707` |
| #325 | `feat/assisted-order-create-endpoint`   | #324   | `2326b8eea6f0e8acf2907ae1abe27494da1ec0d1` |
| #326 | `feat/assisted-order-link-endpoints`    | #325   | `dd8ef05087bb03c7fef672d6214f9ec8aecf5946` |
| #327 | `feat/assisted-order-whatsapp-template` | #326   | `2912ce5c65d4047fb979f1dc74ba1f243c9d2350` |
| #328 | `refactor/checkout-delivery-rules`      | #327   | `7506463571e4a7857dcbb0b49b9a9ed23610a3e9` |
| #329 | `feat/assisted-order-new-order-form`    | #328   | `b6a24737859264621c57948e99b5a21f53e66385` |
| #330 | `feat/assisted-order-created-screen`    | #329   | `ffc8e104300f1e69a2648f28abd5cc826a90f5e6` |
| #331 | `feat/assisted-order-detail-actions`    | #330   | `0fcb06678ccda8b850fe05ea28b59be96ea00803` |

## 2. Current behavior and verified findings

The chain matches the approved seller-flow plan in
`.artifacts/2026/10/20261027--assisted-order-seller-flow/plan.md`. The previous
plan snapshot says stacked PRs will not receive GitHub CI; that is stale. All
eight current PRs have hosted checks. #324, #328, #330, and #331 are green.
#325, #326, #327, and #329 fail `E2E (API)` and the required `CI Success` gate.

The four E2E run artifacts show every assertion passing, followed by teardown
failure in the new `apps/api/test/assisted-orders.e2e-spec.ts`: the checkout
side of the lock-order race creates a `CustomerStoreLink`, then `afterAll`
deletes the test store without deleting its store-scoped link. PostgreSQL
rejects the delete with `P2003` on `CustomerStoreLink_storeId_fkey`. This is
introduced in #325 and inherited by the failing descendants. The required gate
correctly reports failure because the E2E job failed.

Other confirmed findings:

- #327 adds literal `{{link}}` in both ICU translation catalogs. Running
  `IntlMessageFormat` against both descriptions throws `MALFORMED_ARGUMENT`.
- #329 can submit before selected product details load. The hook returns only
  loaded details, missing prices become zero, and the submit guard does not
  inspect query readiness. A courier fee can make the total positive while the
  product price or variant is still unknown.
- #329 does not distinguish an auto-filled alias from an empty/manual alias
  after a phone change. The previous buyer's alias can be submitted for the new
  number.
- #330 leaves the `?order=<id>` parameter in the URL. Its effect reopens the
  detail sheet when the order list refreshes after the seller closes it.
- #331 leaves “Correct number” in the WhatsApp confirmation dialog when
  correction is blocked, wired to a no-op callback.
- #331 links to the generic Customers list, not the current order's customer
  detail. Issue #265 accepts a same-number order list or a direct customer
  detail link; the generic list does not satisfy that acceptance.
- #327's `Promise.all` for the new template plus two existing templates can
  reject all settings data if an older API rejects the new enum. The old API's
  enum currently excludes `ASSISTED_ORDER_LINK`. The deployment writes candidate
  API and web canary routes independently, so mixed-version traffic can occur;
  the new template request must fail independently.

Existing CodeRabbit threads on #327 already cover the optional template fetch
and malformed ICU literal. Do not create duplicate inline comments; reply to
those threads if the fixes are accepted.

## 3. Proposed design and boundaries

Keep the eight-PR linear chain and fix each defect in the earliest PR that owns
the changed code. Do not merge, retarget, push, or post reviews as part of the
implementation until the user approves the reviewed drafts. Preserve the
assisted-order plan's API, privacy, lock-order, migration, and issue-reference
decisions.

1. In #325, delete `CustomerStoreLink` rows for each test store before deleting
   the store. Leave unrelated global buyer accounts alone. Preserve teardown
   cleanup for all other seeded records.
2. In #327, escape the literal token example with valid ICU quoting in both
   English and Spanish. Add a check that parses the changed ICU messages (or all
   catalog leaves) so key parity alone cannot pass malformed messages.
3. In #327, isolate failure of the optional template lookup so the existing
   `NEW_ORDER` and `PAYMENT_REMINDER` templates remain available. Add a test
   where only `ASSISTED_ORDER_LINK` fails. The deployment writes API and web
   canary routes independently, so rollout order alone does not remove this
   compatibility window.
4. In #329, expose selected-product query state. Disable submission until each
   selected product has loaded successfully and its variant requirements are
   resolved; show a loading/error affordance with retry for failed detail
   queries. Keep server-side price validation authoritative.
5. In #329, track whether the alias was lookup-prefilled. When the normalized
   phone changes (including to an incomplete/invalid value), immediately clear
   only that generated alias, then fill it only from a matching completed
   lookup; preserve seller-edited text. Do not show or submit phone A's alias
   while phone B's debounced lookup is pending.
6. In #330, consume the order deep link after opening it, or guard it as a
   one-shot navigation event. Preserve normal browser navigation and avoid
   reopening after a close plus list refresh.
7. In #331, hide or disable the dialog's “Correct number” action whenever the
   same order-state rule disables correction in the detail panel. Explain the
   reason consistently.
8. In #331, link to the current customer's detail sheet using the order's
   `customerId`, or show that customer's order history. A link to the generic
   Customers list does not meet issue #265's criterion.

Scope excludes changing the API contract, reworking order state, changing
`trust proxy`, adding a schema migration, or clearing hosted CI checks by
bypassing the required gate.

## 4. Files and components

- `apps/api/test/assisted-orders.e2e-spec.ts` — teardown order for store-scoped
  join rows.
- `packages/i18n/en/dashboard.json` and `packages/i18n/es/dashboard.json` —
  ICU-safe template-variable examples.
- A new focused test such as `apps/web/__tests__/message-format.test.ts` —
  validate ICU syntax in the changed strings. The existing i18n parity test only
  compares catalog keys.
- `apps/web/features/store-settings/api/settings.api.ts` — optional template
  lookup fallback for mixed-version compatibility, plus
  `apps/web/features/store-settings/api/settings.api.test.ts` coverage.
- `apps/web/features/assisted-orders/queries/use-orderable-products.ts` and
  `components/assisted-order-form.tsx` — query readiness/error state, submit
  guard, and alias source tracking.
- `components/assisted-order-form.test.tsx` — delayed product-details and phone
  A-to-B alias cases.
- `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/orders/orders-page-client.tsx`
  and its test — consume the deep link once and cover close/refetch behavior.
- `apps/web/features/assisted-orders/components/assisted-order-section.tsx`,
  `link-message-panel.tsx`, and component tests — blocked correction action.
- `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/customers/customers-page-client.tsx`
  and its tests — open a selected customer's detail sheet from the order link.

## 5. Sequenced implementation steps

1. Confirm the current remote heads, CI results, existing reviews, and branch
   bases. Work in isolated scratch worktrees; do not modify the user's checkout.
2. Fix #325 teardown and run the assisted-order E2E file against a disposable
   database. Confirm the cleanup removes the FK failure without deleting
   unrelated data.
3. After #325 changes, refresh #326, #327, #328, #329, #330, and #331 in chain
   order so every branch still descends from its intended updated parent.
4. Fix #327 ICU literals, add parser coverage, and make the optional template
   lookup independent of existing template reads. Then refresh #328–#331 in
   chain order.
5. Fix #329's product-detail readiness and alias-prefill lifecycle. Add
   regressions for delayed/failed detail requests, courier shipping fee,
   required variants, and phone A-to-B while the debounced lookup is pending;
   ensure manual alias edits survive. Then refresh #330 and #331.
6. Fix #330's one-shot deep link and add a close plus query-refresh regression.
   Then refresh #331.
7. Fix #331's blocked correction action and test both enabled and blocked order
   states. Add the issue #265 customer-detail/history navigation and test that
   it opens the selected customer rather than the generic list.
8. Re-run targeted API/web tests, lint, typecheck, OpenAPI drift, migration
   safety, and the full API E2E suite. No OpenAPI or DB change is expected; if
   the implementation changes either, regenerate and validate committed
   artifacts using repository commands.
9. Re-review the resulting diffs and inspect the latest hosted check suite for
   each current PR head and expected base. CI on `pull_request` may run against
   the generated merge ref, so do not require the check-run SHA to literally
   equal the branch head SHA. Do not merge while a required check is failed,
   pending, or stale for the current head/base. Push branch updates only after
   explicit authorization.

## 6. Verification strategy

Already run during this review:

- `pnpm install --frozen-lockfile --ignore-scripts` — passed in scratch.
- `pnpm db:generate` — passed in scratch.
- `prisma migrate deploy` against a reviewer-owned PostgreSQL 18 container — all
  58 migrations passed.
- `pnpm turbo run build --filter=api --filter=workers` — passed.
- `pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/assisted-orders.e2e-spec.ts`
  — run against reviewer-owned PostgreSQL/Redis containers with the worker on a
  dedicated port; 8/8 tests passed, then suite teardown failed with the same
  `CustomerStoreLink_storeId_fkey` error as hosted CI.
- `IntlMessageFormat` parsing of both new locale descriptions — both failed with
  `MALFORMED_ARGUMENT`.

Planned after fixes (run in GitHub Actions or another clean isolated
environment; do not run the fixed-port E2E bootstrap against containers not
started for this task):

- API: run the assisted-order E2E spec and full API E2E job, OpenAPI drift,
  migration safety, API unit tests, lint, typecheck, and build.
- Web: run assisted-order components, order page, store settings, checkout
  delivery rules, i18n validation, web lint, typecheck, and build.
- Stack: verify the latest `CI Success` and applicable E2E result associated
  with each current PR head and expected base. Check-run SHAs may be generated
  merge refs. Confirm failing descendants receive fresh passing runs after
  ancestor updates.

## 7. Risks and edge cases

- Teardown must delete only links owned by the generated test store IDs. The E2E
  suite also creates buyer accounts globally; avoid deleting shared or
  pre-existing buyer accounts.
- A product-detail query can fail permanently as well as load slowly. Keep
  submission blocked until retry succeeds; do not silently treat absent price or
  variants as zero/none.
- Phone lookup is debounced. Clear only lookup-generated alias text as soon as
  the normalized phone changes, including to invalid/incomplete input. Do not
  show or submit a previous lookup's alias while a new lookup is pending.
  Preserve text the seller edits.
- Deep-link cleanup must preserve unrelated query parameters and locale.
- Template fallback should only absorb failure of the optional new type; it must
  not mask failures fetching the existing `NEW_ORDER` and `PAYMENT_REMINDER`
  templates.
- Hosted CI is authoritative for the PR heads. The local reproduction validates
  the E2E issue but does not replace reruns on GitHub.

## 8. Acceptance criteria

- [ ] #325's assisted-order teardown passes; no store deletion violates
      `CustomerStoreLink_storeId_fkey`.
- [ ] #325, #326, #327, and #329 have successful `E2E (API)` and `CI Success`
      checks in the latest suite for each current head and expected base. The
      check-run SHA may be GitHub's generated merge ref.
- [ ] English and Spanish ICU strings format and display literal `{{link}}`;
      malformed ICU messages fail a test.
- [ ] A failed optional assisted-template request cannot hide existing settings
      templates during the independently weighted API/web canary.
- [ ] The form cannot submit with unresolved/failed product details and never
      shows or submits a prior buyer's lookup alias for a new number.
- [ ] The order detail deep link does not reopen after the seller closes it and
      the list refreshes.
- [ ] The correction action in the confirmation dialog follows the same
      enabled/disabled state and explanation as the detail panel.
- [ ] The order detail links to the correct customer detail/history, satisfying
      issue #265; a generic link to the Customers list is insufficient.
- [ ] Existing checkout tests remain unchanged and pass; no unintended API, DB,
      OpenAPI, or generated-client changes are introduced.
- [ ] All eight PRs have fresh green required checks for their current head and
      expected base. The workflow's merge-ref SHA is allowed. No merge occurs as
      part of implementation without explicit user authorization.

## 9. Open questions

1. Should the implementation stage fixes through the existing stack PRs (one fix
   in each owning branch), or prepare a single fix branch against the tip and
   then distribute changes? Recommended default: update the earliest owning PR
   in order and refresh descendants so history and CI attribution stay clear.

2. Which clean disposable runner should execute the full E2E script? The
   repository bootstrap uses fixed local ports and container names. Recommended
   default: use the hosted reruns for authoritative validation and only use
   reviewer-owned, non-default-port containers for local probes.

3. Issue #333 tracks the checkout's unique-phone `Customer` race when a checkout
   overlaps with another checkout or an assisted order. It remains a separate
   backend follow-up; do not claim this stack fixes it. Triage it before a
   high-concurrency rollout.

4. Issue #268 is still open and owns the buyer-facing order page. Hold release
   of #330 and #331 until #268 ships, because assisted-order links otherwise
   reach a missing page. Keep this as a release gate even if the PRs merge.

## 10. Review status

Ready after four review rounds. The first independent code round found the E2E
blocker, malformed ICU strings, two form defects, a deep-link reopen, a blocked
no-op correction action, and mixed-version template-fetch risk. The first plan
round added immediate alias clearing, ordered descendant refreshes, merge-ref
check interpretation, isolated E2E environment requirements, the unmet #265
customer-detail criterion, the #333 follow-up, and the #268 release gate. The
two final fresh-eyes rounds found no further plan or draft changes. The
API/integration reviewers found no additional authorization, tenant-isolation,
token-privacy, lock-order, or migration issue in their assigned scope.
