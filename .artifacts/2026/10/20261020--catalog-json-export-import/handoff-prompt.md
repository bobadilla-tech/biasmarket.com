# Handoff prompt: catalog export / import

Work unit: let sellers download their store catalog (JSON, or ZIP with images)
and import products from that format. Plan and audit live in this folder:

- Plan: `.artifacts/2026/10/20261020--catalog-json-export-import/plan.md`
  (source of truth)
- Audit: `.artifacts/2026/10/20261020--catalog-json-export-import/audit.md`
- Review history: `review-log.md` in this folder

Verify every claim against current code before relying on it; these files are
snapshots from 2026-10-20.

---

You are implementing
`.artifacts/2026/10/20261020--catalog-json-export-import/plan.md` in the Bias
Market monorepo. Read it fully, then the audit, `CLAUDE.md`,
`apps/web/AGENTS.md` (check `node_modules/next/dist/docs/` before writing
Next.js code), `docs/core/blue-green-migrations.md`, `docs/core/deploy.md`,
`.artifacts/AGENTS.md` and, for sequencing,
`.artifacts/2026/10/20261020--product-url-slugs/plan.md`.

Rules: pnpm only; ESM; `.js` extensions on relative imports in `apps/api`; web
never imports `packages/db` or talks to Postgres; every tenant query filters by
`storeId` and every endpoint starts with `assertOwnership`; money is `Decimal`,
never `Float`; do not reuse `CreateProductDto`; do not accept a product `slug`
from a file; everything imports as `DRAFT`; no BullMQ/worker for this feature
(the runner is in-process by design, plan D2). Branch from clean `main`, one PR
per phase. Do not push or open PRs unless asked.

Start with **P0** (verification, no feature code): resolve the gate items and
open checks in the plan, measure real store image sizes if you can reach data,
pick the ZIP reader/writer and image-dimension libraries, and write
`implementation-log.md` in this folder (create it). If a gate fails (e.g.
`FOR NO KEY UPDATE` on `Store` blocks order inserts, collection reads leak DRAFT
products, Cloudflare limits are lower than assumed), stop and report with a
proposed plan change instead of working around it.

Then ship in this order, each independently mergeable:

1. **P1**: format (zod in api, limits in `packages/utils`),
   `docs/core/
   catalog-import-export.md`, JSON export, OpenAPI/Orval
   regeneration.
2. **P2**: ZIP export + strict-key storage helpers.
3. **P3a**: Prisma models + migration (ordered after the slug and `BuyerAccount`
   migrations), staging bucket/env/flag, upload guard (incl. Origin check),
   prepare, preview, cancel, report, cleanup-only sweep.
4. **P3b**: commit, in-process runner with lease fencing, sweep resume/purge,
   shutdown hooks. Requires the slug work's Release 1 on `main`.
5. **P4**: web UI + bulk publish.
6. **P5** (optional): foreign image fetching.

For every phase: write the tests listed in the plan (including the adversarial,
concurrency and crash-injection ones), run `pnpm typecheck`, `pnpm lint`,
`pnpm --filter api test` (and `test:e2e` where the plan says), and keep the
plan's security criteria intact. Record deviations and findings in
`implementation-log.md`. Update CLAUDE.md, `apps/web/AGENTS.md` and
`docs/core/*` as listed in the plan's "Docs to update when implementing".

Report at the end of each phase: what shipped, test evidence, deviations from
the plan, and open questions for the user.
