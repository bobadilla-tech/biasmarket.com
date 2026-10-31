# Implementation handoff: Epic #254, the buyer sees and pays an assisted order without an account

Paste into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com`. Written for: the implementation agent.
Source of truth:
`.artifacts/2026/10/20261028--epic-254-buyer-pays-assisted-order/plan.md` (read
it fully first; file:line references are against `origin/main` @ `1aef25f6`,
re-verify them). Review history and the traps worth reading: `review-log.md`
(four review rounds; read the "Facts the reviewers corrected" table).

## Mission

Finish epic #254 as a stack of 6 PRs, in order: PR0 shared upload limits and
text helpers, PR1 refactor of the buyer-proof logic into one service, PR2 token
API for the buyer's proof upload plus the public DTO fields (C1/C3 API), PR3
buyer web upload and order states (C3/C4 web), PR4 seller payment API (A4/B4),
PR5 seller payment UI (B4). Open PRs only; do not merge, do not close or edit
issues (the reviewing agent does), do not touch other people's PRs.

## Context

- Base: `origin/main`. Run `git status` first and report anything uncommitted;
  never stash, reset or stage it. `git fetch origin`.
- The issue checkboxes are STALE. Already merged: A1 #257, A3 #259, B2/B3
  (#264/#265), B5 #267, C2 #268 (buyer page, #364), A4 core (#347: columns,
  `countsTowardPaid`, void use case, `findDuplicateOperationCode`), epic #255
  (timeline, claim, receipt, notices). `GET /public/orders/:token` (C1) is done.
- What is really missing: the token upload `POST /public/orders/:token/payments`
  (+ proof image route), public DTO fields
  (`payments[].id/hasProof/method/paidAt`, `paymentRejectionReason`, `closure`,
  `expiresAt`), seller `operationCode` / `paidAt` / duplicate 409 / required
  capture / overshoot guards, and all their UIs (buyer upload form, IN_TRANSIT
  and EXPIRED states, seller form fields, duplicate dialog, "Anular pago").
- Hard rules (CLAUDE.md): pnpm only, ESM, explicit `.js` imports in `apps/api`,
  web never imports `packages/db`, every tenant query filters by `storeId`,
  `assertOwnership` for seller mutations, money is `Decimal`. Read
  `apps/web/AGENTS.md` before web code (multipart is a documented raw-fetch
  carve-out).
- The buyer page shell (`pedido/[token]/page.tsx`) stays FETCH-FREE.
- No API field ever carries `paymentStatus = PAYMENT_SUBMITTED` after a buyer
  upload (nothing sets it); the web derives "en revisión" from `payments[]`.
- `apps/api/src/metadata.ts` is tracked: regenerate and commit it with
  `apps/api/openapi.json` and `packages/types/generated/**`.

## Decisions already made (plan sections 3-4; do not re-litigate)

1. One `BuyerPaymentProofService` serves both the session route and the token
   route. PR1 extracts it with zero behavior change; PR2 hardens it (in-lock
   state recheck, `computePaymentSummary` + `voidedAt`, strict amount regex,
   `expiresAt`, cap of 5 pending proofs, operation code/note validation).
2. Token route: `PublicOrderTokenGuard` (after `ThrottlerGuard`, before Multer)
   resolves the token with the same 404 as `GET :token`; POST-only 415 check;
   10/min throttle; `@PublicOrder()` Symbol-keyed param decorator.
3. Image route: one compound query (`id`, `orderId`, `source = BUYER_SUBMITTED`,
   `imageUrl` not null), identical 404 on every miss, content type forced from
   an allow-list, `CORP: cross-origin`, nosniff, CSP sandbox, `no-store`.
4. JPEG/PNG only (no PDF). Tell the user in the PR 2/3 descriptions that this
   deviates from #269's "JPEG/PNG/PDF" and how to enable PDF later (plan Q2).
5. Expired vs cancelled: `closure.kind = EXPIRED` iff the last `ORDER_CANCELLED`
   event has `actor = SYSTEM`. Expired orders have BOTH `status` and
   `paymentStatus` CANCELLED.
6. Seller duplicate detection: ASCII-only normalization (NFKC, strip non
   `[A-Za-z0-9]`, uppercase), excludes voided, REJECTED and same-order pending
   proofs, 409 body exactly `{ code: 'DUPLICATE_OPERATION_CODE', orderId }`.
7. Seller `paidAt`: ISO datetime with offset/`Z` only; web sends noon Lima.
8. Buyer sees only the order-level `paymentRejectionReason` (no per-proof
   reason, no migration).
9. No Prisma migration anywhere in this stack.

## Reviewed plan (ordered steps, one PR per slice)

| #   | Branch                              | Base | Scope (plan section) | PR line                  |
| --- | ----------------------------------- | ---- | -------------------- | ------------------------ |
| PR0 | `chore/proof-upload-limits-helpers` | main | 4.0                  | Refs #269, Refs #266     |
| PR1 | `refactor/buyer-proof-service`      | PR0  | 4.1                  | Refs #269                |
| PR2 | `feat/public-proof-upload-api`      | PR1  | 4.2                  | Refs #269, Closes #262   |
| PR3 | `feat/public-proof-upload-web`      | PR2  | 4.3                  | Closes #269, Closes #270 |
| PR4 | `feat/seller-payment-api`           | PR0  | 4.4                  | Closes #260, Refs #266   |
| PR5 | `feat/seller-payment-ui`            | PR4  | 4.5                  | Closes #266              |

Work order: PR0, then chain A (PR1-PR3), then chain B (PR4-PR5), unless the user
asks for parallel worktrees. Follow sections 4.x of the plan literally; the plan
names files, rules, error messages and test cases.

## Review findings to preserve (full list in review-log.md)

- Never let the server trust the guard's order copy: recompute in the lock.
- A seller payment must not exceed `pending - reservedPending`; approving a
  buyer proof must not exceed the remaining balance (overshoot bug).
- `addPayment` wraps its transaction in a catch-all `BadRequestException`: the
  409 must be thrown outside it and `HttpException`s rethrown as is.
- `ApiError` has no body: `orders.api.ts` must read the 409 JSON and throw a
  typed `DuplicateOperationCodeError`.
- Web multipart: `publicApiBase()`, `credentials: "omit"`, `ApiError`, no custom
  headers (a preflight would be rejected).
- Never put the operation code, note, `file.originalname`, IP or user agent in
  events, audit logs or notifications.
- Orval: every new DTO field needs `@ApiProperty`; routes stay in
  `public-order-events.controller.ts` (same Orval tag).

## Verification (planned unless marked run; label what you actually ran)

```bash
pnpm turbo run lint typecheck test --filter=api --filter=web --filter=@biasmarket/types --filter=@biasmarket/validation --filter=@biasmarket/i18n
cd apps/api && pnpm exec vitest run src/modules/orders       # baseline run by the planner: 25 files / 296 tests / 2.3 s
pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate
pnpm --filter api build && bash scripts/ci/check-openapi-drift.sh
pnpm --filter web exec vitest run __tests__/i18n-parity.test.ts
bash scripts/ci/e2e.sh                                       # Docker; logs in .ci/e2e-*.log
gh workflow run ci.yml --ref <branch> -f run_e2e=true        # stacked branches have no pull_request CI
```

Each PR description lists what was run and the result ("e2e ran: yes/no, how"),
and for PR3/PR5 the manual checklist with 375x812 screenshots.

## Acceptance criteria

Plan section 9 (12 items). Copy the relevant ones into each PR description.

## Constraints and blockers

- Do not change: the session endpoint's observable contract beyond the
  documented fixes (plan section 3), `buildRegisterPaymentSchema` /
  `RegisterPaymentInput`, `apps/mobile`, the state machine, any Prisma schema,
  `packageManager`.
- Stop and ask if: a plan fact is false in a way that changes scope;
  `scripts/ci/e2e.sh` cannot run (no Docker) — then say which API checks were
  not run; real clients send amount formats the strict regex rejects. (Not a
  stop: if the wiki decisions D-06/D-07/D-10/D-13 contradict the implemented
  void/streaming behavior, report it and keep the implemented behavior, plan
  Q1.)
- Open questions with defaults to use if the user does not answer: Q2 no PDF; Q3
  legacy cancelled orders -> `CANCELLED`; Q4 duplicate scope as written; Q6 DTO
  output sanitization; Q7 sequential, no parallel worktrees.

## Stack base policy

- PR0 targets `main` (hosted CI). Every other PR targets the branch listed in
  the table; hosted CI does not run for them, so use the local gate and the
  `workflow_dispatch` command above.
- Never push to `main`. Never force-push a branch someone else has reviewed.
- Retarget when the base merges: `gh pr edit <n> --base main` (after the
  user/reviewer approves GitHub writes), then rebase and regenerate generated
  files per plan section 5 (never hand-merge `openapi.json`, `metadata.ts` or
  `packages/types/generated/**`).

## PR instructions

Open the PRs in order, stacked, no merge. Title style as in recent PRs
(`feat(orders): ...`, `refactor(orders): ...`, `chore(api): ...`, short subject,
issue ref). Body: summary bullets, "Closes/Refs #N", verification with real
results ("not run" where not run), behavior-change / rollback notes (PR0: Multer
limits and a 500-character `note` check on the live routes; PR2: stricter
amount/validation on the session route; PR4: capture required for non-cash, ship
PR4 and PR5 in one release), and a manual-checks list. End commit messages with
the attribution line the session reminder gives, if one is present. No
skills/tooling PR is needed (both skills are on main).

## First action

1. `git status`, `git fetch origin`; report branch, uncommitted work,
   `origin/main` SHA, open PRs touching `apps/api/src/modules/orders` or
   `apps/web/features/public-order`, and whether Docker is available.
2. Read the plan end to end, `review-log.md`, `CLAUDE.md`, `apps/web/AGENTS.md`.
3. Re-verify the plan's file:line references against `origin/main`.
4. Create `chore/proof-upload-limits-helpers` from `origin/main` and start PR0
   (write the limit tests first and watch them fail).
