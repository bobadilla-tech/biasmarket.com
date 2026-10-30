# Proposed review events

The batch authorization waives the normal wait for human approval. Post only
after the current head SHAs and exact review anchors are rechecked. No inline
comments are proposed because the current open diffs have no remaining verified
code defect.

## #438: fix(infra): redact order tokens from Caddy access logs (DRAFT)

**Review body (COMMENT):**

> The full Caddyfile and isolated logger config validated locally, and throwaway
> API and web requests redacted the token in access and upstream-error logs,
> including a token-bearing Referer. This change enables IP-bearing access logs
> and touches the production proxy, so a human must merge it alone and recreate
> the Caddy container on the VPS. This review does not request merging it or
> closing #340.

## #439: feat(api): make assisted-order creation idempotent

**Review body (COMMENT):**

> The typed conflict response, transaction ordering, tenant-scoped lookup,
> migration, and race coverage were reviewed; focused API tests and the
> destructive-migration check passed. The branch is rebased onto current `main`;
> merge only after the current-head `CI Success` check is green, review is
> clean, and the required deploy window is clear.

## #441: feat(web): send an Idempotency-Key for assisted orders

**Review body (COMMENT):**

> The key remains stable for a mounted form and resets after edits or success;
> the raw request handles the API replay response. Focused web tests passed.
> Merge after #439 is deployed, this branch is rebased, and fresh `CI Success`
> is green.
