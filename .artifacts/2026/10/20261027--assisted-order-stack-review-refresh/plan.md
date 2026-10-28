# Plan: refresh and finish the assisted-order PR stack review

Status: follow-up PR #344 opened after the stack merged; hosted checks and
review are pending. Snapshot date: 2026-10-27, 21:50 UTC.

## Outcome

Get the full #324–#331 stack onto one current linear ancestry, repair the active
CI failure, resolve the still-valid review findings, and verify every current
head/base pair with fresh required checks. Do not merge or publish release PRs
#330/#331 until buyer page #268 is deployed.

## Live state

| PR   | Head       | Recorded base        | Latest run  | State                                                                                           |
| ---- | ---------- | -------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| #324 | `1fbcaff3` | `main` at `6d6ec3a0` | 40588198608 | CI Success and API E2E pass; current `main` is `e32ce87a`, two commits beyond the recorded base |
| #325 | `5305b9b9` | #324 `1fbcaff3`      | 40588396861 | API, E2E (API), CI Success fail; Codacy action required                                         |
| #326 | `bf572eb6` | #325 `5305b9b9`      | 40588783267 | API, E2E (API), and CI Success fail from inherited OpenAPI drift                                |
| #327 | `9b51f461` | #326 `bf572eb6`      | 40589023675 | API, E2E (API), and CI Success fail from inherited OpenAPI drift                                |
| #328 | `89be607c` | #327 `9b51f461`      | 40589045085 | CI Success, Web, and Web E2E pass; API/E2E are path-skipped                                     |
| #329 | `fe9eab6f` | #328 `89be607c`      | 40589382711 | API, E2E (API), and CI Success fail from inherited OpenAPI drift; Web/Codacy pass               |
| #330 | `203f2fce` | #329 `fe9eab6f`      | 40589587319 | API and CI Success fail from inherited OpenAPI drift; E2E skipped                               |
| #331 | `96460de2` | #330 `203f2fce`      | 40589667468 | API and CI Success fail from inherited OpenAPI drift; E2E skipped                               |

The live #325 API log identifies the failure: OpenAPI has the older
`customerName` pattern `^[^\\p{Cc}]*$`, while the DTO now rejects more invisible
characters. The E2E script runs the same drift check before migrations and
tests; its current failure occurs before the suite executes. A clean isolated
worktree with the CI test environment reproduced the one-line OpenAPI diff. The
earlier `CustomerStoreLink` teardown defect is fixed in the current #325 code;
the latest E2E failure is the stale OpenAPI snapshot.

The author has already refreshed #326–#331 onto their current parent heads. The
#325 update still needs its OpenAPI and Codacy fixes; those changes require
another refresh of #326–#331. Current #326/#327/#329 runs fail the same drift
gate; #330/#331 API checks also fail against the broken inherited snapshot.
Their other current checks have not all completed. #328 passes its own Web
checks while API/E2E are path-skipped; that does not clear the parent failures.

Codacy also reports one new minor issue at `assisted-orders.e2e-spec.ts:39`:
`Math.random()` is flagged as a cryptographically weak random-number generator.
Although used only to choose fresh test phone numbers, replace it with
`randomInt` from `node:crypto` (or a deterministic unique value derived from
`runId`) so the analysis check passes.

## Remaining review findings

Already raised in current PR review threads; reply to those threads after fixes
instead of opening duplicates:

- #327: the optional `ASSISTED_ORDER_LINK` fallback and editor/cache coverage
  were fixed in `9b51f461`. Recheck that only the old API's 400 response falls
  back; 5xx/network errors must remain visible.
- #329: missing-variant explanation, delivery-options loading/error/retry, and
  mutation cache coverage were fixed in `fe9eab6f`. Typed quantity can still
  exceed stock, and changing product/variant keeps the old quantity. Bound or
  validate typed values and reset/clamp quantity on selection changes.
- #330: the three prior findings (double `#`, opening WhatsApp before the
  template resolves, and seller preview stamping a buyer open) were addressed in
  `203f2fce`: summary reference fixed, trigger waits for template, and the buyer
  preview link was removed. Review the user-facing path and regression tests at
  the new head.
- #326: `bf572eb6` now includes `createdBy` in customer/stats projections,
  blanks seller-only metadata from buyer responses, adds stale-token race e2e
  coverage, and tests the exact expiry unit boundary. Re-review these changes
  after the upstream CI failure is cleared.
- #329: the unpublished-store e2e is stronger and `gcTime` has a regression test
  in `fe9eab6f`.

New follow-up candidates, not yet posted:

- #329: `order-item-row.tsx` sets `max` only as an input hint and its text
  handler writes any number into the form (`noValidate` is enabled). Product or
  variant changes preserve that quantity. This permits avoidable stock-error
  submissions.
- #325: #258 says `Customer.name` stores the last alias, but
  `upsertAssistedCustomer` updates it only when null, and `lookupByPhone`
  prefers `customer.name` to the newest order alias. A repeat assisted order
  with a changed alias therefore returns a stale alias. Preserve a registered
  buyer's canonical name and make the last-alias lookup match the accepted
  requirement; see the decision below.
- #326: the handler catches any failure in the first-open transaction and still
  returns the order. If a current-token read is served but the marker or event
  write rolls back, `linkFirstOpenedAt` remains null and the seller can still
  correct the number after the buyer received the page. Fail closed on a failed
  tracking write or otherwise block correction after a valid read.
- #331: if the seller has generated a link and the order later becomes cancelled
  while the detail sheet stays open, the cancelled message replaces regenerate
  controls but the retained `result` still renders WhatsApp/copy. Also, `closed`
  ignores expired reserved-hold orders even though the API rejects them
  with 409. Hide/clear stale results and match the API's expiry rule in the UI.

Previously raised issues now verified fixed: #324 pickup-lock comment, five #325
test/validation findings (the OpenAPI artifact and Codacy finding remain), #326
creator projections and race/boundary coverage, #327 fallback/editor coverage,
#329 loading and missing-variant affordances, #330 WhatsApp/summary/ preview
findings, and #331 correction-dialog/customer-history behavior. #328 has no new
correctness finding. Preserve issue #333 as a separate checkout race. PR
descriptions contain prohibited tool-attribution boilerplate; prepare removal
after code heads stabilize, but wait for authorization before editing them.

## Ordered work

1. Recheck PR heads and base SHAs. Rebase #324 onto current `main` (`e32ce87a`),
   preserving the extraction and restored comment; inspect the diff against the
   latest `main` and run its API checks.
2. On #325, replace `Math.random()` in race phone setup with `randomInt` from
   `node:crypto` (or deterministic `runId`-derived values). Fix repeat-order
   alias lookup so it returns the newest assisted-order alias without renaming a
   registered buyer's canonical contact name; adjust #258's acceptance wording
   only with authorization. Regenerate `apps/api/openapi.json` from the built
   API and inspect the diff. Run Orval generation and commit any SDK change it
   produces. Rebase #325 onto the new #324 head, retaining the teardown cleanup
   and stronger tests from `5305b9b9`.
3. Re-review #326's creator projections, seller-field clearing, stale-token race
   e2e, and exact expiry unit case after #325 is fixed. Change the first-open
   tracking failure path so a valid read is not served as success when its
   correction-lock marker failed; update the unit test that currently expects
   a 200. The zero-row stale-token response after rotation is an explicitly
   accepted in-flight request and is not a separate finding. Then refresh
   #326–#331.
4. Re-review #327's limited optional-template fallback and editor coverage after
   #325 is fixed; ensure 5xx/network errors remain visible. Then refresh
   #328–#331.
5. Rebase #328 and rerun checkout tests/fuzz parity on its updated base. No
   source change is currently required.
6. Fix #329's form affordances: explain missing variants, show delivery-options
   loading/error/retry, clamp or reject typed quantity, and reset/clamp quantity
   when product or variant changes. Add focused component tests. Then refresh
   #330 and #331.
7. Re-review #330's summary, template readiness, and removal of the seller
   preview link at `203f2fce`; do not reimplement the fixes unless the new tests
   or UI trace show a remaining gap. Keep the #268 launch gate visible. Then
   refresh #331 if #330 changes.
8. For #331, hide/clear a previously generated result when the order is
   cancelled, and disable send/correct actions for an expired reserved hold. Add
   transition and exact expiry tests.
9. Prepare removal of Claude attribution boilerplate from all eight PR
   descriptions; apply those GitHub edits only after explicit authorization.
10. Re-run focused tests, lint/typecheck, OpenAPI drift and generated-client
    checks. On each refreshed head, inspect hosted API/E2E/UI checks and the
    required `CI Success` result. Confirm the E2E suite actually reaches and
    passes tests, not merely that setup starts. Re-review all refreshed diffs,
    verify issue acceptance criteria, check comment anchors and thread
    duplication, then update the review notes.

## Acceptance criteria

- Every PR base points at the current parent head; #324 targets current `main`.
- `check-openapi-drift.sh` passes on #325 after the schema snapshot is updated.
- The assisted-order E2E file and full applicable API E2E job execute and pass.
- Codacy passes without the new weak-randomness annotation.
- Every PR has fresh green required checks on its current head/base. Skipped
  path jobs are valid only where the fail-closed `CI Success` gate accepts the
  skip. Do not treat old green descendant runs as current.
- Existing review comments are replied to or explicitly withdrawn; no duplicate
  inline comments are posted.
- #268 is deployed before #330/#331 are released; #333 stays separate.
- No branch push, review post, merge, or release occurs without authorization.
- Reviewer account `eliaz-tilt` is the PR author; further reviews should use
  `COMMENT` events only.

## Verification already completed for this refresh

- Verified GitHub account `eliaz-tilt` with the repository keyring credential.
- Retrieved all eight live PR heads/bases, issues #259/#263–#265/#268/#333,
  review comments, check summaries, and the failing #325 workflow log.
- Ran the exact OpenAPI drift script in a clean detached #325 worktree after
  building the API and loading `scripts/ci/e2e.env.example`; it failed with
  exactly the pattern mismatch shown in hosted CI.
- Fresh focused review runs reported 8 passing tests for #327 and 34 for #329.
- No source changes were made to the checkout or remote branches.

## Decisions and defaults

- Update the existing stacked branches in dependency order. This is the
  recommended default because each PR retains its issue scope and checks.
- #330 removed the seller preview URL; retain that fix before #268 release.
- Treat the #331 canceled-result panel as a UX defect; hide or clear it once
  cancellation is observed.
- #326 explicitly accepts an in-flight stale-token response after rotation; keep
  that behavior unless the product owner changes the rule. Separately, a
  tracking-write exception for a valid token should fail closed because #265
  uses the persisted open marker to decide whether the seller may change the
  phone.
- #258 literally requires `Customer.name` to store the last alias, while #325
  preserves any pre-existing `Customer.name` to avoid overwriting registered
  buyers. This is a product-contract decision: either overwrite `Customer.name`
  as #258 currently says, or preserve the registered name and return the latest
  assisted-order alias separately/from order history. Recommended default is the
  latter; implementation must wait for approval to update #258's acceptance
  wording.
- #326's first-open tracking transaction currently fails open. Recommended
  default is to return an error when a valid-token read cannot persist its open
  marker, but confirm this policy because it changes current API behavior.
