# Handoff prompt: assisted order seller flow (implementation session)

Work unit: seller creates an order for a buyer known only by WhatsApp number and
sends a private link. Plan, review history and this prompt live in
`/Users/ultirequiem/ulti/biasmarket.com/.artifacts/2026/10/20261027--assisted-order-seller-flow/`
(`plan.md` is the source of truth, `review-log.md` has six review rounds).
These files are snapshots from 2026-10-27 and are untracked: they exist only in the
user's checkout, so read them by absolute path. Verify every claim against current code.

---

You are implementing `plan.md` in the Bias Market monorepo (`/Users/ultirequiem/ulti/biasmarket.com`,
GitHub `bobadilla-tech/biasmarket.com`). This session does implementation and opens PRs. It does not
merge, close issues, or review.

## Mission

Land eight stacked PRs plus one tooling PR so that a seller can create an assisted order from a phone
(#259 API, #263 form, #264 created screen + WhatsApp, #265 detail actions), reusing the checkout's
price/stock/delivery rules, never creating a `BuyerAccount`, never storing the link token in clear.

## Read first (in this order)

1. `plan.md` completely (sections 4, 5, 5.1-5.4, 7, 8, 10 are the working core).
2. `review-log.md` (why the design is the way it is; do not re-litigate).
3. `CLAUDE.md`, `apps/web/AGENTS.md` (check `node_modules/next/dist/docs/` before Next.js code),
   `docs/core/blue-green-migrations.md`, `.artifacts/AGENTS.md`, `.claude/skills/pr-review/SKILL.md`.
4. Issues (one per call): `for n in 259 263 264 265 258 262 268; do gh issue view $n; done`.

## Review findings to preserve (details in `review-log.md`)

- Lock-order deadlock between checkout and assisted create was reproduced on a real DB; Customer before stock.
- A stale-token first-open can stamp a freshly rotated link as opened; hash filter required.
- Deleting the old Customer on phone correction can orphan a concurrent order; do not delete.
- Stacked PRs get no CI; orval version drift rewrites 33 files; `Closes` does not fire off-main.
- Guard `expiresAt` only for hold statuses (VERIFIED orders keep a past `expiresAt`).

## Decisions already made (do not change without asking)

- Stack is one linear chain; PR0 and PR1 are based on `origin/main` (main is `cc538b78` at planning time;
  `git fetch` first). The follow-up branch was merged as #322.
- Core extraction = plain exported functions (`validateDeliveryPreTx`, `lockAndValidate`, `reserveItems`),
  no new injectable; `CreateOrderUseCase` constructor and its spec stay untouched.
- Lock order in every order-creating transaction: pickup point -> courier -> Customer -> stock -> Order insert.
- Customer for assisted orders: raw `INSERT ... ON CONFLICT ("storeId","phone") DO NOTHING` (explicit id),
  then `findUnique` (retry once; second null -> 409), then `updateMany where name null`. No try/catch around
  statements inside a transaction. No delete of the old Customer on phone correction.
- Seller routes throttled per user id (`SellerThrottlerGuard`), not per IP (IP buckets are global behind Caddy;
  changing `trust proxy` is out of scope).
- Regenerate/correct-phone: `SELECT ... FOR UPDATE` on the Order, re-read, decide from the locked row; 409 when
  CANCELLED / paymentStatus CANCELLED / hold-status order past `expiresAt`; VERIFIED orders may regenerate;
  correct-phone additionally needs `linkFirstOpenedAt` and `claimedAt` null. First-open `updateMany` gets the
  token-hash filter (first commit of PR3).
- WhatsApp default message built in TS with a conditional greeting (no regex, no new token).
- No feature flag. The "Nuevo pedido" button is wired in PR7 and PR7 must not be released before #268 ships.
- `Refs` only in stacked PRs; the user closes issues.
- `accessUrl` helper default `${WEB_URL}/es/store/{slug}/pedido/{token}`. **Ask the user to confirm this
  path (plan Q4) before opening PR2.**

## Ordered work (see plan section 5 table and 5.1 for bases, verify and must-not-change)

0. PR0 `chore/implementation-plan-skill` from `origin/main`: copy
   `/Users/ultirequiem/ulti/biasmarket.com/.claude/skills/implementation-plan/SKILL.md` (untracked in the
   user's checkout; absent on `origin/main`) into the same path in the worktree and commit only it. State in the
   PR body that the "appears in the Skill listing" check can only be done after merge. This goes first.
1. PR1 `feat/assisted-order-core-extraction` (main): plan 4.1, zero spec edits.
2. PR2 `feat/assisted-order-create-endpoint` (PR1): plan 4.2 + concurrency e2e + openapi/orval.
3. PR3 `feat/assisted-order-link-endpoints` (PR2): plan 4.3 (first commit: first-open guard).
4. PR4 `feat/assisted-order-whatsapp-template` (PR3): plan 4.4 (enum migration in its own file).
5. PR5 `refactor/checkout-delivery-rules` (PR4): plan 4.5-a, unit tests first.
6. PR6 `feat/assisted-order-new-order-form` (PR5): 4.5-b (+ i18n parity test; button NOT wired).
7. PR7 `feat/assisted-order-created-screen` (PR6): 4.5-c + button wiring.
8. PR8 `feat/assisted-order-detail-actions` (PR7): 4.5-d.

Procedure for git/gh, retargeting and issue comments: plan 5.2 and 5.3 (scratch worktrees, `gh pr create
--base <previous-branch>`, `--body-file` with `## Resumen` / `## Verificación`; Spanish bodies; conventional
titles with the issue number; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`;
PR body footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).

## Verification (planned; label what you actually ran)

Per worktree: `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm db:generate`,
`DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public pnpm turbo run build --filter='./packages/*'`.
Then the per-PR commands in plan sections 5.1 and 7 (typecheck api/web/utils/types, vitest invocations,
openapi drift script, destructive-migration script with `BASE_SHA`/`HEAD_SHA`, e2e on your own Postgres at
port 55432 with `DATABASE_URL` overridden). Paste trimmed real output in each PR body. Never write "passes"
for something you did not run. CI only runs on PRs targeting `main`.

## Constraints and blockers

- [ ] Do not modify the user's checkout, stash, reset, or push to branches you did not create. Work only in
      scratch worktrees (`git worktree add <scratch>/prN -b <branch> <base>`); remove them at the end.
- [ ] Do not merge, close issues, change the `packageManager` pin, or commit `.artifacts/`.
- [ ] pnpm only; ESM; `.js` extensions on relative imports in `apps/api`; every query filters by `storeId`;
      web never imports `packages/db` or `@prisma/client`; migrations expand-only.
- [ ] openapi.json is the full regenerated output; in `packages/types/generated/**` keep only the files for
      tags you touched (orval version drift rewrites 33 files otherwise).
- [ ] No token, full phone, or alias in AuditLog/OrderEvent/logs/thrown messages.
- Stop and ask the user if: a plan fact no longer holds and the fix changes scope; PR1's spec needs edits;
  the buyer URL path (Q4) is not confirmed; a conflict with the mobile stack (#232-#237) touches
  `schema.prisma`.
- Report blockers in the final message with what you tried and the evidence.

## Acceptance criteria

Plan section 10 and 10.1, plus per-PR rows of 5.1. Deferrals in 10.2 are intentional.

## End of session deliverable

Reply with a table of PR numbers/URLs/bases/tip SHAs, the exact verification you ran per PR (and what you
could not run), deviations from the plan, and the filled-in review handoff:
fill the `<PR LIST>` placeholders in `review-handoff-prompt.md` in this folder and print it for the user.

## First action

`git fetch origin` (never pull/merge in the user's checkout, which sits on a branch one commit behind
`origin/main`); `git status` there (report, do not touch); read the files above;
ask the user to confirm plan Q4; then create the PR0 worktree and open PR0.
