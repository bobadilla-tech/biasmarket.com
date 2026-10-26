# Catalog JSON export / import audit

Date: 2026-10-20. Scope: what exists today for exporting a store's catalog and
importing products in bulk (data model, API, storage/images, limits, jobs, web),
what is missing, and the findings that shape the design. Companion plan:
`.artifacts/2026/10/20261020--catalog-json-export-import/plan.md`.

Status: proposed. Planning only; no code written. Handoff prompt:
`.artifacts/2026/10/20261020--catalog-json-export-import/handoff-prompt.md`.
Section references like "A2.4" in the plan point at this file's sections.

**Ask:** let a seller (a) download a full backup of their store catalog as JSON
with all metadata, and (b) mass-import products from JSON so a new store can be
stood up quickly ("import store from JSON"). Open problem the user flagged: how
do **images** work with a JSON file.

Every claim below was checked against the code on the date above; file paths are
the evidence. Re-verify before relying on them.

---

## 1. Goals and non-goals

**Goals**

1. **Backup/export:** one authenticated action downloads the store's catalog
   (categories, collections + product ordering, products, variants, image
   references) in a documented, versioned format.
2. **Import:** upload that format (or a hand-written/third-party-derived file)
   into a store and get products created, with a preview of what will happen and
   a report of what did.
3. **Round-trip:** export from store A → import into store B (or back into A
   after loss) reproduces the catalog.
4. **Fast start for new stores:** import is usable as an onboarding path.
5. **Images** are handled deliberately, not left as dangling URLs.

**Non-goals (v1)**

- Orders, customers, payments, coupons, restock requests, notifications (PII /
  financial state — not catalog). Not exported.
- Store settings, theme, sections (candidate for a later phase).
- Import from Shopify/Tiendanube/CSV (format is designed to make a converter
  easy; building converters is out of scope).
- Continuous sync / upsert by external ID (see plan, decision D4).

---

## 2. What exists today

### 2.1 Data model (`packages/db/prisma/schema.prisma`)

| Model                    | Catalog-relevant fields                                                                                                                                  | Notes                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Product` (l.141)        | `name, description, price Decimal(10,2), currency, images String[], availableUntil, status DRAFT/PUBLISHED, soldOut, discontinued, deletedAt, createdAt` | No SKU / external ID / unique key other than `id`. `images` is a flat array of **absolute URLs**; first element is the primary image (see `addImage` `replace` branch).                                                                                              |
| `ProductVariant` (l.167) | `name, stock Int? (null = unlimited/made-to-order), reserved Int, priceOverride Decimal?, imageOverride String?, attributes Json`                        | `reserved` is derived from live orders — must not be exported/imported. `imageOverride` is a URL, independent of `Product.images`.                                                                                                                                   |
| `Category` (l.209)       | `name, parentId` (tree), `@@unique([storeId, parentId, name])`                                                                                           | Natural key = path of names. Postgres treats `NULL` parentId as distinct, so the unique constraint does **not** protect root-level duplicates — see 4.7.                                                                                                             |
| `ProductCategory`        | join `(productId, categoryId)`                                                                                                                           |                                                                                                                                                                                                                                                                      |
| `Collection` (l.237)     | `name, slug, description`, `@@unique([storeId, slug])`                                                                                                   | Natural key = `slug`.                                                                                                                                                                                                                                                |
| `CollectionProduct`      | `(collectionId, productId, position)`                                                                                                                    | Ordering lives here.                                                                                                                                                                                                                                                 |
| `StoreSection`           | `type, collectionId?, content Json, position, hidden`                                                                                                    | Out of v1 scope.                                                                                                                                                                                                                                                     |
| `Store`                  | `defaultCurrency, publishedProductCount, contentStaleAt, …`                                                                                              | `publishedProductCount` is a denormalised counter (2.3).                                                                                                                                                                                                             |
| `AuditLog`               | `actorId, storeId, action, entityType, entityId, metadata`                                                                                               | Used by order use cases (`cancel-order`, `expire-orders`, `advance-fulfillment`, review-payment, `order.controller.ts`); not used by catalog code today. `actorId` is a required String (no FK), so system-driven completion must record the import's `createdById`. |

There is no import/export/backup/bulk code anywhere in `apps/`, `packages/` or
`docs/`. `docs/core/product.md` mentions "import" only in the sense of
import/group-order commerce (K-pop goods imported from Korea), not data import —
avoid that naming collision in UI copy (use "Import catalog" / "Importar
catálogo", not bare "Import").

### 2.2 API surface (`apps/api/src/modules/products`)

- Controller `stores/:storeId/products`, `AuthGuard` (better-auth session).
  Endpoints: create, list (`findAllForStore`, soft-deleted excluded), get,
  patch, publish, soft delete, variants CRUD, image upload / delete / reorder /
  clear, variant image upload.
- **Ownership:** every service method starts with
  `assertOwnership(storeId,
  userId)` (`Store.ownerId === userId`) and product
  access goes through `findOwnedProduct`. The private helper is duplicated in
  `products`, `collections`, `categories` services (no shared base). New code
  must follow the same pattern — CLAUDE.md hard rule.
- **Create:** `ProductsService.create` is a single `$transaction`: product +
  variants (`Promise.all` of creates) _or_ a synthesised `Default` variant when
  only `stock` is given + `ProductCategory.createMany`. New products are always
  `DRAFT` (the DTO has no `status`; global `ValidationPipe` is
  `forbidNonWhitelisted`).
- `CreateProductDto` quirks to know before reusing it for import: `name` and
  `price` are `@IsOptional()` (type says required but validator allows omission,
  so Prisma would fail with a 500), `name` only `MinLength(2)` with **no max
  length**, `description` unbounded, `images` is `string[]` with **no URL/host
  validation and no length cap**, `price` is a JS `number` (float) not a decimal
  string. The "never Float" money rule is honoured at the DB, not at this DTO
  edge. **Import must not reuse `CreateProductDto`**; it needs its own stricter
  validation.
- Response shaping is by hand-written `toProductDto`/`toProductDetailDto`
  mappers in the controller (Decimal → string, dates → ISO).
- `GET stores/:storeId/products` returns the whole catalog unpaginated with
  `variants` and `categories` included — roughly the export read already, but it
  also runs an `orderItem.groupBy` for `soldUnits` that export does not need.
- `CollectionsService.findAllForStore` returns collections with ordered products
  (`orderBy position asc`) and `product.variants`, but **does not filter
  soft-deleted products** and the nested `product` include carries no `storeId`
  filter. Export must not reuse it; it needs its own query with
  `product: { storeId, deletedAt: null }`. `ProductCategory` and
  `CollectionProduct` have **no `storeId` column**, so "every query filters by
  storeId" can only be enforced through the parent relation for those two tables
  (`ProductVariant` does have `storeId`). `CategoriesService.findAllForStore`
  returns the flat category list (parent links via `parentId`); category depth
  is unrestricted today.
- `CollectionsService.create` does `slugify(dto.name)` and throws
  `ConflictException` on a duplicate slug. `slugify`
  (`packages/utils/src/strings/index.ts`) strips everything outside `[a-z0-9]`,
  so a Hangul/CJK-only collection name (core niche: K-pop) yields an **empty
  slug** — a latent bug in the existing create path that import must not inherit
  (needs a fallback slug).
- `ProductsService.recountPublishedProducts` is `private`, uses `this.prisma`
  (not a `tx`), and is a plain count + update. `MAX_IMAGES` is a
  `private static readonly` on `ProductsService`. Both must be exposed/moved for
  the importer to share them.

### 2.3 Side effects any bulk write must preserve

- `Store.publishedProductCount` + `contentStaleAt` are recomputed by
  `ProductsService.recountPublishedProducts` after publish / soft-delete /
  `discontinued` change. Drives the sitemap indexability gate
  (`common/store-indexability.ts`). A bulk import that creates anything
  non-`DRAFT` must recount **once at the end**, not per row. (Note: `create`
  itself does not recount because new products are DRAFT — but it also accepts
  `discontinued` in the DTO; a DRAFT product never counts, so fine.)
- `updateVariant` runs `NotificationsService.syncStockAlerts` (low-stock
  alerts). The create path does not. Import = create path, so no alert sync is
  consistent with today's create behaviour; a future "update existing" mode
  would need it.
- Whether anything else must be refreshed (e.g. search):
  `product-search.service.ts` appears Postgres-backed — verify during
  implementation.

### 2.4 Image storage (`apps/api/src/storage/storage.service.ts`)

- S3-compatible (MinIO). Public bucket `S3_BUCKET` for product images under key
  prefix `products/<uuid>.<ext>`; returned URL is
  `${S3_PUBLIC_URL}/${bucket}/${key}` (prod: `https://cdn.biasmarket.com/…` via
  Caddy → `minio:9000`). Product images are public-read.
- `upload()` derives extension from MIME (png / pdf / else jpg) and names
  objects by random UUID — no content hashing, no dedup, **no link between an
  object and a product row other than the URL string** inside `Product.images` /
  `ProductVariant.imageOverride`.
- `deleteImage(url)` derives the key by slicing `${publicUrl}/${bucket}/`'s
  length off the URL **without verifying the prefix** — a non-matching URL
  deletes a garbage key in the products bucket. New helpers must assert the
  prefix. It is called when a product image is removed or cleared. **Consequence
  for import: two products must never share the same image URL** — removing the
  image from one would delete the object out from under the other. Import must
  copy the object, not alias the URL.
- `getPaymentImageStream(url)` parses _bucket and key from any URL's pathname_
  with no allowlist — fine for its one authenticated caller, but it must **not**
  be reused as-is for export (a crafted `images[]` entry could make export read
  an arbitrary bucket/key). Export needs a variant that verifies the URL starts
  with `${publicUrl}/${bucket}/`.
- There is no `CopyObject` helper, no `GetObject`-to-buffer helper for the
  public bucket, no listing, no presigned URLs (documented reason: `S3_ENDPOINT`
  is the internal `minio:9000` hostname in prod).
- Upload validation (`common/uploaded-file-validation.pipe.ts`): magic-byte
  sniffing, JPEG/PNG only for products, 5 MB cap (`MAX_UPLOAD_SIZE_BYTES`).
  **WebP/GIF/AVIF are rejected** — a large share of images on other platforms
  are WebP, so imports from external URLs will hit this. `sharp` is not a
  dependency.
- Max 6 images per product, enforced only in `ProductsService.addImage`
  (`MAX_IMAGES = 6`). `create`/`update` DTOs accept an arbitrary-length
  `images[]` — the cap is bypassable via the DTO today (pre-existing gap; import
  must enforce it).
- Multer: `FileInterceptor('file')` with **no `limits`** → default memory
  storage; the 5 MB check happens _after_ the whole body is buffered. Fine for 5
  MB images; **unacceptable for a multi-hundred-MB zip upload.**
- Web rendering: `apps/web/next.config.ts` `images.remotePatterns` allows only
  `localhost:9000`, `cdn.biasmarket.com`, `placehold.co`, `cdn.sanity.io`.
  `next/image` with any other host fails to render. So **importing a foreign
  image URL verbatim produces broken storefront images** — images must be
  re-hosted onto our bucket.

### 2.5 Request pipeline / limits

- `main.ts`: `NestFactory.create(AppModule, { bodyParser: false })` — body
  parsing is delegated to `@thallesp/nestjs-better-auth` (installed 2.8.0,
  `dist/index.mjs`): it installs `express.json()` + `express.urlencoded()` for
  every path except `/api/auth`, and `auth.module.ts` passes no `bodyParser`
  options → **Express defaults: 100 kb JSON and 100 kb urlencoded** on every
  JSON endpoint. Multipart is untouched. So a whole catalog can never be a JSON
  request body (plan uploads it as multipart); small JSON bodies (commit
  options) are fine.
- Global `ValidationPipe({ whitelist, forbidNonWhitelisted })`. The better-auth
  global `APP_GUARD` is on, so internal/public controllers need `@Public()`.
- CORS: methods `GET, POST, PATCH, DELETE, PUT, OPTIONS`; allowed headers
  `Content-Type, Authorization`; **no `exposedHeaders`**, so a cross-origin
  `fetch` from web cannot read `Content-Disposition` — the download filename
  must be built client-side (or `exposedHeaders` added).
- Caddy (`infra/vps/Caddyfile`, `infra/vps/caddy/active/api.caddy.example`):
  bare `reverse_proxy` + health check for the API vhost; **no
  `request_body max_size` and no timeouts** (Caddy's defaults are unlimited
  body, no read/write timeout). Verified. `/internal/*` is blocked
  (`handle /internal/* { respond 404 }`) and excluded from the `api` prefix in
  `main.ts` (`internal/*splat`).
- Rate limiting: `@nestjs/throttler` is configured **per module**
  (`customer-auth`, `contact`, `coupons` via `ThrottlerModule.forRoot`; also
  used as a guard in `buyer-google.controller.ts` and the internal controllers;
  `products.module.ts`/`stores.module.ts` and `product-search`/`stores`
  controllers use limit 60). Every instance is IP-keyed and in-memory per
  process (so limits double during a blue/green overlap). There is no global
  throttler; seller write endpoints have none; per-user hourly limits would need
  a custom `getTracker` — the plan instead counts DB rows.
- Concurrency precedent: `coupons.service.ts` and `create-order.usecase.ts` use
  `$queryRaw … FOR UPDATE` row locks inside transactions; there is **no**
  `pg_advisory_xact_lock` usage in `apps/api/src`.
- BullMQ: job ids may not contain `:` (installed 6.3.4); the shared default
  options retain completed/failed jobs (count 1000), and `add()` with an
  existing id is a silent no-op — re-enqueues need a new id.
- Sequencing hazard: the proposed product-URL-slug work
  (`.artifacts/2026/10/20261020--product-url-slugs/plan.md`) adds
  `Product.slug` + `allocateProductSlug` in `ProductsService.create`'s
  transaction; `Product` has no `slug` in the schema today. Any bulk product
  creator must call the allocator. Uncommitted migrations also exist in the
  working tree (e.g. `BuyerAccount`); new migrations must be ordered after them.
- Infra: Cloudflare DNS records for root, api, cdn and status are
  `proxied = true` (`infra/terraform/cloudflare.tf`), so the ~100 MB body (lower
  tiers) and ~100 s origin-timeout limits apply to uploads and to streamed
  downloads (time-to-first-byte). Caddy itself adds none.
- Public reads: `StoresService` filters collection products by
  `status === 'PUBLISHED'` (~l.342 sections path, ~l.362 orphan products,
  ~l.436), but `findCategoriesPublic` returns all categories with no product
  filter — a category created by an import is publicly listed before any product
  is published.
- Concurrency: the repo's `FOR UPDATE` precedent locks `user`/`Coupon`/
  `PickupPoint`; none locks `Store`, and `FOR UPDATE` on a row that other tables
  reference blocks their FK inserts (`FOR KEY SHARE`), so a `Store` mutex must
  use `FOR NO KEY UPDATE`. `queue.add` on the API's shared Redis connection
  (`maxRetriesPerRequest: null`) waits in ioredis' offline queue when Redis is
  down instead of rejecting.
- Lifecycle: `main.ts` never calls `app.enableShutdownHooks()` and the API has
  no `OnApplicationBootstrap`/`setInterval` provider (only `PrismaService` uses
  `OnModuleInit`/`OnModuleDestroy`); `@nestjs/schedule` is not a dependency.
- Auth/CSRF: `auth.config.ts` loads the `bearer()` plugin and sets no cookie
  attributes (better-auth defaults to `SameSite=Lax`); no `Origin` handling
  exists anywhere in `apps/api/src`; `trustedOrigins` covers only better-auth's
  own routes.
- No per-store product, category or collection cap exists; only `MAX_IMAGES = 6`
  (private to `ProductsService`).

### 2.6 Background jobs

- BullMQ queues in `packages/queue` (`ping`, `mailer`, `orders`, `premium`);
  `apps/workers` is deliberately thin: it **schedules** jobs and calls an
  authenticated internal endpoint on the API (`/internal/*`, guarded by
  `InternalJobsSecretGuard`, blocked at Caddy). All DB access stays in
  `apps/api`. Existing worker jobs are payload-less cron sweeps. API-side
  producers do exist: `MailerService.send`
  (`apps/api/src/mailer/
  mailer.service.ts`) does `queue.add(name, payload)`;
  queues are registered in `apps/api/src/queue/queue.module.ts` (global;
  registers PING, MAILER, ORDERS — **not** PREMIUM) and mirrored in
  `apps/workers/src/queue/queue.module.ts`. What has **no precedent** is an
  on-demand per-tenant job whose worker calls back into the API. Retries are
  at-least-once, so handlers must be idempotent.
- Internal controller pattern (`coupons/internal-premium-jobs.controller.ts`):
  `@ApiExcludeController() @Public() @UseGuards(ThrottlerGuard,
  InternalJobsSecretGuard) @Throttle({default:{ttl:60_000,limit:5}})`.
  `InternalJobsSecretGuard` lives in `orders/infrastructure/` and each consuming
  module re-provides it. The plan does not use this pattern for the import
  runner (it runs in-process).
- Blue/green: `INTERNAL_API_URL` is per color
  (`infra/vps/env/{blue,green}.runtime.env`), so a job picked up by one color's
  worker calls that color's API; during overlap the new queue is only consumed
  by the new color's worker (jobs wait). Item-level idempotency makes this safe.
- No file-staging area exists (no private "imports" bucket, no temp-dir
  convention).

### 2.7 Web (`apps/web`)

- Dashboard products page:
  `app/[locale]/(dashboard)/dashboard/[slug]/products/page.tsx`; header
  component `features/products/components/products-header.tsx` has search, "view
  storefront", "add product". Feature-slice layout and rules are in
  `apps/web/AGENTS.md`:
  `features/<name>/{schemas,api,queries,mutations,
  components}`; multipart
  calls stay on raw `fetch`/`FormData` (see
  `features/products/api/products.api.ts`); everything else goes through the
  Orval-generated client in `@biasmarket/types` (`apps/api/openapi.json` and
  `packages/types/generated/**` are committed; regenerate with the two commands
  in CLAUDE.md).
- The product form schema (`product-form.schema.ts`) is loose too
  (`name: min(1)`, `price: string min(1)`), so there are no authoritative max
  lengths anywhere to align import validation against; the plan sets them.
- i18n: dictionaries in `packages/i18n/{en,es}/dashboard.json` etc.; any UI copy
  needs both languages.
- Mobile app (`apps/mobile`) exists but is out of scope; the feature is
  API-first so it benefits later.
- `zod` is a dependency of `apps/web`, `packages/queue` and
  `packages/validation` (zod ^4.5.4, ESM, depends on `@biasmarket/utils`,
  consumed by web/mobile) — **not** of `apps/api` (class-validator) nor of
  `packages/utils` (`dependencies: {}`). `packages/validation` is the natural
  home for the wire-format schema. (CLAUDE.md's package list omits `validation`,
  `query`, `ui`.)
- Orval: `packages/types/orval.config.ts` uses an explicit `filters.tags`
  include list — a new controller tag must be added there;
  `pnpm generate:swagger-metadata` (pre-build/typecheck hook) updates the
  committed `apps/api/src/metadata.ts`; `generate:openapi` runs a build first.
  Multipart and binary-download endpoints stay on raw `fetch`.
- Storefront renders `product.description` as a React text node with
  `whitespace-pre-line` (`product-detail-view.tsx`) — plain text, auto-escaped.
  No sanitiser or markdown needed; length cap only.
- Infra: CI e2e has MinIO (`.github/workflows/ci.yml`, `scripts/ci/minio-e2e.sh`
  creates the buckets incl. `S3_PAYMENT_BUCKET`; `e2e-datastores.sh`). Bucket
  creation for prod/dev is inline in the `minio-init` command of
  `infra/vps/docker-compose.yml` and `infra/docker/docker-compose.dev.yml` (dev
  bucket names `products`/`logos`/ `payments`). `infra/vps/deploy.sh` hard-fails
  when `env/shared.env`'s checksum changes until `state/shared_env.sha256` is
  hand-updated — adding an env var there blocks the next automated deploy.
- `StoresService.delete` catches any error and returns 400; Product/Category/
  Collection/StoreSection FKs have no `onDelete`, so store deletion is already
  blocked once catalog rows exist (pre-existing). New `onDelete: Cascade` on
  import tables does not worsen it.

### 2.8 Plans / entitlements

`User.plan` (`basic`/`premium`) + `premiumUntil` exist (coupon system), but a
grep shows no feature gating on them outside auth config and coupon code. No
quota infrastructure. Whether import/export should be premium-gated or capped by
plan is a **product decision**, not a technical one (plan, D9).

---

## 3. Gaps against the goals

| #   | Gap                                                                                                                                                                                                       | Impact                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| G1  | No export of any kind; the closest read (`findAllForStore`) is dashboard-shaped, unpaginated, computes unneeded sales stats                                                                               | Build new read                                                         |
| G2  | No import / bulk-create path; `CreateProductDto` is too loose to reuse and one-at-a-time                                                                                                                  | Build new write                                                        |
| G3  | **No portable image story:** images are absolute URLs into our bucket; a JSON backup holding only URLs is not a backup (URLs die if the store/bucket is lost, and are meaningless in another environment) | Core design problem — 4.1                                              |
| G4  | No server-side remote fetch anywhere → no SSRF guard exists                                                                                                                                               | New attack surface — 4.2                                               |
| G5  | Upload path buffers whole file in memory with no multer limits                                                                                                                                            | Must fix for any bundle upload                                         |
| G6  | No `CopyObject` / bucket-read helper; `getPaymentImageStream` unsafe to reuse                                                                                                                             | Add scoped helpers                                                     |
| G7  | WebP/GIF rejected by upload validation; no transcoding                                                                                                                                                    | Per-image failure mode for external imports                            |
| G8  | Image cap (6) and text-length caps not enforced at DTO level                                                                                                                                              | Import enforces its own                                                |
| G9  | No natural key / external ID on `Product` → re-import duplicates                                                                                                                                          | Decision D4                                                            |
| G10 | No on-demand per-tenant background job pattern; no staging storage                                                                                                                                        | New pattern if async                                                   |
| G11 | No throttling on seller endpoints                                                                                                                                                                         | Add on export/import                                                   |
| G12 | `Category` root-level uniqueness not DB-enforced                                                                                                                                                          | Import must find-or-create carefully / serialise                       |
| G13 | `AuditLog` unused in catalog code                                                                                                                                                                         | Use for import/export events                                           |
| G14 | JSON bodies capped at 100 kb (verified, 2.5)                                                                                                                                                              | Catalog upload must be multipart                                       |
| G15 | Existing data can violate any limits an importer sets (unbounded category depth, name/description length, `images[]` length) → a backup of a legitimate store might not re-import                         | Export must warn/refuse against the same limits                        |
| G16 | `slugify` yields empty slug for non-Latin names (existing latent bug in collections create)                                                                                                               | Import needs fallback slug                                             |
| G17 | `recountPublishedProducts` and `MAX_IMAGES` are private to `ProductsService`                                                                                                                              | Expose/move                                                            |
| G18 | No image pixel-dimension bound anywhere (a 5 MB PNG can be tens of thousands of px; `next/image` decodes it)                                                                                              | Header-parse dimension cap on import (and ideally the existing upload) |

---

## 4. Findings that shape the design

### 4.1 The image problem (the user's core question)

A JSON file can't carry binaries sensibly (base64 inflates ~33%, blows memory,
makes files unreadable/hand-editable). Real options:

| Option                                                           | Backup fidelity                             | Hand-authored import  | Complexity                                                |
| ---------------------------------------------------------------- | ------------------------------------------- | --------------------- | --------------------------------------------------------- |
| **A. JSON with image URLs only**                                 | Weak: depends on our CDN still serving them | Good (any public URL) | Low export; **high import risk** (SSRF, re-hosting, WebP) |
| **B. ZIP bundle: `catalog.json` + `images/…`**                   | **Strong, self-contained**                  | Medium (must zip)     | Medium (zip stream r/w, size limits)                      |
| **C. JSON with inline base64**                                   | Self-contained                              | Poor                  | Memory + size blowup                                      |
| **D. Two-step: JSON, then upload images per product afterwards** | n/a                                         | OK                    | Many requests; no atomic story                            |

**Recommendation (detailed in plan.md):** the _file format_ references each
image as either a bundle-relative path or a URL; _export_ has two modes — plain
JSON (URLs; quick metadata backup) and ZIP bundle (images embedded; real
backup); _import_ accepts a `.json` or a `.zip` and **always re-hosts into our
own bucket** (never stores a foreign or other-store URL in `Product.images`),
because of the `deleteImage` aliasing hazard and the `next/image` host allowlist
(2.4). Remote-URL fetching is the highest-risk piece, so it is isolated behind
one SSRF-hardened fetcher and ships in its own phase after the ZIP path.

### 4.2 Security surface

New attack surface, none of which has an existing guard in the repo:

1. **SSRF** via remote image URLs in an uploaded file (cloud metadata endpoints,
   `minio:9000`, `redis`, `db`, localhost, DNS rebinding, redirects to internal
   hosts). The API container shares a Docker network with MinIO/Redis/Postgres.
2. **Zip bombs / zip-slip / entry-count floods** in an uploaded bundle.
3. **Arbitrary bucket/key read** if export reuses `getPaymentImageStream`
   semantics with a poisoned `images[]` URL.
4. **Resource exhaustion:** unbounded upload size, product count, image count,
   concurrent imports per store, memory buffering.
5. **Cross-tenant:** import must ignore any `id`/`storeId` in the file and
   derive everything from the authenticated store; export must filter every
   query by `storeId` (CLAUDE.md hard rule), including nested relation reads.
6. **Stored content:** `description` is rendered on public storefronts — confirm
   how the storefront renders it (plain text vs markdown) before deciding
   whether import sanitises; do not introduce a new rendering path. (Not
   verified here; implementation task.)
7. **Image content:** magic-byte sniffing must be applied to every fetched /
   unzipped image (reuse `detectUploadMimeType`), never filename or remote
   `Content-Type`.

### 4.3 Atomicity and scale

The existing create does product + variants + categories in one transaction
(fine for one product). A 300-product import in a single interactive transaction
risks the Prisma transaction timeout (5 s default) and holds locks; image upload
is network I/O that must not sit inside a DB transaction. Per-product
transactions with a persisted item-level report (partial success, resumable) is
the right shape.

### 4.4 Idempotency

No natural key → import is naturally **create-only**; running it twice
duplicates the catalog. Mitigations: dry-run preview flagging name matches
against existing live products, and a skip-duplicates option. Real upsert needs
a stable external key (schema change) — deferred, D4.

### 4.5 Money

File carries prices as **decimal strings** (`"25.00"`), validated by regex and
range (`Decimal(10,2)` ⇒ max `99999999.99`), written to Prisma as strings /
`Decimal`, never via JS `number` arithmetic.

### 4.6 Status / publishing

Export includes `status` informationally, but import makes everything `DRAFT`
(the "new product is always DRAFT" invariant; avoids publishing a half-imported
store). There is no keep-status option; sellers publish through a bulk-publish
endpoint scoped to one import (per-product `publish` is one click per product
and would make a 300-product import painful).

### 4.7 Categories and collections

Names, not IDs, are the stable references: categories by name path
(`Albums > Photocards`), collections by `slug`. Import must find-or-create
within the store. Because root-level category uniqueness isn't DB-enforced
(G12), do find-or-create in a single serialised resolver pass before products
(not concurrently per product).

---

## 5. Open decisions

See the plan's Decisions section (D1–D12), each with a recommended default. The
biggest product-level one is the ZIP size ceiling vs image-heavy stores (plan:
"Backup ceilings", measured in P0).

---

## 6. Related prior work

- `.artifacts/2026/10/20261020--product-url-slugs/plan.md` — in-flight
  `Product.slug`; import must integrate (see the sequencing note in 2.5).
- `.artifacts/2026/09/20260907--store-rich-content-and-thin/plan.md` —
  `publishedProductCount` / `contentStaleAt` (2.3).
- `.artifacts/2026/08/20260804--orval-client-rollout/plan.md` — how multipart
  endpoints are handled in the generated client.
- `docs/core/security-payments.md` — validation / REST conventions.
