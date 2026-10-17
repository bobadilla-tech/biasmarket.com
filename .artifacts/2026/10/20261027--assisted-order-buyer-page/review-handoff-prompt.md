# Review-session prompt: buyer page stack for "Pedido asistido" (#268)

Paste into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com` after the implementation session has
opened its stack. Use the `pr-review` skill (Skill tool): research notes and
draft comments go into `.artifacts/` first, verify every claim by running code,
re-review the drafts with subagents until clean, wait for a human to approve
before posting. `gh` writes need `env -u GITHUB_TOKEN gh ...` (the shell token
is read-only). Review comments get a reply + resolve referencing the fixing
commit.

You also own ticket handling for this work (the user asked for it): close the
tickets the merged PRs fully satisfy, and open follow-up tickets for new or
deferred work. Ask for approval of the exact ticket text before any GitHub
write.

## The stack (the implementer fills in the numbers)

| # | Branch                         | Number | Based on | PR line     |
| - | ------------------------------ | ------ | -------- | ----------- |
| 1 | `feat/public-order-dto-fields` | #__    | `main`   | Refs #268   |
| 2 | `feat/public-order-page`       | #__    | #1       | Closes #268 |
| 3 | `fix/checkout-customer-race`   | #__    | #2       | Closes #333 |
| 4 | `feat/order-related-orders`    | #__    | #3       | Refs #265   |
| 5 | `fix/hide-ghost-customers`     | #__    | #4       | Closes #337 |

Hosted CI only runs for PRs targeting `main`, so review each PR against its own
base first (diff = that PR's commits only), run its checks locally, then
re-check the top of the stack. As each PR merges, retarget the next to `main`
(`gh pr edit <n> --base main`, with approval) so its hosted CI runs.

## Source documents

Plan `.artifacts/2026/10/20261027--assisted-order-buyer-page/plan.md` (read its
"USER DIRECTION (2026-10-28)" block first), `review-log.md` (traps and the unmet
review bar), `handoff-prompt.md`.

## Review checklist (plan section 9, minus the deferred security items)

1. Buyer page: greeting/alias, one banner per state (PENDING_PAYMENT,
   PARTIALLY_PAID, PAYMENT_SUBMITTED, VERIFIED, REJECTED, CANCELLED/expired,
   READY, COMPLETED), items, totals taken from the API
   (`paidAmount`/`pendingAmount`, never summed client-side), "Anulado" voided
   rows, masked-phone line + "no es tu numero" disclosure, how-to-pay only when
   the plan's rule says so (reusing `PaymentMethodDetails`), second contact
   button "ya pague el pedido #XXXX".
2. Unknown/revoked/rotated/wrong-slug tokens: identical invalid state with a
   contact path; stale data is dropped on a failed refetch (`isError` before
   `data`, `gcTime: 0`).
3. Cheap privacy items present: `headers()` for the prefixed and unprefixed
   path, noindex, robots disallow, no third-party scripts, no DTO-sourced
   `href`, no packed photo, no raw logo `<img>`, `page.tsx` has no fetch (static
   guard), wa.me text has no token.
4. Checkout race (#333): parallel checkouts (same/different emails, existing
   BuyerAccount) never 500; one Customer/BuyerAccount/link; the e2e fails on the
   base commit; no try/catch around transaction statements; lock order intact;
   raw INSERTs carry explicit ids and `storeId`; guest result when the Google
   attach is lost.
5. Related orders: store-scoped, `ownership` check, legacy rows, best-effort
   total. #337: keep-set built from Customer records, filtered after the guest
   fold.
6. Generated files regenerated (not hand-merged), `check-openapi-drift.sh` exits
   0, lint/typecheck/unit/e2e per PR, the implementer's PR bodies only claim
   what they ran.

## Tickets: close and open

Close after the relevant PR is merged and verified: **#268** (PR 2), **#333**
(PR 3), **#337** (PR 5). #265 is already closed; PR 4 only references it, so
open a small ticket "Lista de otros pedidos del mismo numero" and close it with
PR 4 if you want a trace. Leave #340 open and refine it (see below).

Open follow-up tickets (Spanish titles like the existing ones; label
`pedido-asistido` plus the type label; reference the plan and the PR). These
were deliberately deferred by the user's direction ("no users yet, security is
an afterthought") and the reviews already produced the evidence:

1. Caddy: default error logger writes the token (request URI and `Referer`) when
   an upstream is down, and a rsync'd single-file Caddyfile bind mount may keep
   the old inode (so #343's `trusted_proxies` may not be live). Fix sketch and
   probe results in plan 4.3 (rewrite of #340's premise).
2. Web: scrub the order token from Sentry/GlitchTip events (client and server
   `beforeSend`, breadcrumbs, transactions, `onRequestError`; do not
   `JSON.stringify` a transaction event as is: circular
   `sdkProcessingMetadata`). Refs #279.
3. Public order API hardening: token-format guard in `requireOrderForToken`,
   `credentials: "omit"` for the public query (mutator currently ignores a
   per-call value), DTO minimisation (`line1`/`reference`, alias as first name),
   no token TTL / post-completion minimisation,
   `INVITE_CLICKED`/`INVITE_DISMISSED` not deduped, allow-list of
   `paymentMethods[].details` at the API.
4. Header proof in CI for `/pedido/*` (page, RSC variant, unprefixed redirect)
   and a `proxy.ts` fallback if next-intl overrides
   `Cache-Control`/`Referrer-Policy`; sitemap test that no source emits
   `/pedido/`.
5. Checkout identity: phone squat (checkout with a victim's phone and the
   attacker's email), case-sensitive email comparison in `findOrCreateCustomer`,
   Google create path racing a checkout for the same email.
6. Anything the implementer reports as deferred or discovered while working, and
   any follow-up your own review finds (e.g. #336 idempotency and #339 order-ref
   length already exist: link them rather than duplicating).

## Output

Draft findings and the exact ticket texts in
`.artifacts/2026/10/<date>--assisted-order-buyer-page-review/` (new folder, do
not edit the planning folder); run subagent review rounds on the drafts; wait
for the human to approve before posting or closing anything.
