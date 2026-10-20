# Handoff prompt: readable product URLs

Work unit: replace cuid product URLs with per-store-unique name slugs. Plan and
audit live in `docs/` (maintained docs), not copied here:

- Plan: `docs/plans/2026-10-20-product-url-slugs.md` (source of truth)
- Audit: `docs/audits/product-url-slug-audit-2026-10-20.md`

Verify every claim against current code before relying on it; these files are
snapshots.

---

You are implementing `docs/plans/2026-10-20-product-url-slugs.md` in the Bias
Market monorepo. Read it fully, plus `CLAUDE.md`, `apps/web/AGENTS.md` (check
`node_modules/next/dist/docs/` before writing Next.js code),
`docs/core/blue-green-migrations.md` and `docs/core/deploy.md`.

Rules: pnpm only; ESM; `.js` extensions on relative imports in `apps/api`; web
never imports `packages/db`; every tenant query filters by `storeId`; do not
change `slugify`; do not add `slug` to Create/UpdateProductDto. Branch from
clean `main`.

Ship in two releases (separate PRs/deploys):

**PR 1 (expand)**

1. `productSlug` + `isCuidShaped` in `packages/utils/src/strings` with tests.
2. Prisma: nullable `Product.slug`, `@@unique([storeId, slug])`, migration named
   like the existing ones; `pnpm db:generate`.
3. `allocateProductSlug` as `@biasmarket/utils/product-slug`
   (`packages/utils/src/product-slug/index.ts`; framework-free, structural
   client; scripts cannot import Nest source; build utils before scripts) +
   retry around the WHOLE `$transaction` in `ProductsService.create` (never
   retry inside an aborted transaction). P2002 under the pg adapter has no
   `meta.target`: match `meta.driverAdapterError.cause` (see plan §3) and pin it
   with the race e2e test.
4. Resolver (`StoresService.findPublicProduct`, controller param `:productRef`):
   decode + NFC the ref, `storeId_slug` lookup with the lowercased ref, fall
   back to id lookup with the NFC ref, both with `storeId` in the `where`.
5. Expose `slug` on the DTOs listed in plan §6; update every Prisma `select`;
   `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types
   generate`,
   commit the diff.
6. Seed `ensureProduct` (`apps/api/scripts/seed/helpers.ts`) uses the allocator
   idempotently (keep an existing slug; do not put `slug` in `update`).
7. Backfill script `apps/api/scripts/backfill-product-slugs.ts` + package.json
   script (dry-run default, `--apply`; own `PrismaClient` with `PrismaPg`
   adapter like `migrate-buyer-accounts.ts`) + `docs/core/deploy.md` run step.
8. Web: rename segment to `[productSlug]` under `(storefront)`, `cache()`d fetch
   with decoded/NFC ref and `encodeURIComponent` to the API, `notFound()`, 308
   via `permanentRedirect` + `getPathname` with a hand-built encoded pathname
   and awaited `searchParams` as `query` (no redirect when slug is null or when
   the encoded Hangul slug already matches), canonical/alternates/JSON-LD on
   slug, `productPath` helper used by product-card, product-grid-card, search
   page, store JSON-LD.
9. Tests per plan "Tests"; run lint, typecheck, test, api test:e2e.

**PR 2 (contract)** only after the backfill ran post-drain and
`count(slug IS NULL) = 0`: guarded NOT NULL + CHECK migration, non-null DTOs,
regenerate SDK, remove `?? id`, flip plan `Status:` to `implemented`, update
`docs/core/architecture.md`.

Report deviations from the plan explicitly; do not silently change decisions.
