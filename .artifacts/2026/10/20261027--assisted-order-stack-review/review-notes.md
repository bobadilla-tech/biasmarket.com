# Review notes: assisted-order PR stack (#324-#331)

Reviewer account: `eliaz-tilt` (keyring token via
`GH_TOKEN=$(gh auth token --user eliaz-tilt)`; the env `GITHUB_TOKEN` only has
`read:packages`). This is also the PR author, so only `COMMENT` reviews are
possible.

## Scope

The author force-pushed the whole stack while this review was running (rebase
onto `main` after #323 merged, plus Codacy fixes). Reviewed heads (final):

| PR   | Branch                                | Base | Head     | CI at review                             |
| ---- | ------------------------------------- | ---- | -------- | ---------------------------------------- |
| #324 | feat/assisted-order-core-extraction   | main | 047a55ca | pass                                     |
| #325 | feat/assisted-order-create-endpoint   | #324 | 2326b8ee | E2E (API) fail                           |
| #326 | feat/assisted-order-link-endpoints    | #325 | dd8ef050 | E2E (API) fail                           |
| #327 | feat/assisted-order-whatsapp-template | #326 | 2912ce5c | E2E (API) fail, Codacy fail (T-SQL rule) |
| #328 | refactor/checkout-delivery-rules      | #327 | 75064635 | pass                                     |
| #329 | feat/assisted-order-new-order-form    | #328 | b6a24737 | E2E (API) fail                           |
| #330 | feat/assisted-order-created-screen    | #329 | ffc8e104 | pass (E2E path-skipped)                  |
| #331 | feat/assisted-order-detail-actions    | #330 | 0fcb0667 | pass (E2E path-skipped)                  |

Old heads (handoff): 25ab30ec c3c98df0 6e41746c b0605abe d836cd7e c5edc352
269a0b60 bc0966f3. Functional delta old -> new: `Math.random` -> `randomUUID` in
three e2e specs; `buildPreview` switch in `whatsapp-messages-section.tsx`.
Existing reviews: only bot summaries (CodeRabbit rate-limited, Codacy, Codecov
on #324); no human or inline review on any PR.

Correction to the handoff: CI **does** run on stacked PRs (they trigger on
`pull_request`; run `pull_requests[0].base.ref` = previous branch).

## What ran (by area; reviewers were separate subagents with their own worktrees and DB databases in a throwaway Postgres 16 on :55433 plus own Redis)

- API #324/#325: orders unit 182/182 (#324), 199/199 (#325); e2e orders,
  customer-account-auth, buyer-proof-submit-race 25/25; typecheck, Prettier
  lint, `check-openapi-drift.sh` rc 0; parallel lock-order probes; header
  probes; 8 mutation tests.
- API #326/#327: unit 207/207, link e2e 18/18, assisted e2e 8/8;
  whatsapp-templates specs 12/12 and e2e 9/9; utils 92/92; web store-settings
  14/14; ~15 mutation tests; blue/green migration on a seeded DB; live HTTP
  probes (404 equivalence, 409 matrix, throttle, first-open race with
  `FOR UPDATE` held in psql).
- Web #328-#331: typecheck, lint, 32 files / 189 tests; utils 95/95, validation
  53/53; 20,000-iteration fuzz of extracted checkout rules; import-graph cycle
  check; 177 literal i18n keys vs es/en; 6 mutation tests; throwaway tests for
  each behavioral finding.
- Stack: drift rc 0 at #325/#326/#327/top, migration gate rc 0, merge-tree
  against `main` clean, mobile #237 conflict set identical with/without the
  stack, Codacy API, CI diagnostics artifacts.

## Findings (ranked)

Live defects:

1. **#325 blocker** - e2e `afterAll` fails (`CustomerStoreLink_storeId_fkey`
   RESTRICT); makes E2E (API) red on #325/#326/#327/#329. Reproduced locally on
   a fresh DB and in 4 CI diagnostics. (A-1/X-1)
2. **#327 should fix** - `{{link}}` is invalid ICU in the new i18n description
   (es+en); UI shows the raw key. Reproduced in a rendered component. (B-1)
3. **#330 should fix** x3 - `?order=` deep link reopens the sheet after
   close+refetch (C-1); `Pedido ##CDEF` double hash (C-2); "Abrir WhatsApp"
   enabled while the template loads, sends the default message (C-4).
4. **#329 should fix** x2 - alias from number A survives change to B (C-3); no
   error UI when delivery options fail (C-5).
5. **#325 should fix** - checkout-with-email can 500 when racing an assisted
   create on a brand-new phone (A-6, 3 of 8 probe rounds), new seller-side
   trigger of an existing checkout fragility.
6. **#326 should fix (live, minor)** - `createdByName` is null in customer
   detail (and likely stats) (B-3).

Latent: #326 `createdByName`/`linkFirstOpenedAt`/`claimedAt` leak into the
buyer-facing `OrderDetailResponseDto` once the claim flow sets `buyerAccountId`
(B-2).

Test gaps (mutation-tested): #325 deadlock test cannot fail on a reused DB
(A-3), flaky 8-digit regex over cuids (A-2), throttle guard removal uncaught
(A-4), legacy cross-store count uncaught (A-5); #326 first-open race e2e and
exact-now boundary (B-4, B-6); #327 no component test (B-5); #329 `gcTime: 0`
and the unpublished-store e2e only asserts 200 (C-9/C-10).

Questions/nits: 403 vs 404 foreign/missing store (A-7); alias Cf characters
(A-8); dropped comment lines in #324 (A-9); no-payment-method warning scope
(C-6); send/copy rotates without confirm (C-7); useless "Corregir número" in the
dialog (C-8).

## Stack-level observations

- PR bodies say stacked PRs get no CI; that is wrong (see above). #325 body "28
  passed" contradicts CI.
- #258 A2 leftovers map not posted on #258.
- Codacy on #327: `TSQLLint_set-quoted-identifier` on a Postgres migration =
  noise. Codacy "1 critical" comment on #329 is stale (live API: 0 new issues).
- PR0 was opened and merged as #323 (`d13c5cac`), not skipped as the handoff
  said; it also committed `.artifacts/`, contrary to plan 5. `SKILL.md` not
  ignored (`check-ignore` rc 1), frontmatter has `name`+`description`.
- Mobile stack conflicts are the same with or without this stack.
- Issue bookkeeping: all 8 bodies use `Refs`; comments exist on #265 (both
  deferrals) and #268 (revoked-link page + release gate); #330 body carries the
  release-gate note.
- Plan 10.1 checks: #331 shows badge, creator, buyer number, send/copy,
  regenerate with confirm, correct number disabled with reason; no API changes
  in #329-#331 (only the new e2e).

## Candidates investigated and dropped

Removing `Number()` in shipping (Decimal.plus accepts Decimal); unbounded legacy
scan in `countPreviousOrders` (same as `lookupByPhone` on main); route clash
with `OrderController`; phone format mismatch between flows; removing `storeId`
from the raw `FOR UPDATE` (re-read still store-scoped -> 404); mixed-version
web/API window for the 3-way template query; whitespace alias in a custom
template ("renders as written" per plan); alias prefill not announced via
`aria-describedby`; zod refinements skipped while the phone is invalid (same as
checkout); the 8 `image-gallery.test.tsx` failures (also on `main`: 8 failed / 1
passed); lint on utils/validation (no lint task); missing `Closes` (correct as
`Refs`).

## Not verified

Phone-width browser check and axe; behavior behind real Caddy (`req.ip` global);
`AllExceptionsFilter` log scrubbing on 500s (only Nest's default handler was
exercised); a real buyer session for B-2; stats `recentOrders` `createdByName`
at runtime; why the author's local e2e passed while CI fails (suspected reused
DB); `assisted-order-links.e2e-spec.ts` teardown (CI only reported the #325
file); whether #331 renders the customer-detail link from #265's AC; production
retry timing in 330-3 (React Query defaults).
