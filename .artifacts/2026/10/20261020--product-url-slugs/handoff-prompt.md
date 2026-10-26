# Handoff prompt: readable product URLs

Work unit: replace cuid product URLs with per-store-unique name slugs. Plan and
audit are in this folder:

- Plan: `plan.md` (source of truth)
- Audit: `audit.md`

Verify every claim against current code before relying on it; these files are
snapshots.

---

You are implementing `.artifacts/2026/10/20261020--product-url-slugs/plan.md` in
the Bias Market monorepo. Read it fully, plus `CLAUDE.md`, `apps/web/AGENTS.md`
(check `node_modules/next/dist/docs/` before writing Next.js code),
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
   NFC-normalize the ref (no decode in the API; Express already decoded),
   `storeId_slug` lookup with the lowercased ref, fall back to id lookup with
   the NFC ref, both with `storeId` in the `where`.
5. Expose `slug` on the DTOs listed in plan §6; update every Prisma `select`;
   `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types
   generate`,
   commit the diff.
6. Seed `ensureProduct` (`apps/api/scripts/seed/helpers.ts`) uses the allocator
   idempotently (keep an existing slug; do not put `slug` in `update`).
7. Backfill script `apps/api/scripts/backfill-product-slugs.ts` + package.json
   script (preserves each row's `updatedAt` explicitly, uses `updateMany` +
   `count===0` skip, passes the `taken` set, includes soft-deleted rows in
   `createdAt, id` order; dry-run default, `--apply`; own `PrismaClient` with
   `PrismaPg` adapter like `migrate-buyer-accounts.ts`) + `docs/core/deploy.md`
   run step.
8. Web: rename segment to `[productSlug]` under `(storefront)`, `cache()`d fetch
   with decoded/NFC ref and `encodeURIComponent` to the API, `notFound()`, 308
   via `permanentRedirect` + `getPathname` with a hand-built encoded pathname
   and awaited `searchParams` as `query` (no redirect when slug is null or when
   the encoded Hangul slug already matches), canonical/alternates/JSON-LD on
   slug, `productPath` helper used by product-card, product-grid-card, search
   page, store JSON-LD.
9. SEO (plan §8): `Product.updatedAt` in the same migration; internal `products`
   sitemap endpoints (shared eligibility `where`, store indexability constants
   reused) + web `products-source`, `productEntry`, registry and the
   `/sitemap-products-:id.xml` rewrite; product-page description, Open
   Graph/Twitter, `robots` noindex via `store.indexable` on the public product
   DTO, `BreadcrumbList`. Canonical, hreflang, JSON-LD and sitemap `<loc>` must
   be byte-identical (one encoded `productPath`; `productEntry` takes that
   path). Variant mutations also bump `Product.updatedAt` (not order
   reservations); the migration sets `updatedAt = createdAt` for existing rows;
   `computeStoreIndexable` is shared by both public store reads; keep
   `generateMetadata` inline (canonical-regression test); use
   `indexable === false`. Details: plan §8 (sitemap eligibility incl.
   `slug IS NOT NULL`, sold-out listed, `createdAt, id` order; not-found
   `robots: { index:false,
   follow:false }`) and §6 (`OrderProductResponseDto`
   decision).
10. Tests per plan "Tests"; run lint, typecheck, test, api test:e2e.

Between the PRs: after the switch AND old-color drain, run the backfill with
`--apply`, re-run once, verify `count(slug IS NULL) = 0`. PR 1 also updates
`docs/core/architecture.md` (slug scheme + product sitemap source).

**PR 2 (contract)** only after the backfill ran post-drain and
`count(slug IS NULL) = 0`: guarded NOT NULL + CHECK migration, non-null DTOs,
regenerate SDK, remove `?? id`, flip plan `Status:` to `implemented`, update
`docs/core/architecture.md`.

Report deviations from the plan explicitly; do not silently change decisions.
