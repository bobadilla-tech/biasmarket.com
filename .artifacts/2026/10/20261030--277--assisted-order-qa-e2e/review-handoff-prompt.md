# Review handoff: #277 QA stack

Use the `pr-review` skill (review notes and drafts under `.artifacts/` first,
verify claims by running code, subagent review rounds until clean, human
approval before posting anything with `gh`).

## What to review

PRs (fill in at the end of the implementation session):

- PR-A `test/f1-api-e2e-gaps`: #____ (base `main`)
- PR-B `test/f1-web-foundation-golden-path`: #____ (base `main`)
- PR-C `test/f1-web-invites-in-app`: #____ (base PR-B branch)

Plan: `.artifacts/2026/10/20261030--277--assisted-order-qa-e2e/plan.md`. Review
log: `.artifacts/2026/10/20261030--277--assisted-order-qa-e2e/review-log.md`.

Review each stacked PR against its own base first, then re-check the stack top.
CI results are only reliable for PRs whose jobs were not skipped: confirm
`Web E2E (a11y)` / `E2E (API)` actually ran per PR.

## Checklist (plan §9 + known risks)

1. No production code changed (`git diff --stat` for `apps/api/src`,
   `packages/db`, `apps/web/app|features|components`); web helpers never import
   Prisma/`@biasmarket/db`.
2. Every §7 row has a named test whose assertion (not title) matches the
   criterion; "not covered" list is in each PR description; `Refs #277`, not
   `Closes`.
3. Google stub: inert without `E2E_GOOGLE_STUB=1`; only on the API exec line;
   fake `*.invalid` creds; no `GOOGLE_*` in `e2e.env.example`/deploy files;
   Hygiene `node --check`, self-test and grep guards present and passing.
4. Single-host move complete (`NEXT_PUBLIC_API_URL` build **and** start,
   `INTERNAL_API_URL`, `BETTER_AUTH_URL` override on the API line, `WEB_URL`);
   a11y specs unchanged (`--list` diff).
5. Determinism: flows `retries:0`; unique data per test; no sleeps; negative
   assertions follow a positive marker; `bm_claim` read via unfiltered
   `context.cookies()`; 8 s undo window handled with `waitForResponse`;
   rate-limit request table present; `--repeat-each=3` evidence.
6. Selectors: "Aprobar" scoped to "Historial de pagos"; fulfillment advance from
   the table row; invite seeding includes `firstSeen`; in-app test uses a
   partial validated payment.
7. Security/privacy: artifacts exposure noted; `.auth/seller.json` gitignored
   and outside upload paths; no `trace:'on'`; no real credentials; 403/404
   isolation asserts present in PR-A.
8. CI: `web_e2e` filter additions, 35 min timeout + `globalTimeout` invariant,
   docs/ci.md section; job names unchanged.

Known risk areas: cookie behavior on the chosen host; preload stub under the
built Nest app; throttle collisions; Web E2E runtime headroom.
