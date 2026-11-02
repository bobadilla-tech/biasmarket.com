# Review notes: #515 voseo / country stack

Review run: 2026-11-02 (America/Lima). GitHub account: `UltiRequiem`.

## Scope and state

| PR   | Slice                           | Head                                       | Base                              | State                       | Existing feedback                                       | CI                                                     |
| ---- | ------------------------------- | ------------------------------------------ | --------------------------------- | --------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| #581 | 1a tuteo copy                   | `09d8c126cf941d478fbe4959e4a95bbd694fe671` | `main`                            | Draft, clean merge state    | No reviews or inline threads; bot summary comments only | Required CI success                                    |
| #582 | 1b copy guards                  | `e34b49c3edc16f78523480b2bb534143cf4291be` | `feat/copy-tuteo-515`             | Draft, unstable merge state | No reviews or inline threads; bot summary comments only | Required CI success; Codacy action-required annotation |
| #583 | 2 overlay/resolver              | `4cf7fd007a1eb2fa4b29ec1915568b8d83213c8a` | `feat/i18n-guard-tests`           | Draft, clean merge state    | No reviews or inline threads; bot summary comments only | Required CI success                                    |
| #593 | 4a seller/store settings        | `7042bb513c54ab4474159e6e516c82b5c173895b` | `feat/voseo-overlay-and-resolver` | Draft, clean merge state    | No reviews or inline threads; bot summary comments only | Required CI success                                    |
| #598 | 4a-2 buyer country/Sentry scrub | `cad0dcfe090f49ed096e8b6884b8c873b28baaa9` | `feat/register-data-and-settings` | Ready for review            | Review finding fixed and resolved                       | Required `CI Success` green                            |
| #585 | 5 product shipping flag         | `0ffe4ace62666ac60ed8e6ec393fa8f21d6f3d35` | `main`                            | Ready for review            | Two review findings posted and fixed                    | Required `CI Success` green, API E2E green             |

Only the six open PRs above are in scope. Searches for the planned Caddy
branch/title found no PR #3; PR 4b, 5b, 6a, and 6b are also not open. Their
manual Caddy evidence, Origin/CSRF route tests, provider/country-select
behavior, buyer message integration, and badge behavior cannot be reviewed in
this stack snapshot. Open #594 is a separate Caddy token/idempotency-key
redaction change; it does not contain the planned CF-IPCountry strip,
forged-header proof, Q8/Q9 evidence, or recreate instructions.

## Verification run

- Fetched all `feat/*` and `chore/*` heads and saved each full per-PR diff
  (excluding `pnpm-lock.yaml`) in the session scratchpad; inspected each diff
  against its declared base and rechecked the cumulative stack at #598.
- Inventoried reviews, inline threads, issue comments, and `gh pr checks` for
  all six PRs. No human review or inline feedback existed; existing issue
  comments were bot summaries/coverage notices.
- Ran frozen-lockfile installs in detached scratch worktrees for the stack and
  #585.
- Ran
  `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci INTERNAL_API_URL=http://localhost:3000 NEXT_PUBLIC_API_URL=http://localhost:3000 pnpm turbo run lint typecheck test build --filter=api --filter=web --filter=@biasmarket/i18n --filter=@biasmarket/utils --filter=mobile`
  at #598: all 25 tasks passed, including 143 web test files (869 tests), 15
  utils test files (180 tests), and 6 mobile test files (26 tests).
- Ran the same task set at #585 (plus db/types filters): Mobile typecheck failed
  at `apps/mobile/src/features/catalog/catalog-ui.component.tsx:40` because its
  `SearchProductResponseDto` fixture lacks `shipsInternationally`. Other tasks
  were interrupted by that typecheck failure.
- Downloaded the hosted #585 API E2E diagnostics: 4 of 200 tests fail in
  `customers.e2e-spec.ts`, `orders.e2e-spec.ts`, and `stats.e2e-spec.ts` because
  nested `product.shipsInternationally` is emitted but absent from
  `OrderProductResponseDto`/OpenAPI.
- The local stack verification initially failed when `DATABASE_URL` and web API
  URLs were absent; rerunning with those required environment variables passed.
  No local PostgreSQL E2E service was started. Hosted E2E status is recorded
  separately.
- PR #582's hosted `CI Success` is green. The Codecov/i18n CI wiring is present
  in the diff and `turbo.json` already declares `test:cov` outputs.

## Findings

### #585

- **585-1 · should fix · API response contract / failing E2E.** The new Prisma
  field is returned by the shared `toOrderProductDto` object spread in order
  responses. The generated order-product schema does not declare it. Hosted CI
  confirms four strict response-schema test failures across customer, order, and
  stats endpoints. Either intentionally expose it in `OrderProductResponseDto`
  and regenerate the API SDK, or omit it from that nested response mapper.
- **585-2 · should fix · mobile compile / failing required check.** Adding the
  required `shipsInternationally` property to `SearchProductResponseDto` leaves
  the mobile catalog test fixture without the field. Hosted CI and the local
  #585 typecheck fail at
  `apps/mobile/src/features/catalog/catalog-ui.component.tsx:40`. Update the
  fixture to match the response contract.

### #598

- **598-1 · should fix · buyer account deletion leaves country data.** The
  global account deletion flow detaches orders, deletes addresses/store links,
  and anonymizes credentials/name, but does not clear
  `BuyerAccount.countryCode`. #598 now persists this field from profile updates
  and returns it in profile DTOs, so deleting an account leaves this newly
  collected profile datum on the row. Add `countryCode: null` to the
  anonymization update and cover it in the deletion test.

## Candidates investigated and dropped

- `resolveRegister` forced-setting precedence, country allowlist, English
  fallback, phone dial-code handling, and strict country parsing match the plan
  and have unit tests; the cumulative utils tests passed.
- Store setting writes are owner-checked and scoped by `storeId`; the user
  setting uses both Better Auth input validators and an impersonation guard.
  Signup/update-user negative E2E coverage checks invalid fields and keeps
  `role`/`plan` server-controlled.
- Buyer `countryCode` appears in buyer-owned profile responses, not seller
  customer payloads; the seller customer list test explicitly checks absence.
  The shared Sentry scrub tests cover case-insensitive cookie/header deletion
  and nested country-code fields.
- PR #585 migration is additive with `DEFAULT true` and follows the requested
  timestamp ordering. Product update uses the existing store ownership /
  foreign-product 404 path; its test exercises the new field in that path.
- A direct probe showed `request.data.countryCode` is not removed by the
  scrubber, but the plan scopes country-code redaction to Sentry `user`/`extra`
  fields, and current app configuration does not explicitly enable request-body
  capture. Dropped as an inline finding for this PR.
- #593 exposes store/user preferences before the planned #4b provider consumes
  them; saving a preference does not yet change dashboard copy at this stack
  head. The plan explicitly assigns provider integration to #4b, so this is a
  staged integration gap rather than a finding against #593.
- #583's mobile translation provider still calls `getMobileMessages(locale)`
  without a register. The plan says the resolver/overlay PR has no consumers; no
  open PR in this set wires mobile message selection, so this remains a
  stack-level follow-up to resolve before claiming mobile voseo support.
- The #582 guard does not implement a future exception mechanism for allowlisted
  legitimate matches, but current files have no exceptions and the requested
  fail-on-seeded-voseo behavior is covered; no current product defect was found
  from this alone.

## Not verified in this set

- Caddy trusted-proxy ordering, forged-header curl proof, redaction, and
  recreate evidence (planned PR #3 is absent).
- `POST /api/country` Origin/CSRF and cookie behavior, static-page cache
  behavior, full country picker/hydration, store country providers, and badge
  (planned PR 4b/5b are absent).
- Full migration application against a throwaway PostgreSQL database and
  old-release INSERT compatibility were verified. All 77 migrations were
  applied; a product row was inserted before reapplying the #585 migration, then
  an old-shape insert omitted the column. Both rows read
  `shipsInternationally = true`. The hosted migration-safety check is green on
  #585.
- Local API E2E suites for #593/#598; hosted required E2E checks are green. The
  temporary database was used for migrations only, not API E2E.

## Posted findings and remediation

- Reviews were submitted on all six PRs. #581, #582, #583, and #593 received
  `COMMENTED` reviews with no inline findings. #598 and #585 received
  `COMMENTED` reviews with their inline findings because GitHub rejected
  `REQUEST_CHANGES` from the PR author with HTTP 422. The review links are
  `https://github.com/bobadilla-tech/biasmarket.com/pull/581#pullrequestreview-5739910045`,
  `https://github.com/bobadilla-tech/biasmarket.com/pull/582#pullrequestreview-5739910599`,
  `https://github.com/bobadilla-tech/biasmarket.com/pull/583#pullrequestreview-5739911088`,
  `https://github.com/bobadilla-tech/biasmarket.com/pull/593#pullrequestreview-5739911626`,
  `https://github.com/bobadilla-tech/biasmarket.com/pull/598#pullrequestreview-5739927915`,
  and
  `https://github.com/bobadilla-tech/biasmarket.com/pull/585#pullrequestreview-5739930143`.
- #598 fix commit `cad0dcfe090f49ed096e8b6884b8c873b28baaa9` clears
  `countryCode` during account deletion; the added E2E case verifies it.
- #585 fix commit `0ffe4ace62666ac60ed8e6ec393fa8f21d6f3d35` omits the new field
  from nested order-product responses and updates the mobile fixture.
- The post-fix diff review found no remaining issues. On #598 fix head, API
  typecheck passed and API unit tests passed (100 files, 1214 tests). On #585
  fix head, API typecheck/unit tests passed (99 files, 1209 tests), mobile
  typecheck passed, and mobile tests passed (6 files, 26 tests). A local API E2E
  invocation collected tests as skipped, so no local E2E claim is made; hosted
  E2E results are pending.
- The stack-level scope note is posted on #598:
  https://github.com/bobadilla-tech/biasmarket.com/pull/598#issuecomment-6582604394.
- #585 and #598 fix heads passed hosted `CI Success` and API E2E, and are ready
  for review. The three inline finding threads were resolved after verifying the
  fixes.
- #581, #582, #583, and #593 were marked ready after their exact-head required
  CI passed. #582 has a separate Codacy `ACTION_REQUIRED` check while its
  required `CI Success` is green.

## Final readiness

All six reviewed PRs are open and marked ready for review with required
`CI Success` green. #582 has an additional Codacy `ACTION_REQUIRED` result; its
required CI gate is green. The two fixed heads are #585
`0ffe4ace62666ac60ed8e6ec393fa8f21d6f3d35` and #598
`cad0dcfe090f49ed096e8b6884b8c873b28baaa9`. Hosted API E2E passed on both. The
three inline threads are resolved.
