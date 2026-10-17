# Review notes: assisted-order stack refresh

Date: 2026-10-27. Repository: `bobadilla-tech/biasmarket.com`. Live snapshot
refreshed at 21:50 UTC while the author was updating descendants.

## Scope and evidence

The previous full-stack review is in
`.artifacts/2026/10/20261027--assisted-order-stack-review/`. It already posted
review comments on the PRs. This refresh rechecked live PR data and current
heads, challenged prior findings, reviewed the new #325 delta, and checked CI.
Do not repost existing comments.

| PR   | Current head | Base head                       | Current result                                                                    |
| ---- | ------------ | ------------------------------- | --------------------------------------------------------------------------------- |
| #324 | `1fbcaff3`   | `6d6ec3a0` (main is `e32ce87a`) | 40588198608 passed; merge state CLEAN                                             |
| #325 | `5305b9b9`   | `1fbcaff3`                      | 40588396861 API/E2E/CI Success fail; Codacy action required                       |
| #326 | `bf572eb6`   | `5305b9b9`                      | 40588783267 API/E2E/CI Success fail from inherited OpenAPI drift                  |
| #327 | `9b51f461`   | `bf572eb6`                      | 40589023675 API/E2E/CI Success fail from inherited OpenAPI drift                  |
| #328 | `89be607c`   | `9b51f461`                      | 40589045085 CI Success, Web, and Web E2E pass; API/E2E skipped                    |
| #329 | `fe9eab6f`   | `89be607c`                      | 40589382711 API/E2E/CI Success fail from inherited OpenAPI drift; Web/Codacy pass |
| #330 | `203f2fce`   | `fe9eab6f`                      | 40589587319 API and CI Success fail from inherited drift; E2E skipped             |
| #331 | `96460de2`   | `203f2fce`                      | 40589667468 API and CI Success fail from inherited drift; E2E skipped             |

## CI diagnosis

Hosted API logs show `Check OpenAPI is tracked and up to date` fails because
`CreateAssistedOrderDto.customerName` now rejects bidi, zero-width, line,
paragraph, and BOM characters while `apps/api/openapi.json` still contains the
old regex. This is a concrete missing generated artifact. The same drift check
runs inside `scripts/ci/e2e.sh` before migrations or Vitest, so the red E2E job
does not indicate a new teardown/test regression. The required `CI Success` gate
correctly fails because API and E2E failed.

Codacy check 122486301878 independently reports one new minor issue:
`Math.random()` at `apps/api/test/assisted-orders.e2e-spec.ts:39` is classified
as a cryptographically weak random generator. It is only test phone selection,
but Codacy's configured zero-issue threshold makes the check require action; use
`node:crypto` `randomInt` or a `runId`-derived unique value.

The prior `CustomerStoreLink_storeId_fkey` teardown error was fixed by the
current #325 code. Earlier red E2E runs from the previous snapshot should not be
reported as the active CI cause.

`#324` passes checks at the recorded base, while current main has two newer
artifact-only commits. #326–#331 have now been refreshed by the author through
the current chain. Their latest API/E2E failures are inherited from the
unupdated #325 snapshot. #330/#331 completed with the same API drift and E2E
path-skipped; their required `CI Success` gates failed accordingly.

## Findings carried forward

Already in posted threads and now addressed in current code: #327 broad
`.catch(() => null)` fallback; #329 missing-variant explanation and delivery
options loading/error/retry; #330 duplicate `#`, WhatsApp template readiness,
and preview-link first-open side effect. #326 creator projections and the
stale-token race/exact-expiry coverage were added in `bf572eb6`.

Fixed after live-code recheck: #324 comment restored; five #325 test/validation
findings; #326 seller-only fields are now blanked from buyer details and creator
projections/tests are added; #327 fallback/editor tests; #329 missing-variant,
delivery-state, and mutation-cache coverage; #330 summary, template readiness,
and seller preview link; #331 correction dialog/customer history. #328 had no
new correctness issue.

New findings: #325 repeat-order lookup can prefer an old `Customer.name` over
the latest assisted-order alias, contrary to issue #258. #326 returns a 200
after a valid first-open transaction fails, leaving phone correction unlocked
because `linkFirstOpenedAt` was rolled back. The 200 after `count === 0` for a
stale token rotated after initial authorization is an intentional in-flight
tradeoff documented by the PR, not a separate finding. #329 typed quantity is
not clamped by `max` and product/variant changes preserve it, allowing avoidable
server stock errors. #331 retains a generated result after cancellation and
ignores expiry in its `closed` rule, although the API rejects expired holds.
Fresh reviews confirmed these behaviors; the stale-result case is a remote-state
edge but directly reproducible by the component state flow.

All eight PR descriptions still include Claude attribution text. The supplied
authorship instruction prohibits tool attribution in PR text; remove it when the
stack is next updated.

## Not verified / limitations

- #325's OpenAPI/Codacy fixes have not been pushed, so every API/E2E red status
  still reflects the same inherited drift or random-source annotation.
- No full API suite could be run on the refreshed stack; hosted E2E stopped at
  OpenAPI drift before starting tests.
- New #330 tests and fixes are on the latest head. The #329 quantity, #326
  tracking-write failure, and #331 cancellation/expiry issues still need
  regression coverage.
- No source, branch, review, issue, or PR-description changes were made.
- `eliaz-tilt` is the PR author; any further review event should be `COMMENT`.

## Implementation refresh (2026-10-27, 22:14 UTC)

The two behavior decisions are resolved: preserve the registered `Customer.name`
and return the latest assisted-order alias separately; return an error if
first-open tracking cannot be persisted. Issue #258's acceptance wording was
updated to match the first decision.

The local candidate is a linear stack in isolated worktrees:

| PR   | Local branch              | Local head |
| ---- | ------------------------- | ---------- |
| #324 | `review/assist-stack-324` | `f32f5bb8` |
| #325 | `review/assist-stack-325` | `12e8dd96` |
| #326 | `review/assist-stack-326` | `2803b18f` |
| #327 | `review/assist-stack-327` | `dda972bf` |
| #328 | `review/assist-stack-328` | `e1141194` |
| #329 | `review/assist-stack-329` | `a4eb3610` |
| #330 | `review/assist-stack-330` | `abbcaa98` |
| #331 | `review/assist-stack-331` | `c2564586` |

Parent ancestry is verified from #324 through #331. During the work, the live PR
heads advanced independently. The newest #325 throttle-fixture change was
adapted into the local candidate, then descendants were refreshed again. The
remote heads at the last check were #324 `1fbcaff3`, #325 `d07afb40`, #326
`f91c5aa2`, #327 `b65ffd9e`, #328 `c850f6d7`, #329 `eed25fd9`, #330 `47beb83a`,
and #331 `645a73be`. #324 and #325 required checks were green; checks for
#326–#331 were still running or queued. These hosted results do not cover the
local candidate commits, which have not been pushed.

Verification on the local candidate:

- Full API unit suite: 73 files, 688 tests passed.
- Full API E2E suite: 30 files, 120 tests passed.
- Final focused assisted-order E2E rerun after the latest fixture change: 2
  files, 28 tests passed.
- API typecheck passed. Focused Customer, public-order, checkout, assisted
  order, WhatsApp settings, and created/detail component suites passed in their
  respective worktrees. Web typecheck and OpenAPI drift checks passed; no
  generated OpenAPI or client diff remained.
- The web production build compiled, then could not collect `/my-purchases`
  without `INTERNAL_API_URL` in the local environment.

None of PR branches #324–#331 was pushed from this run, and no review was
posted. All PR descriptions still need their attribution cleanup after
authorization. Keep #330/#331 gated on deployment of #268; #333 remains
separate.

## Follow-up PR

After the stack merged, the remaining local delta was transplanted onto the
then-current `main` and opened as
[PR #344](https://github.com/bobadilla-tech/biasmarket.com/pull/344), branch
`fix/assisted-order-stack-followups`, commit `f308c1a4`. It contains 14 files
with the alias, first-open, quantity, cancellation/expiry, template, and
regression-test fixes. Local focused tests, full API unit tests, API and web
typechecks, lint, and the assisted-order E2E files passed. The PR's initial
hosted CI workflow was queued at the last check; merge readiness depends on its
fresh checks and review.
