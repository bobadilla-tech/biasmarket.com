# Implementation handoff: Epic #255 — post-purchase tracking and optional Google account

Paste into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com`. Written for: the implementation agent.
Source of truth:
`.artifacts/2026/10/20261028--epic-255-post-purchase-google-claim/plan.md` (read
it fully first; the file:line references are against `origin/main` @ `b6c97f50`,
re-verify them). Review history and the traps worth reading: `review-log.md`.

## Mission

Implement the six open issues of epic #255 as a stack of 7 PRs, in order: G3
receipt confirmation (#273), G1 buyer-notice WhatsApp templates (#272), G2 order
timeline (#274), D1 claim with Google (#271), D2 claimed orders in Mi cuenta
(#275), D3 save-order invites (#276), plus the Google verified-email linking fix
that D1 depends on. Open PRs only; do not merge, do not close or edit issues, do
not touch PR #364.

## Context

- Base: `origin/main` (the local checkout may be on any branch; run `git status`
  first, report anything uncommitted, never stash/reset it; `git fetch origin`).
- Epic #255 issue checkboxes are STALE. Already merged: A1 #257, A5 #261
  (`OrderEvent`, `OrderEventsService`, invite-event endpoint), B2 #264, B5 #267
  (tracking + packed photo), C2 #268 (buyer page), A4 #260 and C1 #262 (merged,
  issues still open). Open duplicate PR #364 (a second copy of the buyer page)
  must not be rebased onto.
- What does NOT exist (the real work): `claimedAt`/`buyerAccountId` are never
  written; no claim endpoint or `googleSub`; `CLAIMED`, `RECEIPT_CONFIRMED`,
  `BUYER_NOTIFIED` and `PAYMENT_VOIDED` are never emitted (void writes only an
  `AuditLog`); no `buyerConfirmedReceivedAt`; the public DTO has no timeline /
  `claimed` / `hasValidatedPayment` / `receiptConfirmedAt`; WhatsApp has no
  per-status types; no seller "Reclamado" badge (`assisted-order-section.tsx:85`
  is NOT one); the web page ignores tracking number and packed photo.
- Hard rules (CLAUDE.md): pnpm only, ESM, explicit `.js` imports in `apps/api`,
  web never imports `packages/db`, every tenant query filters by `storeId`,
  `assertOwnership` for seller mutations. Read `apps/web/AGENTS.md` before web
  code.
- The buyer public page shell (`pedido/[token]/page.tsx`) must stay FETCH-FREE
  (link-preview bots must not count as the first open); all new logic lives in
  client components.

## Decisions already made (plan section 3; do not re-litigate)

1. Google linking: `googleSub` first; else exactly one account with that email
   AND `emailVerified=true`; unverified same-email accounts are ignored (never
   linked, never flipped); account resolve/create runs OUTSIDE any transaction
   and handles P2002 by re-read/upsert. Applies to plain Google login too.
2. No "Empacado" notice (no such fulfillment status). Four notices: payment
   validated, in transit, ready, delivered.
3. Claim hand-off by a signed httpOnly cookie `bm_claim` (path
   `/api/account/google`, 10 min, HMAC context `"claim-ticket:"`, carries
   `{orderId, linkFp, moment?, exp}`) set by
   `POST /public/orders/:token/claim-ticket` (`OriginGuard`, throttled,
   browser-side with credentials). The start URL only has `claim=1&locale=`.
   NEVER put the order token, order id or a ticket in a URL or in OAuth `state`
   (a boolean only). `linkFp` = first 16 hex of `accessTokenHash`; the claim
   `updateMany` matches it. Callback clears both cookies first.
4. Claim requires: `VENDOR_ASSISTED`, not cancelled (status and paymentStatus),
   a validated payment (`countsTowardPaid` via the API-computed
   `hasValidatedPayment`), fingerprint match, not claimed by another account;
   same-account re-claim is idempotent. After claim, redirect to Mi cuenta
   (`my-purchases/orders/:id?claimed=1`); no return path stored anywhere.
5. Timeline is gated server-side by `claimedAt` (issue wording); it is an
   incentive, not access control. Public mapper picks fields (no payload
   spread), strips `paymentId`, maps `resolution` to a buyer-safe enum.
6. Receipt: only when `paymentStatus==='VERIFIED'`, not cancelled, fulfillment
   in IN_TRANSIT/READY/COMPLETED; idempotent; notification after commit, errors
   swallowed.
7. Seller release-claim endpoint, claim notification, PKCE/nonce, per-token
   throttles: deferred (do not build).

## Reviewed plan (ordered; each branch is based on the previous one, first from `origin/main`)

| # | Branch                           | Based on      | Scope (plan section 4)                                                                                                               | PR line                                  |
| - | -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1 | `fix/buyer-google-verified-link` | `origin/main` | PR 1: `googleSub` migration, `sub` extraction, verified-email linking, spec rewrite                                                  | Refs #271                                |
| 2 | `feat/receipt-confirmation`      | #1            | PR 2: `buyerConfirmedReceivedAt`, `NotificationType.RECEIPT_CONFIRMED`, endpoint, button, notification + all enum consumers          | Closes #273                              |
| 3 | `feat/buyer-notice-templates`    | #2            | PR 3: 4 `WhatsAppMessageType` values, utils builders, `buyer-notices` endpoint, `useBuyerNotice` prompt, settings editors            | Closes #272                              |
| 4 | `feat/order-timeline`            | #3            | PR 4: emit `PAYMENT_VOIDED`, public `claimed/lastUpdateAt/timeline/hasValidatedPayment`, Lima `Timeline`, tracking + photo rendering | Closes #274 (and C4 leftover, Refs #270) |
| 5 | `feat/claim-order-google`        | #4            | PR 5a: ticket cookie, claim flow, button, in-app-browser help, web Sentry scrub                                                      | Closes #271                              |
| 6 | `feat/claimed-orders-account`    | #5            | PR 5b: account list/detail endpoints, Mi cuenta route, labels, seller "Reclamado" badge                                              | Closes #275                              |
| 7 | `feat/save-order-invites`        | #6            | PR 6: invite rules/config, `moment`, events                                                                                          | Closes #276                              |

PRs 5 and 6 (5a/5b) must be merged together (the claim redirect lands on the 5b
page). Per-PR steps, files, migrations and tests are in plan section 4; mapping
of every issue bullet to a test is in plan section 9. Migration timestamps: use
a value later than the newest dir in `packages/db/prisma/migrations` at branch
time (two dirs already share `20261027230000`); each `ADD VALUE` migration has
nothing else in it (probe P1: a new enum value cannot be used in the same
transaction).

## Review findings to preserve (the traps)

- `loginWithGoogle` currently links ANY same-email account and flips it verified
  (pre-hijack). The regression test for this must be seen RED on the old code.
- Link rotation (`regenerate`/`correctPhone`) replaces `accessTokenHash` and
  never sets `accessTokenRevokedAt`; hence the fingerprint. Test: a cookie
  issued before `regenerate` cannot claim.
- A P2002 inside a Postgres transaction cannot be recovered (25P02): resolve the
  account outside it.
- `ALLOWED_PAYLOAD_KEYS` is a closed set: add `notice` in PR 3 and `moment` in
  PR 5a, and assert the STORED payload, not the input.
- `NotificationType` consumers to change: `notifications.controller.ts:27`,
  `notification-response.dto.ts:13,15`, i18n `types.RECEIPT_CONFIRMED` es/en,
  `notification-row.tsx:60`.
- The ticket POST must run in the browser (server calls use `INTERNAL_API_URL`);
  the Mi cuenta order page must fetch in the browser too (host-only session
  cookie).
- Fake-Prisma unit tests cannot prove atomicity: races are e2e only (call
  `claimWithGoogle` / the receipt endpoint with `Promise.all` against a real DB;
  pattern `apps/api/test/buyer-proof-submit-race.e2e-spec.ts`). Google is
  stubbed at the service level; never hit the real exchange.
- Public GET must keep `Cache-Control: no-store`; unknown and revoked tokens
  must be indistinguishable (identical 404 before any 409/422/503).
- Rollback: rows with the new enum values break an OLD Prisma client; put the
  "delete these rows first" note in the PR 2 and 3 bodies.

## Verification (PLANNED — none of this was run in the planning session)

Per PR:

```bash
pnpm install
pnpm db:generate                      # after any schema change
pnpm typecheck && pnpm lint && pnpm test
pnpm turbo run typecheck --filter=mobile   # PRs touching packages/types|utils|i18n (2,3,4)
# contracts, after any DTO change (needs the env vars set; generate:openapi already builds):
( set -a; . scripts/ci/e2e.env.example; set +a; pnpm --filter api generate:openapi ) && pnpm --filter @biasmarket/types generate
bash scripts/ci/check-openapi-drift.sh
BASE_SHA=$(git merge-base HEAD <parent-branch>) HEAD_SHA=$(git rev-parse HEAD) bash scripts/ci/check-destructive-migrations.sh   # migration PRs
```

Race-sensitive PRs (2 and 5a) also run, with Docker running:

```bash
( set -a; . scripts/ci/e2e.env.example; set +a; bash scripts/ci/e2e.sh )   # logs in .ci/e2e-*.log
```

(do not run `e2e-datastores.sh` yourself). Record each result (or "not run" +
why) in the PR body. For the listed regression tests, show red on the old code
(stash the production change, run, restore) and say so in the PR. Manual per
migration PR: apply the migration to a populated throwaway Postgres (own
instance, non-default port, delete it). Manual UI: 360 px width for the notice
prompt, explainer, in-app-browser help and invite block; iOS Safari check of the
claim cookie hand-off if a staging domain exists.

## Acceptance criteria

The six issues' own bullets mapped in plan section 9, plus: `PAYMENT_VOIDED`
shows in a claimed timeline; no raw token, full phone, email, `paymentId` or
seller free text in buyer-visible event payloads (key-set tests); a claimed
order's token link still works; no invite without a validated payment; a
pre-`regenerate` claim cookie cannot claim; an unverified same-email account is
never linked.

## Constraints and blockers

- Do NOT: edit `packageManager`; add `npm/yarn`; import `@biasmarket/db` in web;
  store the raw order token anywhere; put a token/ticket/order id in a URL or
  OAuth `state`; push to or open a PR against any branch other than the stack
  base policy below; merge; close issues; touch PR #364; commit `.artifacts`
  changes unless asked; commit probe/scratch code.
- Stop and ask the human if: a decision above turns out impossible (e.g. web and
  API are not same-site in prod so the cookie hand-off cannot work), a migration
  would need a destructive statement, or the Prisma/Next version contradicts the
  plan.
- Open questions with defaults (use the default if unanswered): Q1 verified-only
  linking also for plain login = yes; Q3 validated payment required to claim =
  yes; Q4 timeline gated by `claimedAt` = yes; Q5 idempotent receipt = yes; Q8
  7-day dismissal = yes; Q9 release-claim endpoint = not now. Q7 (closing
  duplicate PR #364 and stale issues #260/#262/#270) is a USER action — do not
  do it.

## Stack base policy

- PR 1 targets `main`. Each later PR's base is the previous PR's branch
  (`gh pr create --base <previous-branch>`), so the diff shows only its slice.
- Hosted CI runs only for PRs based on `main` (`ci.yml`:
  `pull_request:
  branches: [main]`), so stacked PRs get NO CI: the local
  checks above are the gate.
- Never push to `main`. After a parent is squash-merged by a human:
  `git rebase --onto origin/main <old-parent-branch> <child-branch> && git push --force-with-lease`
  then `gh pr edit <n> --base main`. Do not force-push anything else.

## PR instructions

Open the PRs in order, stacked, no merge. Title style as in recent PRs
(`feat(orders): …`, `fix(auth): …`, Conventional-Commit prefix, scope, short
subject, issue ref). Body: summary bullets, "Closes/Refs #N", the verification
section with real results ("not run" where not run), the behavior-change /
rollback notes (PR 1: existing Google users with unverified-email accounts get a
new account; PR 2/3: delete rows before rolling back), and a manual-checks list.
End commit messages with the attribution line required by the session reminder.
No skills/tooling PR is needed (the `implementation-plan` skill is already
merged).

## First action

1. `git status`, `git fetch origin`, report the current branch/uncommitted work.
2. Read the plan end to end, `review-log.md`, `CLAUDE.md`, `apps/web/AGENTS.md`.
3. Re-verify the plan's file:line references against `origin/main`.
4. Create `fix/buyer-google-verified-link` from `origin/main` and start PR 1
   (write the pre-hijack regression test first and watch it fail).
