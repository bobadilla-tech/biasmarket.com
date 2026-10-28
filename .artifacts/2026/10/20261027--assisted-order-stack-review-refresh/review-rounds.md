# Review rounds: stack refresh

## Round 1: live-state and CI pass

- Updated all PR heads, bases, issue context, prior review comments, and latest
  CI status from GitHub.
- Found current #325 OpenAPI drift and the stack ancestry break at #326.
- Confirmed old teardown failure is fixed; new E2E job halts before tests at the
  same OpenAPI drift gate.
- Updated work scope from “repair the earlier E2E teardown” to “update the
  OpenAPI artifact, refresh ancestry, then re-run CI.”

## Round 2: fresh code review

- Rechecked #324–#326, #327–#329, and #330–#331 independently against current
  refs. #324 and five #325 findings are fixed. Dropped the incorrect #326 buyer
  DTO exposure claim.
- Kept the #327 catch-all fallback, #329 usability/test issues, and #330
  findings already present in posted threads.
- Added #329 typed-quantity/selection-reset issue and #331 retained-link-after-
  cancellation edge case. The latter is un-reproduced and drafted as a question.
- #328 had no newly found correctness issue; #331's prior correction-action and
  customer-history findings are fixed.

## Round 3: author's advocate

- Confirmed most live findings and downgraded the #326 race/boundary cases to
  test gaps rather than proven behavior defects.
- Confirmed #329 quantity behavior as an avoidable client validation failure.
- Confirmed #331 cancellation case as a plausible low-severity edge, with no
  runtime reproduction; retain only as a question pending intent.
- Required stack ancestry refresh and removal of prohibited Claude attribution
  boilerplate from all PR descriptions.

## Round 4: plan operations review

- Found that descendants must be refreshed after each parent fix, not only
  before making all scoped changes; the order was rewritten to reflect this.
- Found a live Codacy failure missed by the first CI summary. Added the exact
  check annotation and a `Math.random()` replacement to the #325 work.
- Clarified that PR-description edits need separate authorization and that the
  authenticated account is the PR author, so further review events must be
  `COMMENT`.

## Round 5: final plan review found moving heads

- The author advanced #326–#330 while plan review was in progress. Re-fetched
  all PR heads and bases and replaced the stale table.
- #326 now includes the seller-only DTO projection, creator includes, stale race
  e2e, and exact-expiry unit test. #327 now narrows template fallback and tests
  the editor. #329 now fixes missing-variant and delivery-option states.
- #330 `203f2fce` fixes the duplicate order number prefix, waits for template
  readiness, and removes the seller preview URL. #331 `96460de2` inherits the
  updated stack.
- API/E2E failures on #325–#327/#329–#331 trace to the same OpenAPI snapshot;
  Codacy separately blocks #325 on `Math.random()`.

## Round 6: fresh gap and author's-advocate pass

- Confirmed #325's stale alias lookup violates issue #258's last-alias
  criterion; do not fix it by overwriting registered buyers' canonical names.
- Separated #326's explicitly accepted stale-token in-flight 200 from the actual
  failure mode: tracking-write errors are caught, but the order is still served
  without setting the correction lock. Keep the latter as should-fix.
- Confirmed #329 quantity can exceed stock and survive product/variant changes.
- Confirmed #331 retains link actions after cancellation and leaves expired
  reserved-hold actions enabled even though the API rejects them.
- Confirmed #330's new fixes and test paths. No other new issue found on #328.

## Round 7: final plan readiness

The readiness reviewer confirmed the current heads/bases and found two important
plan gates:

- The latest #327 `CI Success` result had failed, not remained pending; the
  table now reflects the failed inherited OpenAPI drift check.
- #258 explicitly requires `Customer.name` to hold the latest alias, while the
  recommended fix preserves registered buyer names and returns alias data
  separately. Treat revising that acceptance criterion as an explicit decision
  before implementation.

The plan remains draft until the user confirms the #258 alias contract and the
#326 first-open tracking failure policy. The PR head table and latest CI state
were checked again before delivery.

## Round 9: implementation and current-head refresh

- The user selected preserving the registered customer name while returning the
  newest assisted-order alias separately, and failing closed if first-open
  tracking fails. Issue #258's acceptance wording now reflects the alias
  contract.
- Implemented the approved behavior and the remaining local fixes across
  #325–#331, then verified a linear local #324–#331 ancestry.
- The live PR heads advanced during this work. Adapted the latest #325 auth
  fixture change and refreshed all local descendants. No remote head was
  modified by this run.
- Full API unit tests (688), full API E2E (120), and the final two-file
  assisted-order E2E rerun (28) passed. API typecheck, web typecheck, focused
  component/API tests, and OpenAPI drift checks passed.
- At the last hosted check, #324/#325 required checks were green; #326–#331 were
  still running or queued. Those runs do not include the local candidate
  commits. No pushes or review posts were made, per the plan's authorization
  boundary.

## Round 10: merged stack follow-up

- The user confirmed #324–#331 had merged and authorized a consolidated
  follow-up PR.
- Compared the local fixes with the new `origin/main`; transplanted only the
  missing delta onto current main and opened PR #344 as one commit.
- Follow-up branch: `fix/assisted-order-stack-followups`; head
  `f308c1a41e2b52a1d59c2584890a3223c081a31a`.
- Focused API/web tests, both typechecks, API lint, full API unit suite, the
  assisted-order E2E files, and OpenAPI drift verification passed locally.
- PR #344's CI was queued at the first post-open check; await hosted checks
  before merging.

## Round 8: readiness recheck

- The #327 check row is corrected to CI Success failed.
- The obsolete #330 preview question is recorded as fixed at the latest head.
- The plan is coherent as a draft with two explicit decision gates and
  recommended defaults; no further blocking omission was found.
