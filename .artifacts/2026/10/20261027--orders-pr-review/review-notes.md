# Review notes: order-related pull requests

Date: 2026-10-27 (America/Lima). Repository: `bobadilla-tech/biasmarket.com`.
Reviewer account: `UltiRequiem` (confirmed with `gh api user`). Scope limited to
the three PRs shown in the supplied GitHub page.

## Snapshot and review state

| PR                                               | Head SHA                                   | Base SHA                                   | Existing review threads | Hosted checks at review                                                                                                              |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| #347 assisted payment rules and voids            | `f05d29f90e1793db8c944bb8e84f556b7b75d24c` | `0e8d8ace3bcf1256752da4769376a4091582b07a` | 7 CodeRabbit comments   | API and E2E fail; API log identifies Prettier failure on `apps/api/openapi.json`; Codacy action required; other applicable jobs pass |
| #345 tracking details and private package photos | `2b29a4ca6d839009ed92a36c79c86c55ec69bd9a` | `d7a40893f129fd7061918f01016516e3df0cd058` | none                    | API, Web, E2E, Migration Safety, Types, i18n, CI Success pass; Codacy action required                                                |
| #343 rate-limit public orders by visitor IP      | `9c973ed447b84d1a0fd14b36ea73954a8307e885` | `e32ce87ae79c1d30fdfca49ea60d74735f26193c` | 2 CodeRabbit comments   | API, E2E, CI Success pass; Codacy action required                                                                                    |

Each diff was read in full with lockfiles excluded. Each checkout is a detached
scratch worktree under
`/Users/ultirequiem/.codex/sessions/2026/10/27/biasmarket-pr-review/`.

## Findings

### #347

The seven existing CodeRabbit findings are addressed in the current head:
payment rows are filtered in customer aggregations, verified payments cannot be
voided, the seller endpoint is wired, overview revenue uses a DB aggregate,
`PAYMENT_SUBMITTED` is documented, the new index has a migration, and positive
partial deposits have a one-cent floor. An independent full-diff audit agreed
and its focused API suite passed (4 files, 42 tests).

New review finding: the generated `apps/api/openapi.json` is not
Prettier-formatted. `prettier --check` fails; the exact mismatch is in the new
void endpoint response schema at line 1744. Hosted API lint reports
`Prettier: 1 changed file(s) in apps/api/openapi.json`. The hosted E2E job also
exits 1 after a successful build, but its log provides no test or error detail,
so no cause is attributed.

### #345

Independent full-diff review found a live resource limit defect. The new route's
`FileInterceptor('file')` supplies no Multer `limits.fileSize`; there is no
global Multer configuration or Caddy body-size cap; Multer defaults to in-memory
buffering, and the `PACKED_PHOTO_PIPE` 5 MiB check runs after the interceptor. A
signed-in store owner can upload a much larger part and exhaust API memory.
Candidate comment anchor:
`apps/api/src/modules/orders/infrastructure/order.controller.ts:491`.

Focused API controller and public-order event tests passed (2 files, 25 tests),
and the order detail sheet test passed (6 tests). `git diff --check` passed.
Initial local test invocations could not resolve workspace package exports until
dependency packages were built; the successful rerun includes those workspace
builds.

No additional correctness or access-control defect was found in the independent
review.

### #343

Both existing CodeRabbit findings are addressed: Sentry trace context data is
scrubbed, and generated steady-state and canary API proxy blocks set
`X-Forwarded-For` from Caddy's parsed client IP. An independent full-diff audit
found no new concrete issue and rendered both proxy block shapes. Hosted API and
E2E checks pass. Codacy reports one new weak-randomness issue on the E2E run ID
at `apps/api/test/public-orders.e2e-spec.ts:29`; the value is only used to make
test email addresses unique, and the required check allows zero new issues.

Caddy's official documentation confirms the relevant semantics for
`trusted_proxies`, `trusted_proxies_strict`, and the `{client_ip}` placeholder:
https://caddyserver.com/docs/caddyfile/options and
https://caddyserver.com/docs/caddyfile/directives/reverse_proxy.

## Verification summary

- `git diff --check` passed for all three PRs.
- #347 focused API tests: 4 files, 42 tests passed (independent reviewer
  report).
- #345 focused API tests: 2 files, 25 tests passed; Web order detail test: 1
  file, 6 tests passed.
- #347 generated OpenAPI Prettier check failed at the added endpoint's response
  schema; exact hosted API lint failure matches.
- #345 upload endpoint's OpenAPI `post` operation was inspected and has no
  `requestBody`.
- #343 hosted API/E2E passed; proxy output was inspected for steady-state and
  canary configurations.

## Candidates investigated and dropped

- #345 OpenAPI request-body annotation: the committed POST operation lacks a
  multipart `requestBody`, but `apps/web/AGENTS.md` explicitly keeps multipart
  calls on raw `FormData`, and sibling upload endpoints use the same schema
  pattern. This does not break the new web client; dropped from the posted
  review as a docs-only consistency gap.
- Existing #347 and #343 CodeRabbit threads: their reported issues are addressed
  in the current heads. No duplicate comments were drafted.
- #347/#345 Codacy migration warnings: Codacy asks for `SET QUOTED_IDENTIFIER`
  in Prisma PostgreSQL migrations, which is SQL Server-specific and
  inapplicable.
- #345 Codacy SSRF annotation: the highlighted call is a browser-side fetch to
  the configured API origin with store/order path identifiers, not a server-side
  request to a user-supplied host.

## Final proposed review events

- #347: REQUEST_CHANGES for the hosted API Prettier failure on the generated
  OpenAPI artifact.
- #345: REQUEST_CHANGES for unbounded Multer buffering before the 5 MiB
  validation pipe.
- #343: REQUEST_CHANGES for the new `Math.random()` annotation, which leaves the
  configured Codacy check action required; the two earlier code findings are
  fixed and API/E2E pass.

## Posted reviews

Posted through `gh api` using the `UltiRequiem` profile on 2026-10-27 (local
date):

- #347 review `5676288503`: `CHANGES_REQUESTED`; inline comment `4395685651` at
  `apps/api/openapi.json:1744`.
- #345 review `5676289342`: `CHANGES_REQUESTED`; inline comment `4395686349` at
  `apps/api/src/modules/orders/infrastructure/order.controller.ts:491`.
- #343 review `5676289691`: `CHANGES_REQUESTED`; inline comment `4395686637` at
  `apps/api/test/public-orders.e2e-spec.ts:29`.

All three review `commit_id` values matched the live PR heads at posting. GitHub
returned the expected review states and right-side inline anchors.

## Not verified / limitations

- No end-to-end S3-backed upload or public photo stream was run locally; API and
  web component tests plus hosted CI were used.
- #347/#345 Codacy annotations are SQL Server-only migration warnings; #345 also
  has a browser-fetch SSRF heuristic; #343 flags test-only `Math.random()` at
  its newly added run ID.
- #347's E2E failure has no surfaced diagnostic after its successful build; do
  not infer it shares the lint failure.
- PR heads, check runs, or thread state may change before posting; the posting
  gate re-fetches each head SHA.
