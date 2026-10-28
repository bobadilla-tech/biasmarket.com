# Review rounds

## Round 0: primary review

- Read all three full diffs against their exact base SHAs, excluding lockfiles.
- Checked PR descriptions, linked issues #260/#267, current review comments,
  current hosted checks, relevant callers, payment/storage/auth contracts, and
  repo instructions.
- Logged seven #347 bot findings as already fixed in current code; no duplicate
  comments drafted.
- Identified #347 OpenAPI formatting failure and #345 missing multipart
  request-body schema.
- #343's two existing bot findings appear fixed; no duplicate comments drafted.

## Round 1: independent full-diff gap hunt

- #347: independent reviewer validated all seven existing bot findings as
  addressed and found no new code defect; focused API tests passed (4 files, 42
  tests).
- #345: independent reviewer found missing OpenAPI multipart request body and no
  other concrete defect.
- #343: independent reviewer validated both existing bot findings as addressed
  and found no additional defect; checked generated steady-state and canary
  proxy blocks.

## Round 2: verification and draft preparation

- #345 focused API controller/public-photo tests passed (25 tests); web
  order-detail test passed (6 tests).
- #347 `prettier --check` failed on `apps/api/openapi.json`; the mismatched
  changed line is 1744, inside the PR diff. The hosted API log reports the same
  file-level failure.
- `git diff --check` passed for all three PRs.
- Current draft events: #347 REQUEST_CHANGES for the failing generated artifact;
  #345 COMMENT for the OpenAPI contract gap; #343 APPROVE.

## Round 3: pending adversarial, tone, author-advocate, and exact-payload gates

- Challenge each drafted claim and anchor against the current head.
- Check wording from the author's perspective and avoid overstating hosted E2E
  failure details.
- Re-fetch current heads immediately before posting; drop or re-review any
  comment whose anchor no longer applies.
