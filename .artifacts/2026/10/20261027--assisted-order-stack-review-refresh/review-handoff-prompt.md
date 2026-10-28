# Review handoff: re-review assisted-order stack after fixes

Use the `pr-review` skill for PRs #324–#331 after implementation. Re-fetch the
heads and bases; do not rely on this snapshot. Review each PR against its own
refreshed base, then recheck the stack tip. Use the review notes, plan, prior
comments, and remaining risks here:

- `.artifacts/2026/10/20261027--assisted-order-stack-review-refresh/plan.md`
- `.artifacts/2026/10/20261027--assisted-order-stack-review-refresh/review-notes.md`
- `.artifacts/2026/10/20261027--assisted-order-stack-review-refresh/draft-comments.md`
- `.artifacts/2026/10/20261027--assisted-order-stack-review/`

Review criteria: OpenAPI drift and Codacy clear; API E2E executes and passes;
all eight current base/head pairs have fresh required checks; #326 customer and
stats DTO projections are complete and first-open tracking failures cannot leave
phone correction enabled; #327 template fallback preserves real errors; #329
quantity stays within stock across typed input and product/variant changes, with
clear form states; #330 message, WhatsApp readiness, and removal of the seller
preview URL are correct; #331 hides a generated message after cancellation and
disables actions for expired holds. Check #258 last-alias semantics and #265
correction criteria, retain the #268 release gate and #333 follow-up, and remove
or correct stale prior review claims. The authenticated reviewer is the PR
author, so only COMMENT events are available. Do not post reviews or edit PR
descriptions without explicit approval.
