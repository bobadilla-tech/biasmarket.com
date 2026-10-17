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

## Round 4: upload resource-limit gap hunt

- Fresh security-focused reviewer confirmed that the new
  `FileInterceptor('file')` has no per-file Multer limit and no global
  `MulterModule` limits are configured.
- Nest passes the empty interceptor options to Multer; without `storage`/`dest`,
  the installed Multer defaults to memory storage. Its memory storage
  accumulates the full upload before the controller parameter pipe checks its 5
  MiB cap.
- The `@UseInterceptors(FileInterceptor('file'))` line 491 is a right-side added
  diff line. The reviewer confirmed an authenticated store owner can send
  oversized uploads and recommended a request-changes finding scoped to this new
  endpoint.
- Draft updated to REQUEST_CHANGES for #345 with separate upload-limit and
  OpenAPI contract comments.

## Round 5: adversarial verification of #345 upload finding

- A fresh adversarial reviewer could not falsify the memory-buffering claim:
  Nest's interceptor calls Multer before parameter pipes, no limits are
  supplied, Multer defaults to memory storage with no file-size bound, and no
  global Multer/ingress cap exists.
- The reviewer notes older upload routes use the same pattern, but #345 adds
  this new reachable upload route; requiring a limit here is in scope.
- Keep severity `should fix`; `REQUEST_CHANGES` is proportionate for the API
  memory exhaustion risk.

## Round 6: event and hosted check wording

- #347 stays REQUEST_CHANGES for the directly observed API Prettier failure. Its
  E2E failure remains unattributed.
- #345 stays REQUEST_CHANGES for upload buffering plus missing OpenAPI request
  body.
- #343 changes to COMMENT, not APPROVE: the two prior code findings are fixed
  and API/E2E pass, but Codacy is failing with no GitHub diagnostic surfaced.

## Round 7: scope and candidate disposition

- An author-advocate/tone pass confirmed the #345 Multer memory-limit finding is
  in scope despite a similar pattern in older upload routes; this PR adds a new
  reachable upload path.
- Dropped the #345 OpenAPI `requestBody` candidate from posting:
  `apps/web/AGENTS.md` explicitly keeps multipart calls on raw `FormData`, and
  sibling upload endpoints follow the same schema pattern. The committed
  operation is less descriptive, but the omission does not break this client
  path and is not a merge blocker.
- Keep the #345 review body focused on the live resource risk.
- Freshly verify final draft and payload after this change; prior tone run saw
  an earlier draft revision and is superseded.

## Round 8: final payload gate and posting

- Final gate verified payload commit IDs against live heads, right-side diff
  anchors and matching line text, no duplicate threads, and factual CI claims.
- #345's OpenAPI request-body omission remained intentionally dropped after the
  author-advocate pass found the raw `FormData` convention and matching sibling
  patterns; the posted #345 review contains only the Multer resource finding.
- Raw Codacy check annotations were inspected: #343's `Math.random()` test
  suffix is a new issue under a zero-issue threshold; #345's findings are a
  browser-side fetch heuristic and SQL Server-only migration rule; #347's
  findings are SQL Server-only migration rules.
- Posted as `UltiRequiem`: #347 REQUEST_CHANGES (review 5676288503), #345
  REQUEST_CHANGES (review 5676289342), #343 REQUEST_CHANGES (review 5676289691).
  GitHub returned `CHANGES_REQUESTED` for each and accepted all three exact-head
  comments.
