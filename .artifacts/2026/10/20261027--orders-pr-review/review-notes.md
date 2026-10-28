# Review notes: order-related pull requests

Date: 2026-10-27 (America/Lima). Repository: `bobadilla-tech/biasmarket.com`.
Reviewer account: `UltiRequiem` (confirmed with `gh api user`). Scope limited to
the three PRs shown in the supplied GitHub page.

## Snapshot and review state

| PR                                               | Head SHA                                   | Base SHA                                   | Existing review threads | Hosted checks at review                                                                                                    |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| #347 assisted payment rules and voids            | `f05d29f90e1793db8c944bb8e84f556b7b75d24c` | `0e8d8ace3bcf1256752da4769376a4091582b07a` | 7 CodeRabbit comments   | API and E2E fail; API log identifies Prettier failure on `apps/api/openapi.json`; Codacy fails; other applicable jobs pass |
| #345 tracking details and private package photos | `2b29a4ca6d839009ed92a36c79c86c55ec69bd9a` | `d7a40893f129fd7061918f01016516e3df0cd058` | none                    | API, Web, E2E, Migration Safety, Types, i18n, CI Success pass; Codacy action required                                      |
| #343 rate-limit public orders by visitor IP      | `9c973ed447b84d1a0fd14b36ea73954a8307e885` | `e32ce87ae79c1d30fdfca49ea60d74735f26193c` | 2 CodeRabbit comments   | API, E2E, CI Success pass; Codacy fails                                                                                    |

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

Independent full-diff review found that
`POST /stores/{storeId}/orders/{orderId}/shipping/photo` has
`@ApiConsumes('multipart/form-data')` but its committed OpenAPI operation has no
`requestBody`. The web client sends `FormData`, but API docs and generated
clients cannot learn that `file` is required. Candidate comment anchor:
`apps/api/src/modules/orders/infrastructure/order.controller.ts:489`.

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
E2E checks pass. Codacy is red but exposes no finding in the GitHub check output
inspected.

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

## Not verified / limitations

- No end-to-end S3-backed upload or public photo stream was run locally; API and
  web component tests plus hosted CI were used.
- #343's Codacy failure has no surfaced diagnostic in the GitHub run output.
- #347's E2E failure has no surfaced diagnostic after its successful build; do
  not infer it shares the lint failure.
- PR heads, check runs, or thread state may change before posting; the posting
  gate re-fetches each head SHA.
