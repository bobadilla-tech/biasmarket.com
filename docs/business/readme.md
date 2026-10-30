# docs/business

Business/GTM material — who Bias Market is for and how to reach them. For how
the product actually works, see [`docs/core`](../core/readme.md) instead; these
files link back to it where relevant and shouldn't restate it. For the overall
docs index see [`../readme.md`](../readme.md); for what the product is and what
is planned see [`../core/product.md`](../core/product.md) and
[`../core/roadmap.md`](../core/roadmap.md).

- [`icp.md`](icp.md) — ideal customer profile: K-pop group-order managers (GOMs)
  running sales manually via forms/spreadsheets/DMs.
- [`gtm.md`](gtm.md) — the full outbound/activation playbook for finding and
  converting GOMs, with weekly targets.
- [`outreach.md`](outreach.md) — the 7-day, 50-lead sprint variant of the same
  playbook. Use `gtm.md` for ongoing weekly targets and `outreach.md` when
  running the one-week sprint.
- [`buyer-flow.md`](buyer-flow.md) — buyer-side journey, browse → checkout →
  WhatsApp payment handoff → order tracking.
- [`seller-flow.md`](seller-flow.md) — seller-side journey, product management +
  recording/reviewing payments.
- [`marketplace-flow.md`](marketplace-flow.md) — the cross-store discovery layer
  (featured stores, directory, search).
- [`store-management-flow.md`](store-management-flow.md) — product/category/
  settings CRUD from the dashboard.

The four flow docs (`buyer-flow.md`, `seller-flow.md`, `marketplace-flow.md`,
`store-management-flow.md`) mirror what's actually built — kept in sync with
[`docs/core/product.md`](../core/product.md) and
[`docs/core/security-payments.md`](../core/security-payments.md). The ICP/GTM/
outreach docs are strategy, not implementation — nothing in code to check them
against, except what they say about the product itself (pricing and plans, ES/EN
support, payment methods), which must match the code and
[`../core/product.md`](../core/product.md).

Qualification numbers are not unified across the strategy docs: `icp.md` says
10–200+ buyers per drop and 30–100+ orders for the first ten users,
`outreach.md` says 30+ orders per drop, and the volume targets differ (`gtm.md`
200–300 leads a week, `outreach.md` 50 leads in 7 days). Treat each doc's
numbers as its own until the owner picks one set.
