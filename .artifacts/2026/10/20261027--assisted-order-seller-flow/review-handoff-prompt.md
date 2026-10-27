# Handoff prompt: review the assisted order PR stack (review session)

Work unit: review the PRs opened by the implementation session for
`.artifacts/2026/10/20261027--assisted-order-seller-flow/plan.md`. The implementer fills the
`<PR LIST>` block below at the end of their session; if it is still a placeholder, list the open PRs with
`gh pr list --state open --json number,title,headRefName,baseRefName,headRefOid` and find the
`feat/assisted-order-*`, `refactor/checkout-delivery-rules` and `chore/implementation-plan-skill` branches.

<PR LIST>
(PR number | branch | base | head SHA | tip SHA recorded for rebases | local verification noted in body)
</PR LIST>

---

Use the `pr-review` skill (`/pr-review`, `.claude/skills/pr-review/SKILL.md`) and follow it end to end:
research notes and draft comments in a new folder `.artifacts/2026/10/YYYYMMDD--assisted-order-stack-review/` (today's date)
(`review-notes.md`, `draft-comments.md`, `review-rounds.md`), verify every claim by running code, subagent
review rounds A-E until two consecutive rounds produce nothing new, then STOP and present the drafts. Post
nothing until the user approves.

## Stack specifics

- Review each PR against its OWN base (`git diff origin/<base>...origin/<head>`), then re-check the stack top.
  The stack is a linear chain; PR0 and PR1 are based on `main`, the rest on the previous PR.
- GitHub CI only runs for PRs targeting `main`, so for PR2-PR8 you must run the checks locally in a scratch
  worktree at the top branch: install, `db:generate`, package build, typecheck (api/web/utils/types), the vitest
  files named in plan 5.1, `scripts/ci/check-openapi-drift.sh`, `scripts/ci/check-destructive-migrations.sh`
  (`BASE_SHA`, `HEAD_SHA`), and e2e on your own throwaway Postgres (non-default port, delete after).
- Do not touch the user's checkout, the user's containers, or the author branches. Reviewer identity per the skill.

## Review checklist (from the plan and its review rounds)

1. PR1: `create-order.usecase.spec.ts`, other orders specs, `orders.e2e-spec.ts` unchanged and green; call order of
   DB statements identical (pickup lock, courier lock, checkout Customer upsert before stock).
2. Lock order everywhere: pickup -> courier -> Customer -> stock -> Order insert. Reproduce the deadlock probe
   (checkout with email vs assisted create, same phone/product) on a real DB against the PR2 head.
3. Customer handling: no `BuyerAccount`/`CustomerStoreLink`; no overwrite of email/emailVerified/name; concurrent
   creates for the same new phone both succeed; second-null path; no try/catch inside a transaction.
4. Token: >= 32 bytes, only the hash stored, `accessUrl` only in create/regenerate/correct-phone responses with
   `no-store` and `no-referrer`; no token/phone/alias in AuditLog, OrderEvent payload, logs, thrown messages.
5. PR3: regenerate/correct-phone read state from the locked row; 409 matrix (cancelled, paymentStatus cancelled,
   hold-status past `expiresAt`, VERIFIED allowed); first-open hash filter (stale first-open stamps nothing);
   foreign/nonexistent order ids return the same 404; mutation-test each guard (remove it, suite must fail).
6. Throttle: user-id keyed, two users on one IP get separate buckets; `trust proxy` untouched.
7. PR4: migration contains only `ALTER TYPE ... ADD VALUE`; old-release behavior (parseType 400, checkout reads
   only NEW_ORDER); `grep PAYMENT_REMINDER` signal; clean greeting with and without alias; wa.me encoding.
8. PR5-PR8: checkout behavior unchanged (`checkout-form.test.tsx` unedited); deep-path imports (no barrel cycle);
   i18n es+en parity test; mobile 16px inputs / 44px targets; `accessUrl` handling (origin check, no localStorage,
   `gcTime: 0`); button wired only in PR7; no API changes in PR6-PR8; correct-number disabled with reason.
8b. PR8 acceptance per plan 10.1 (badge, creator, buyer number, send/copy with the new-link warning, regenerate
    confirm, disabled correct-number); confirm the web test files named in 5.1 run clean for PR6-PR8.
9. Issue bookkeeping per plan 5.3: `Refs` not `Closes`, comments posted on #265 and #268, Q4 URL path confirmed.
10. Generated artifacts: `openapi.json` byte-identical to a fresh regeneration; only touched orval files changed;
    no unrelated 33-file churn.
0. PR0: only `.claude/skills/implementation-plan/SKILL.md` changed, frontmatter has `name` + `description`,
    `git check-ignore` returns 1. PR0/PR1 show no failing checks; for later PRs record that CI has not run yet
    (the user checks it after retarget). Rollback notes in plan 9 hold (PR2/PR3 leave tolerated rows; PR4 migration
    is additive).
11. Known accepted risks (do not report as bugs unless worse than described): phantom Customer after a phone
    correction; double-submit creates two orders; sweep lag; IP-keyed public limits are global; the buyer page
    does not exist until #268 (PR7 must carry the release-gate note).

Separate live defects from latent ones, say what you ran versus inferred, and do not attribute pre-existing
behavior to the PRs (check `origin/main`). End by presenting the review for human approval; wait.
