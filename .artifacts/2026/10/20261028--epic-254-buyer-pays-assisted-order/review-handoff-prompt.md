# Review handoff: Epic #254 PR stack

Paste into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com` after the implementation session
finished. Use the `pr-review` skill.

## PRs to review

Filled in by the implementation agent at the end of its session (PR numbers and
branches, in stack order):

| #   | Branch                              | Base | PR number |
| --- | ----------------------------------- | ---- | --------- |
| PR0 | `chore/proof-upload-limits-helpers` | main | TBD       |
| PR1 | `refactor/buyer-proof-service`      | PR0  | TBD       |
| PR2 | `feat/public-proof-upload-api`      | PR1  | TBD       |
| PR3 | `feat/public-proof-upload-web`      | PR2  | TBD       |
| PR4 | `feat/seller-payment-api`           | PR0  | TBD       |
| PR5 | `feat/seller-payment-ui`            | PR4  | TBD       |

## Inputs

- Plan:
  `.artifacts/2026/10/20261028--epic-254-buyer-pays-assisted-order/plan.md`
- Plan review history: `.../review-log.md`
- Implementation handoff: `.../handoff-prompt.md`

## How to review

Use the `pr-review` skill: review notes and draft comments in `.artifacts/`
first, verify every claim by running code, review rounds with subagents until
clean, human approval before posting anything with `gh`. Review each stacked PR
against its own base first (`pr-review` section 0), then re-check the stack top.
Hosted CI exists only for PRs whose base is `main` (PR0 initially); for the
others use the implementer's local results and re-run
`gh workflow run ci.yml --ref <branch> -f
run_e2e=true` yourself.

## Checklist (from the plan's acceptance criteria and risks)

1. Token upload creates exactly one `BUYER_SUBMITTED/PENDING_REVIEW` row, one
   `PAYMENT_SUBMITTED` event (payload keys exactly `paymentId, amount, method`,
   amount a number) and one open `PAYMENT_PROOF_SUBMITTED` notification;
   `paymentStatus` unchanged.
2. Unknown/revoked/rotated token gives the same 404 as `GET :token`, even with
   an invalid file; failed requests write nothing and leave no bucket object.
3. Concurrency: balance and cap of 5 pending proofs hold under parallel uploads;
   token and session routes share the lock.
4. Image route: compound query, identical 404 on every miss, store-B payment
   with store-A token -> 404, seller-recorded capture -> 404, headers pinned,
   `<img>` still renders cross-origin.
5. Public DTO: allow-list intact; no `operationCode`, `recordedBy`,
   `voidReason`, image URL; `closure`, `expiresAt`, `paymentRejectionReason`
   correct and sanitized (`sanitizeDisplayText`).
6. Session endpoint: only the documented changes; its original assertions still
   pass; PR1 is a pure extraction (diff it).
7. Multer limits on session, seller and token routes behave (413/400, no
   buffering past the cap); busboy errors map to 400.
8. Web: raw-fetch carve-out follows AGENTS.md (`publicApiBase`,
   `credentials:
   "omit"`, `ApiError`, no custom headers); banner derived from
   `payments[]`; `canSubmitProof` rules (REJECTED, VERIFIED-with-balance, cap,
   expiry); reasons rendered as text; es/en parity; 375 px screenshots exist.
9. Seller API: duplicate 409 `{code, orderId}` only, nothing written/uploaded;
   CASH exemption; `paidAt` rules; `pending - reservedPending`; approve
   overshoot guard; `HttpException` not wrapped; tenant filters on the duplicate
   query (two-store test); real-DB normalization spec incl. accents and empty
   codes.
10. Seller UI: fields, duplicate dialog keeps the file, pending-proof hint,
    "Anular pago" visibility matrix, voided rows struck through,
    `DuplicateOperationCodeError`.
11. Generated files: `openapi.json`, `metadata.ts`,
    `packages/types/generated/**` clean after regeneration;
    `check-openapi-drift.sh` green.
12. No Prisma migration, no change to mobile or the state machine.

## Known risks to probe

Leaked-link trade-offs (R3), PR4 capture rule vs old dashboards (ship PR4+PR5
together), expired-vs-cancelled inference via event actor, legacy duplicate
codes not NFKC-normalized, the PDF deviation (must be called out to the user).

## After approval (human decides, you do not act on your own)

- Close issues the merged PRs fully satisfy: #262 (PR2), #260 (PR4), #269 (PR3),
  #270 (PR3), #266 (PR5); close epic #254 only after verifying plan section 9 on
  the merged build.
- Open follow-up tickets for the items in plan section 8 R11 (checkout Multer
  limits, per-proof rejection reason + events after VERIFIED, orphan sweep,
  VERIFIED-order void, token-keyed throttle, duplicate flag on buyer proofs,
  auto-close pending proofs on cancel/expiry, approve on a `PAYMENT_SUBMITTED`
  order falling through the early return, expiry sweep recompute inside the
  lock).
