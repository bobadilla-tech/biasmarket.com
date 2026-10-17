# Docs

Bias Market is a niche-first store builder for creator-led commerce, starting
with K-pop and artist merch stores (group orders, photocards, albums, fan
merch). A seller runs one or more storefronts from one account. Payment is
manual and proof-based (bank transfer, Wise, PayPal) with built-in review of the
buyer's proof of payment, so no Stripe account is required.

## Where to start

- **Developer.** [core/product.md](core/product.md) for what the product does,
  [core/architecture.md](core/architecture.md) for how the code is organized,
  [core/docker-dev.md](core/docker-dev.md) to run it locally.
- **Operator.** [core/deploy.md](core/deploy.md) for the production deploy,
  [core/blue-green-migrations.md](core/blue-green-migrations.md) for deploy
  mechanics and migrations,
  [core/incident-response.md](core/incident-response.md) when something breaks.
- **Product and business.** [business/readme.md](business/readme.md) for the
  customer profile and flows, [core/product.md](core/product.md) for the spec,
  [core/roadmap.md](core/roadmap.md) for what comes next.

The complete list of technical docs, with a "read this when ..." line for each,
is [core/readme.md](core/readme.md).

## Other places

- Per-app docs: [apps/web/AGENTS.md](../apps/web/AGENTS.md),
  [apps/mobile/README.md](../apps/mobile/README.md),
  [apps/sanity/README.md](../apps/sanity/README.md).
- Work records (plans, audits, handoffs) live in `.artifacts/`; agent skills
  live in `.claude/`. Neither is maintained documentation.
