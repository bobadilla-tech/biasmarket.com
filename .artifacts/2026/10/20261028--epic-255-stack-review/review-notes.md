# Epic #255 stack review (PRs #365 #366 #367 #368 #369 #371 #372)

Reviewed 2026-10-28 against the plan in
`../20261028--epic-255-post-purchase-google-claim/`. Heads reviewed: 365
`3fb41e71`, 366 `be184b86`, 367 `88817c74`, 368 `45f99b9d`, 369 `55ae8bb2`, 371
`4a960b29`, 372 `05080e99`. User later authorised: fix findings on the branches,
merge bottom-up, open follow-up issues (no waiting for draft approval).

## Ran (by five parallel reviewers, own worktrees/DBs)

- #365/#366: regression spec fails on old `loginWithGoogle` (8 failed / 44
  passed); mutation of `emailVerified` filter caught; receipt e2e 7/7, race
  mutation caught; turbo typecheck/lint/test api+web+types+i18n green.
- #367/#368: turbo 19/19 green; 13 mutations (3 survived, see findings); API e2e
  could not run in that worktree (mail-worker contention), not a PR defect.
- #369: e2e buyer-claim + public-orders 15/15; 7 claim-guard mutations; openapi
  drift 0.
- #371/#372: turbo 16/16; e2e 17/17; 9 mutations (1 survived).
- Ops: migrations on populated DB clean, `migrate diff` no drift, destructive
  check clean, old-release INSERTs OK, repo-wide lint/typecheck/test green at
  top, mobile typecheck green, enum consumers complete.

## Findings

| ID  | PR      | Sev        | Finding                                                                                                                                                            | Action                       |
| --- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| F1  | 365     | should fix | `existing.googleSub === identity.sub` (concurrent first login) throws Conflict instead of signing in                                                               | fix                          |
| F2  | 366     | should fix | state gate read outside the conditional `updateMany` (TOCTOU cancel/void)                                                                                          | fix                          |
| F3  | 367     | should fix | `BuyerNoticePrompt` not mounted on the Shipping page (IN_TRANSIT/READY/COMPLETED)                                                                                  | fix                          |
| F4  | 369     | should fix | web Sentry scrubber misses Referer, exception value, span data, contexts, extra; server `@sentry/node` has no `beforeSend`; `onRequestError` sends raw path        | fix                          |
| F5  | 372     | should fix | StrictMode test never exercises the SHOWN ref guard (mutation survives)                                                                                            | fix                          |
| F6  | 372     | question   | `entrega` not persisted after reload when receipt confirmed but not COMPLETED                                                                                      | fix (`receiptConfirmedAt`)   |
| F7  | 366-371 | should fix | committed Orval SDK differs from `generate` output (renames/reorder)                                                                                               | follow-up issue              |
| F8  | 369/371 | question   | #369 deployed alone redirects a successful claim to a 404 until #371                                                                                               | merge back to back; noted    |
| F9  | 365     | question   | unverified same-email buyer lands in a new empty Google account                                                                                                    | issue                        |
| F10 | 365     | question   | smaller hijack via victim confirming attacker-created account's email                                                                                              | issue                        |
| F11 | 372     | question   | server `recordInvite` does not enforce validated payment/rejected                                                                                                  | issue                        |
| F12 | 371     | question   | seller JSON still carries `buyerAccountId`                                                                                                                         | issue                        |
| F13 | 368     | nit        | timeline ordered by `createdAt` only                                                                                                                               | fix (id tiebreaker) if cheap |
| N   | various | nit        | stray DTO in #365, formatting churn, INVITE_CLICKED dedupe, unit test for `notice` allow-list, proof hook test, encodeURIComponent in orderDetail URL, 401 message | issue / opportunistic        |

## Dropped

P2002 handling (sound, verified against adapter-pg), duplicate-email side
effects, `RECEIPT_CONFIRMED` OrderEventType (already existed), unknown vs
revoked 404 order, open redirect, OriginGuard bypasses, Lima format (sound under
TZ=UTC), tracking URL scheme.

## Not verified

Real Google OAuth across domains/iOS Safari, 360px layouts, full 34-file e2e
suite (hosted CI on main-based PRs covers it), Codacy failures, production
`NEXT_PUBLIC_API_URL` value.

## Outcome (2026-10-28)

Fixes pushed to the PR branches, then merged bottom-up with merge commits
(GitHub restacked each child onto main; hosted CI green on every PR before its
merge):

- #365 `c4cae134` F1 (+3 race tests) -> merged
- #366 F2 atomic gate -> merged
- #367 F3 Shipping page prompt + sanitizer/proof-hook tests -> merged
- #368 F13 timeline id tiebreaker -> merged
- #369 F4 Sentry deep scrub + server `beforeSend` -> merged
- #371 no changes -> merged
- #372 F5/F6 -> merged. Main head `3b8e74f5`: push CI green, CD (build, deploy)
  green. Follow-up issues: #375 SDK drift, #376 unverified-account UX, #377
  residual hijack, #378 server invite preconditions, #379 seller buyerAccountId,
  #380 small items. Still unverified: Google cookie hand-off across real
  domains/iOS Safari, 360px layouts.
