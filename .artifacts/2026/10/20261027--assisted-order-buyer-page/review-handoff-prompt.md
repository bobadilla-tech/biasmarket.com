# Review-session prompt: buyer page for "Pedido asistido" (#268) and leftovers

Paste into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com` after the implementation session has
opened its PRs. Use the `pr-review` skill (Skill tool) and follow its
conventions: research notes and draft comments go into `.artifacts/` first,
every claim is verified by running code, drafts are re-reviewed by subagents
until clean, a human approves before anything is posted with `gh`
(`env -u GITHUB_TOKEN gh ...`; the shell token is read-only). Review comments
get a reply + resolve referencing the fixing commit.

## PRs to review (the implementer fills this in at the end of their session)

| PR                                           | Branch                         | Number | Base |
| -------------------------------------------- | ------------------------------ | ------ | ---- |
| PR4 Caddy token logs / deploy guard          | `fix/caddy-token-logs`         | #__    | main |
| PR-S web Sentry scrub                        | `fix/web-scrub-order-token`    | #__    | main |
| PR-A public DTO fields                       | `feat/public-order-dto-fields` | #__    | main |
| PR3 buyer page                               | `feat/public-order-page`       | #__    | main |
| PR1 checkout race                            | `fix/checkout-customer-race`   | #__    | main |
| PR5 related orders (Phase 2, may be absent)  | `feat/order-related-orders`    | #__    | main |
| PR6 ghost customers (Phase 2, may be absent) | `fix/hide-ghost-customers`     | #__    | main |

All PRs target `main`, so hosted CI results are available for each (CI does not
run for PRs based on another branch). Review each PR against `main`; there is no
stack to re-check, but verify the merge-order dependencies below.

## Source documents

- Plan: `.artifacts/2026/10/20261027--assisted-order-buyer-page/plan.md`
- Review history and known uncertainty: `.../review-log.md`
- Implementation handoff: `.../handoff-prompt.md`

The plan's review bar was NOT met (ten rounds, every round still had an
important finding, the last ones were implementation detail). Treat the code
review as the real gate for the risks below.

## Review checklist (from the plan's acceptance criteria, section 9)

1. Buyer page content and states (`[CI]` component tests, `[manual]` phone-width
   browser): greeting/alias, status banner per state (PENDING_PAYMENT,
   PARTIALLY_PAID, PAYMENT_SUBMITTED, VERIFIED, REJECTED, CANCELLED, READY,
   COMPLETED), items, total/adelanto/pagado/falta del adelanto from the API
   values (never summed client-side), masked phone line and "no es tu numero"
   disclosure, how-to-pay only when the plan's rule says so, "Anulado" rows.
2. Unknown / revoked / rotated / malformed / wrong-slug tokens give the
   identical invalid state with a contact path.
3. Headers on HTML, RSC and redirect responses against a production build:
   `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, noindex, frame
   denial. `robots.txt` disallow, no sitemap entry (test).
4. No third-party script/request, no account invitation, no DTO-sourced `href`
   (not `trackingUrl`), no packed photo, no raw `<img>` of the store logo, wa.me
   text contains no token.
5. `page.tsx` has no fetch/apiClient (static guard); a no-JS fetch leaves
   `linkFirstOpenedAt` null.
6. Token never in web Sentry events (fake-transport test with a positive
   `transaction` envelope assertion), never in Caddy error logs (probe).
7. Checkout race: parallel checkouts (same/different emails, existing
   BuyerAccount, Google attach, change-phone) return 201/201 or 409/guest, never
   500; one Customer/BuyerAccount/link; no account data crosses between
   requests; the e2e fails on the base commit.
8. Related orders (if present) are store-scoped with the isolation matrix; #337
   filter keeps registered and guest-order contacts.
9. Lint, typecheck, unit, e2e per PR; openapi drift script exits 0; generated
   files are regenerated, not hand-merged.

## Known risks to attack (do not accept on the author's word)

- PR4: validating the NEW host Caddyfile (not the stale one in the container),
  guard placement in `cmd_deploy` only (never canary/rollback), `set -e`
  behaviour on the `compose exec` hash step, the post-deploy checks (adapt
  proves file content only; live config via `:2019/config/`), the 1-5 s
  recreate, whether the stale-inode claim was actually reproduced. Do not
  approve deploying it without the user.
- PR1: advisory-lock placement and ordering, typed `updateMany` guards, guest
  result when the Google attach is lost, the unit-spec rewrite really asserts
  the new SQL (`storeId` in every raw statement), raw INSERTs with explicit ids,
  cleanup of phone-less BuyerAccounts in e2e, no flakiness (`Promise.all`
  rounds).
- PR3: `isError` before `data` (stale tab after rotation), slug check inside
  `queryFn`, `http.ts` one-liner and its fan-out to mobile, the `proxy.ts`
  fallback if next-intl overrides headers, version skew (PR-A before PR3).
- PR-S: the scrub must not throw on transaction events and must never return
  `null`.
- PR-A: alias sanitiser (grapheme cut, whitespace collapse before control
  removal, `toWellFormed`), token regex guard returns the same 404 for
  `packed-photo` and events.
- Merge order is a security requirement: PR3 must not merge before PR-S, PR4
  (deployed) and PR-A, and #343 must be live.

## Output

Draft findings in `.artifacts/2026/10/<date>--assisted-order-buyer-page-review/`
(new folder, do not edit the planning folder), verify by running code in an
isolated worktree, run subagent review rounds on the drafts, then wait for the
human to approve before posting anything.
