# Review handoff: Epic #255 PR stack (post-purchase tracking + Google claim)

Paste into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com`. Written for: the review agent. Use the
`pr-review` skill (`.claude/skills/pr-review`): research notes and draft
comments go into `.artifacts/` first, verify every claim by running code, run
subagent review rounds until clean, and WAIT for human approval before posting
anything with `gh`.

## PRs under review (the implementer fills these in at the end of their session)

| # | PR number / branch                         | Base        |
| - | ------------------------------------------ | ----------- |
| 1 | `fix/buyer-google-verified-link` — #____   | `main`      |
| 2 | `feat/receipt-confirmation` — #____        | PR 1 branch |
| 3 | `feat/buyer-notice-templates` — #____      | PR 2 branch |
| 4 | `feat/order-timeline` — #____              | PR 3 branch |
| 5 | `feat/claim-order-google` (5a) — #____     | PR 4 branch |
| 6 | `feat/claimed-orders-account` (5b) — #____ | PR 5 branch |
| 7 | `feat/save-order-invites` — #____          | PR 6 branch |

## Sources

- Plan:
  `.artifacts/2026/10/20261028--epic-255-post-purchase-google-claim/plan.md`
- Review history (traps already found): `.../review-log.md`
- Implementation handoff: `.../handoff-prompt.md`
- Issues: `gh issue view 272 273 274 271 275 276` (epic #255). Issue checkboxes
  are stale.

## How to review

Review each PR against its own base first (diff = its slice only), then re-check
the stack top (`pr-review` section 0). Hosted CI exists only for PRs based on
`main`; for the others rely on the author's local results and re-run the key
commands yourself (do not trust "passed" claims; the planning session ran none
of them). Use your own scratch worktrees and throwaway Postgres on a non-default
port; do not touch the author's checkout.

## Checklist (acceptance criteria and known risks from the plan)

Security / privacy

- [ ] Google linking: `googleSub` first, verified-email only, unverified
      same-email account never linked or flipped; the regression test fails on
      the old code (run it against `origin/main`'s `loginWithGoogle`).
- [ ] Account resolve/create happens outside the claim transaction; P2002
      handled.
- [ ] No raw token, order id or ticket in any URL, OAuth `state`, log, Sentry
      event, or event payload; `bm_claim` has a distinct HMAC context, path
      `/api/account/google`, cleared on every callback branch; start link alone
      grants nothing (login-CSRF); `OriginGuard` attached to the ticket POST.
- [ ] Claim `updateMany` carries `source`, not-cancelled, `claimedAt:null`,
      `buyerAccountId:null`, `accessTokenRevokedAt:null`,
      `accessTokenHash startsWith linkFp`; a cookie issued before `regenerate`
      cannot claim; validated payment required.
- [ ] Unknown vs revoked token: identical 404 on every new public endpoint,
      before any 409/422/503.
- [ ] Public timeline mapper picks fields (no payload spread): no `paymentId`,
      no seller free text; exact key-set tests on public and account DTOs and on
      STORED payloads.
- [ ] `GET /account/orders/:orderId` filters `{id, buyerAccountId}` in the
      query; foreign id → 404; explicit selects.
- [ ] Every seller endpoint (`buyer-notices`) uses `assertOwnership` and
      `{id, storeId}`.
- [ ] Web never imports `packages/db`; ticket POST and Mi cuenta order page run
      in the browser with credentials; the public page shell still makes no
      fetch.

Correctness / concurrency

- [ ] Receipt: gating (VERIFIED, not cancelled, IN_TRANSIT/READY/COMPLETED),
      once-only via conditional `updateMany`, notification after commit and
      failure-tolerant; e2e race test exists and actually runs against Postgres.
- [ ] Claim race e2e: exactly one winner; idempotent same-account re-claim also
      issues a session; `CustomerStoreLink` upserted inside the transaction.
- [ ] `PAYMENT_VOIDED` now emitted and appears in a claimed timeline; Lima
      formatting uses explicit `timeZone`, tests use fixed instants.
- [ ] Invite rules: no invite without a validated payment; never
      cancelled/expired/rejected/claimed; one per page; `pago_validado` first
      open vs `banner`; `COMPLETED` → `entrega` even if dismissed; localStorage
      failure safe; `INVITE_SHOWN` StrictMode-safe; `CLAIMED` payload carries
      `moment`.
- [ ] G1: messages contain no link; token columns never written;
      `BUYER_NOTIFIED` payload is only `{notice}`; prompt hooked at all call
      sites incl. `use-review-payment-proof.ts`, VENDOR_ASSISTED only.

Operations

- [ ] All migrations additive; each `ADD VALUE` migration contains only that
      statement; timestamps do not collide; `check-destructive-migrations.sh`
      clean; populated-table check noted.
- [ ] All `NotificationType` / `WhatsAppMessageType` consumers updated
      (controllers, DTOs, i18n, web editors); OpenAPI, `metadata.ts`, Orval
      output regenerated and `check-openapi-drift.sh` clean.
- [ ] Rollback notes present in PR 2/3 bodies; web reads new DTO fields as
      optional.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green per PR; mobile typecheck
      for PRs touching shared packages.

Known accepted gaps (do not flag as defects, flag only if worse than described)

- Seller release-claim endpoint and claim notification not built (follow-up).
- PKCE/OIDC nonce, per-token throttles, `INVITE_CLICKED/DISMISSED` dedupe not
  built.
- Full timeline of a claimed order is visible to any link holder (incentive, not
  access control).
- Plan exit bar (two consecutive clean review rounds) was not met; see
  `review-log.md` end. Residual uncertainty: the cookie hand-off has never been
  run end to end across real domains (iOS Safari), and the Google-login behavior
  change.

## Output

Draft review notes and comments under a new
`.artifacts/2026/10/<date>--epic-255-stack-review/` folder, present the drafts
to the human, post nothing until they approve.
