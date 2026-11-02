# Review rounds

## Round 0: primary review

- Reviewed all six open PRs against each declared base and inspected the
  cumulative stack through #598.
- Confirmed two #585 CI failures from hosted logs and reproduced the mobile
  typecheck failure locally.
- Confirmed the #598 account-deletion gap in the service flow: deleting the
  account leaves the newly stored country code on its anonymized row.
- Confirmed a #598 Sentry scrub edge with a direct Node probe; Round D dropped
  it because the plan scopes scrubbing to `user`/`extra` and request-body
  capture is not explicitly enabled.
- Drafted two #585 comments and one #598 finding; no inline comments are planned
  for the other four PRs.
- Round A reviewers independently confirmed the two #585 issues. A #582 concern
  about one-way parity iteration was checked against the test implementation:
  sorted key arrays are compared for equality, so English-only keys do fail the
  test; dropped as a false alarm.
- Round B identified the #598 account-deletion omission (added to the draft) and
  a theoretical request-data scrub edge. Round D dropped the latter because the
  plan scopes country-code scrubbing to `user`/`extra` and request-body capture
  is not explicitly enabled. #593 dashboard-provider and #583 mobile-consumer
  gaps are assigned to later stack integration, so recorded as follow-up scope
  rather than per-PR findings.
- Candidates examined and dropped are recorded in `review-notes.md`.

## Round A: adversarial claim and anchor review

- #585-1 and #585-2 both survived falsification; agents confirmed both anchors
  lie in the respective diffs and CI proves the failures.
- A possible #582 parity-test gap was rejected after checking its equality
  comparison: the test catches English-only as well as Spanish-only keys.
- #593/#598 reviewers found no additional issue in the intended settings/profile
  scope on this pass.

## Round B: security, test, CI, i18n, migration, and contract gap hunt

- Security found #598-1: the existing buyer account anonymization flow leaves
  the newly persisted country code. Added to the draft with a `REQUEST_CHANGES`
  event.
- CI/i18n review confirmed required tests and workflows; noted #593 provider and
  #583 mobile consumer work as staged integration not present in the open set.
- Migration/API contract review found no additional issue; the #585 migration
  defaults and DTO mappings align apart from the already-known order response
  and mobile fixture failures.

## Round C: tone and author-readability pass

- Trimmed the stack scope comment and #598 text; kept #593 validators scoped to
  signup/self-update.

## Round D: author's advocate

- Recommended `COMMENT` for #581/#582/#583/#593; `REQUEST_CHANGES` for #598 and
  #585.
- Confirmed #598-1 and both #585 findings are introduced by their PRs and
  proportionate. Dropped the theoretical `request.data.countryCode` concern
  because the plan scopes redaction to user/extra and request-body capture is
  not enabled explicitly.

## Round E: exact payload and anchor gate

- Exact payload gate passed for all six reviewed heads. GitHub review events
  were posted to #581 (5739910045), #582 (5739910599), #583 (5739911088), and
  #593 (5739911626); inline comments were posted on #598 (5739927915) and #585
  (5739930143). The initial attempt to submit `REQUEST_CHANGES` on #598/#585
  returned HTTP 422 because the authenticated user is also the PR author; these
  events were posted as `COMMENTED` with the same inline findings.
- Stack scope note posted on #598 issue thread (6582604394).
- Fixed and pushed #585 at `0ffe4ace62666ac60ed8e6ec393fa8f21d6f3d35`: omit
  `shipsInternationally` from the existing nested order response mapper and add
  the required mobile fixture value.
- Fixed and pushed #598 at `cad0dcfe090f49ed096e8b6884b8c873b28baaa9`: clear
  `BuyerAccount.countryCode` during account deletion and extend the account-auth
  E2E case.
- Post-fix local checks: API typecheck passed; API unit tests passed (99 files,
  1209 tests); mobile typecheck passed; mobile tests passed (6 files, 26 tests).
  The E2E command collected tests but reported them skipped in this local
  environment, so it does not verify the new deletion assertion; hosted E2E is
  pending on the pushed #598 head.
- Post-fix independent diff review found no remaining issues. The live-readiness
  review confirmed current heads and advised waiting for fresh CI on #585/#598;
  it also confirmed open #594 is a separate Caddy redaction change, not planned
  PR 3.
- All six reviewed PRs are now marked ready after exact-head `CI Success`
  passed. The fresh API E2E runs passed for #585 and #598; #582 has a
  non-required Codacy `ACTION_REQUIRED` status. All three posted inline finding
  threads were resolved after fix verification.
