# Implementation log

Base `origin/main` @ `010f43d8`. GitHub login used for pushes/PRs: `UltiRequiem`
(via `GH_TOKEN`, confirmed by the user; `eliaz-hireoverseas` is read-only). Work
was done in worktrees under `../bm/prN`. Nothing was merged, no production/VPS
action was taken.

All 14 PRs are open: 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438
(draft), 439, 441, 442 (PR numbers 440 belongs to something else). Tier C fit;
nothing was cut.

| PR | #    | Branch                              | Base                                                            | Issues              |
| -- | ---- | ----------------------------------- | --------------------------------------------------------------- | ------------------- |
| 1  | #428 | chore/pin-orval-sdk-drift           | main                                                            | #338 #375           |
| 2  | #429 | fix/checkout-upload-limits          | main                                                            | #391                |
| 3  | #430 | chore/web-test-next-image           | main                                                            | #341                |
| 4  | #431 | chore/codacy-exclude-migrations     | main                                                            | #342                |
| 5  | #432 | refactor/order-ref-six-chars        | main                                                            | #339                |
| 6  | #433 | fix/hide-imageless-products-home    | main                                                            | #356                |
| 7  | #434 | fix/invite-server-preconditions     | main                                                            | #378                |
| 8  | #435 | security/google-login-no-email-link | main                                                            | #377 #376           |
| 9  | #436 | fix/product-image-cap-dto           | chore/pin-orval-sdk-drift                                       | #335                |
| 10 | #437 | chore/drop-buyer-account-id-seller  | fix/product-image-cap-dto                                       | #379                |
| 11 | #438 | fix/caddy-redact-token-logs (DRAFT) | main                                                            | #340 (Refs)         |
| 12 | #439 | feat/assisted-order-idempotency-api | main                                                            | #336 (Refs)         |
| 13 | #441 | feat/assisted-order-idempotency-web | feat/assisted-order-idempotency-api                             | #336 (Closes)       |
| 14 | #442 | chore/epic-255-followups            | main (no SDK regeneration was needed: `openapi.json` unchanged) | #380 (Refs, subset) |

## Checkpoint after Tier B

Tier C fit; continued with 11, 12, 13, 14.

## Verification summary (what was actually run)

- Every PR: `pnpm turbo run lint typecheck test:cov --filter=<pkgs>` and
  `pnpm fix`, green.
- API e2e: `scripts/ci/e2e.sh` was NOT used: a Postgres owned by the user
  listens on `:5432` and the script runs `prisma migrate deploy` against that
  port. Instead I started disposable Postgres/Redis/MinIO containers on
  non-default ports (55432/56379/9000) plus the workers, pointed `DATABASE_URL`
  at the throwaway DB explicitly, ran the specs, and tore everything down.
  Results: PR 5 (3 specs, 33 tests), PR 6 (full API e2e suite: 36 files, 173
  tests), PR 7 (public-orders, 10), PR 8 (buyer-claim, 9), PR 9/10 (products,
  orders, assisted-orders: 36), PR 12 (idempotency spec 9/9 plus
  assisted-orders, assisted-order-links, orders: 61 together), PR 14
  (public-orders, customer-account-auth, buyer-claim: 20). PR 2 has a supertest
  spec (not e2e). PRs 1, 3, 4, 11, 13 have no API e2e.
- `check-openapi-drift.sh` passes on PRs 9, 10, 12, 14.
  `check-types-sdk-drift.sh` passes on PRs 1, 9, 10 (after commit).
- PR 11: `caddy validate`, and a local curl/`docker logs` check against Caddy
  v2.11.7 (details in the PR).
- Not run anywhere: the old-release INSERT shape against the new schema as its
  own script (PR 12, reasoned from the nullable column); a browser against a
  running stack; the VPS.

## CI state at the end of the session

- All green except: `Codacy Static Code Analysis` on #439 and #441 (they add a
  migration; this is exactly #342's TSQLLint false positive, which #431
  excludes; it is not a code failure), and #433/#436 had checks still pending at
  the time of the last look. #433's `E2E (API)` failed once because
  `stores.e2e-spec.ts` relied on an imageless product being listed in
  marketplace search; fixed in a second commit on that branch and verified with
  the full local e2e suite.
- `CI Success` for #439/#441 may stay red until #431 is merged or Codacy is
  overridden; the review session should decide (branch protection requires
  `CI Success`).

## Deviations from the plan (and why)

1. **#341 did not reproduce.** The full web suite was already green on `main`
   once workspace packages were built. The global `next/image` stub was added
   anyway as planned. The plan's claim "no test asserts `_next/image`" was
   wrong: one assertion in `image-gallery.test.tsx` read the optimizer URL and
   was updated.
2. **PR 5 order refs:** `orderRef` is `slice(-6)`, so a few test ids changed
   expected values (e.g. `order-1` -> `RDER-1`, `...1234wxyz` -> `34WXYZ`).
3. **PR 9:** the Swagger plugin cannot read a constant inside
   `@ArrayMaxSize(...)`; explicit `@ApiProperty({ maxItems })` was added on all
   three DTOs. `products.e2e-spec.ts` had no global `ValidationPipe` (7 images
   returned 201), so the spec now applies the same pipe as `main.ts`. A first
   push of that fix accidentally committed a `.mailer-dev` symlink; it was
   removed (amend + force-with-lease) and PR 10 was rebased onto the corrected
   PR 9 (no other branch contains it).
4. **PR 10:** 4 generated interfaces lost `buyerAccountId` (plan said 5;
   `Address` correctly stays).
5. **PR 12:** `@Headers('idempotency-key')` makes Nest Swagger document a
   _required_ header and changes `openapi.json` (found by
   `check-openapi-drift.sh`), contradicting the plan's "no OpenAPI change". The
   header is read from `@Req()` instead, so PR 12 still does not regenerate
   anything. The real Prisma 7 + adapter-pg `P2002` meta shape was probed in the
   e2e and matches `isIdempotencyKeyConflict`.
6. **PR 8 log field names:** the skip log carries `buyerAccountId` (new account)
   and `existingBuyerAccountId`, ids only.
7. **PR 14 (b)** skipped on purpose (unreachable after #377), as the plan
   allowed. Items (a), (c)-(i) done, each with a test.
8. **PR 11:** the image tag is not pinned (default); verified against
   `caddy:2-alpine` = v2.11.7.

## Human tasks (not done, in PR bodies)

- #356: mark @carlos as `isDemo` if it is a test store (production data; PR
  #433).
- #340: the whole VPS checklist (PR #438, draft, merge alone, recreate the caddy
  container, rotate old logs, confirm health).
- #342: confirm on the next migration PR that Codacy passes (Codacy UI settings
  can override `.codacy.yml`).
- Create the follow-up issues from `follow-up-issues.md` and close #380 once
  they exist.

## Local notes

Each fresh worktree needs `pnpm install --frozen-lockfile`,
`DATABASE_URL=... pnpm --filter @biasmarket/db db:generate`, and builds of
utils/queue/types/i18n/design-tokens/validation/query before api/web tests;
`packages/i18n` is consumed from `dist`, so rebuild it after changing messages.
Worktrees are in `/Users/ultirequiem/ulti/bm/pr1` ... `pr14` and can be removed
with `git worktree remove`.
