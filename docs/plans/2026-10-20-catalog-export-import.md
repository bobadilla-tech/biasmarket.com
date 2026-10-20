# Catalog export / import (JSON + ZIP)

Status: proposed (revision 3, after two review rounds). Audit:
`docs/audits/catalog-export-import-audit-2026-10-20.md` (cited below as A2.4 =
audit §2.4, G5 = audit gap 5). Handoff:
`.artifacts/2026/10/20261020--catalog-json-export-import/handoff-prompt.md`.
Planning only; nothing is implemented. Re-verify code claims before building (§9
lists what is still unconfirmed).

## Why

Sellers have no way to back up their catalog or to stand a store up from data
they already have. Goals: (1) download the store catalog (categories,
collections + order, products, variants, image references) in a documented,
versioned format; (2) import that format — or a hand-written/derived file — with
a preview, a background run and a per-item report; (3) round-trip export → new
store → import; (4) deal with **images** deliberately.

### What happens to images (the headline question)

A JSON file cannot sensibly carry binaries (base64 = +33 %, unreadable,
memory-hungry). So the format _references_ images, and the import always
**re-hosts** them into our bucket (never stores a foreign or other-store URL —
`deleteImage` would delete an object another product still uses, A2.4, and
`next/image` only renders our CDN host, A2.4).

| Source of the image                                                          | Works after   | How                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image inside a **ZIP** exported by us (or hand-built to spec)                | P3+P4         | Travels in the file; always works. **This is the real backup.**                                                                                                                                   |
| JSON with **our own CDN URLs**, same environment                             | P3+P4         | Server-side S3 copy. Only works while the original objects still exist — a JSON-only export is a _metadata_ backup, links rot when images are deleted.                                            |
| JSON with foreign URLs (Shopify, Instagram, another Bias Market environment) | P5 (optional) | SSRF-hardened fetch. Most such CDNs serve WebP/AVIF, which we reject (JPEG/PNG only, A2.4) → needs a transcode step (`sharp`) too. Until then: product imported **without** that image + warning. |
| Plain `.json` that uses `{path}` images                                      | never         | Warning `IMAGE_PATH_WITHOUT_ZIP`; product imported without image.                                                                                                                                 |

**Honest ceiling:** ZIP bundles are capped at 90 MiB (§3.4), so an image-heavy
store (hundreds of products × multi-MB photos) can't produce a single-file
backup in v1; the UI says so and offers JSON. Lifting this (chunked upload,
multi-volume export) is P7 and depends on real store sizes — P0 measures them.

## Non-goals (v1)

Orders/customers/payments/coupons/restock (PII, financial). Store settings,
payment methods, theme, sections (P7). Shopify/CSV converters. Upsert by
external key. Foreign-URL fetching and WebP (P5). Publishing on import
(everything imports as `DRAFT`; bulk publish is added in P6 instead).

## Decisions

| #   | Decision                           | Default                                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                        |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Portable image format              | ZIP (`catalog.json` + `images/`) and plain JSON                                                                                                                                                                                                                                                    | See table above.                                                                                                                                                                                                                                           |
| D2  | Flow                               | Upload → **async PREPARING** (202, polled) → READY preview → commit → async run                                                                                                                                                                                                                    | Prepare of ≤ 90 MiB (inflate, sniff, ~hundreds of S3 PUTs) must not be one HTTP request: Terraform uses Cloudflare (`infra/terraform/versions.tf`), whose proxy has ~100 s origin timeout and ~100 MB body limit **if records are proxied (P0 verifies)**. |
| D2a | Prepare runner                     | **In-process** in the API after the 202 (not via the worker). A deploy/restart mid-prepare marks it `FAILED(PREPARE_INTERRUPTED)` via the sweep; the seller re-uploads (nothing is lost, pre-commit)                                                                                               | Avoids a second file transfer; prepare is cheap to repeat.                                                                                                                                                                                                 |
| D2b | Run transport                      | Repo convention: API enqueues BullMQ job; worker loops an authenticated **internal endpoint** that runs bounded slices                                                                                                                                                                             | Matches `expire-premium`. Cost acknowledged (internal route, secret, Caddy block, second deployable).                                                                                                                                                      |
| D3  | Foreign image URLs                 | P5, optional, independent                                                                                                                                                                                                                                                                          | Highest-risk piece; not in v1's definition of done.                                                                                                                                                                                                        |
| D4  | Re-import                          | Create-only. Commit option `duplicates: skip` (default) / `create`. Duplicate = same `normalizeProductName` as a live product; preview shows each match with a link                                                                                                                                | No external key; upsert is P7.                                                                                                                                                                                                                             |
| D5  | Status                             | **Always `DRAFT`** (no `keepStatus`, file `status` ignored/warned)                                                                                                                                                                                                                                 | Invariant "new product is DRAFT" (A2.2); removes plan/limit bypass and the recount path. Bulk publish ships in P6 so 300 products ≠ 300 clicks.                                                                                                            |
| D6  | Scope                              | categories, collections (+order), products, variants, images                                                                                                                                                                                                                                       |                                                                                                                                                                                                                                                            |
| D7  | Currency                           | Product `currency` optional → target store's `defaultCurrency`. Commit option `currency: keep-file` (default) / `use-store`. Mismatch warns in preview                                                                                                                                             | Create path allows per-product currency; checkout behaviour verified in P0.                                                                                                                                                                                |
| D8  | Existing collection with same slug | Always **merge** (append after current max position); merges listed in preview                                                                                                                                                                                                                     | Changes a live collection → must be visible; no `create-new` mode in v1.                                                                                                                                                                                   |
| D9  | Plan gating                        | None; `assertCanTransfer(user)` seam + kill switch `CATALOG_IMPORT_ENABLED` (default off until verified; gates all import routes)                                                                                                                                                                  | No quota infra (A2.8).                                                                                                                                                                                                                                     |
| D10 | Staging                            | New private bucket `S3_IMPORT_BUCKET`, **required only when the flag is on**; no reuse of the payment bucket; MinIO lifecycle rule expire > max TTL (7 days) as backstop                                                                                                                           | Blast radius; deploy-ordering (§6).                                                                                                                                                                                                                        |
| D11 | Throttling                         | DB-count rules (multi-instance/blue-green safe): ≤ 6 uploads/hour/user, ≤ 20 uploads/day/store, ≤ 10 exports/hour/user (count `CatalogImport` rows / `AuditLog` `catalog.export`). Plus an **in-process semaphore** (2) on prepare + ZIP export. Read endpoints unthrottled (authenticated, cheap) | Stock throttler is IP-keyed, per-process (A2.5).                                                                                                                                                                                                           |
| D12 | Where the schema lives             | zod schema in `apps/api/.../catalog-bundle` (add `zod` to api); limits + `normalizeProductName` in `packages/utils/src/catalog-bundle` (pure, for web display). No client-side pre-parse in v1. JSON Schema for sellers generated from zod and committed under `docs/`                             | Avoids a new api→validation→utils turbo edge; server is the only validator.                                                                                                                                                                                |

## File format v1 (`catalog.json`)

Documented for sellers in `docs/core/catalog-import-export.md` (P1 deliverable)
with a downloadable example (validated by a test).

```jsonc
{
  "format": "biasmarket.catalog",
  "version": 1,
  "exportedAt": "2026-10-20T12:00:00.000Z",
  "source": {
    "storeName": "...",
    "storeSlug": "...",
    "defaultCurrency": "PEN"
  }, // informational
  "warnings": [],
  "categories": [
    { "ref": "c1", "name": "Albums", "parentRef": null },
    { "ref": "c2", "name": "Photocards", "parentRef": "c1" }
  ],
  "collections": [
    {
      "ref": "col1",
      "name": "Comeback 2026",
      "slug": "comeback-2026",
      "description": "",
      "productRefs": ["p1", "p2"]
    }
  ], // order = position
  "products": [{
    "ref": "p1",
    "name": "Album — Version A",
    "description": "…",
    "price": "25.00",
    "currency": "USD",
    "soldOut": false,
    "discontinued": false,
    "availableUntil": "2026-12-31T00:00:00.000Z",
    "categoryRefs": ["c2"],
    "images": [{ "path": "images/p1-0.jpg" }], // each: exactly one of path | url
    "variants": [{
      "name": "Jungkook",
      "stock": 10, // null/omitted = unlimited
      "priceOverride": "27.00",
      "image": { "path": "images/p1-v0.jpg" },
      "attributes": { "member": "Jungkook" }
    }]
  }]
}
```

Never exported: `id`, `storeId`, `slug` (product), `reserved`, `soldUnits`,
`deletedAt`, `createdAt`, `status` (all DRAFT on import; export includes
`status` informationally only), orders, customers. **Import never accepts a
product slug from a file** (collision/injection vector; the slug allocator owns
it — see §8).

Validation rules (issues are `{code, path, params}`; path like
`products[12].variants[3].price`; report ≤ 100; server re-validates everything):

- **Unknown keys:** a denylist (`id`, `storeId`, `ownerId`, `slug` on products,
  `createdAt`, `deletedAt`, `reserved`, `__proto__`, `constructor`, `prototype`)
  is a **file-level error**; any other unknown key is ignored with one
  `UNKNOWN_FIELD` warning per path class. Additive format changes therefore
  don't bump `version`; breaking changes do. Importer accepts `version ≤` its
  max.
- **Structure:** refs unique per kind; every `parentRef`/`categoryRefs`/
  `productRefs` resolves; no category cycle; depth ≤ 5; sibling category names
  unique **case-insensitively** after NFC+trim (else file error); a product at
  most once per collection; two collections resolving to the same slug = file
  error.
- **Money:** `^\d{1,8}(\.\d{1,2})?$` (≥ 0, matches the create DTO), Prisma
  `Decimal` from the string, never `Number` math (A4.5). `currency` ∈
  `SUPPORTED_CURRENCIES`. `stock`: integer 0 … 1 000 000 or null.
  `availableUntil`: ISO-8601 UTC, year 2000–2100.
- **Text:** product name 2–200 (trimmed), description ≤ 10 000 (plain text —
  storefront renders text nodes, A2.7), variant name 1–120, attribute keys ≤ 40
  / values ≤ 120 / ≤ 10 entries / ≤ 1 KiB serialised, category name 1–80,
  collection name 1–120. All stored names/text are **NFC-normalised**.
  **Reject** U+0000 and other C0/C1 controls (except `\n`, `\t` in description),
  lone surrogates, bidi overrides **and isolates** (U+202A–202E, U+2066–2069),
  zero-width/invisible characters (U+200B–200F, U+2060–2064, mid-string U+FEFF)
  and Unicode tag characters (U+E0000 block). Duplicate JSON keys are last-wins
  (accepted knowingly — values are validated after parsing).
- **Collection slug:** file `slug`, else `slugify(name)`; if that is empty
  (Hangul/CJK — `slugify` strips non-`[a-z0-9]`, A2.2) use deterministic
  `c-<first 8 hex of sha1(NFC name)>` so re-imports merge into the same
  collection. Merge key = slug. (Fixing `CollectionsService.create`'s own
  empty-slug bug is out of scope.)
- **Images:** ≤ 6 per product; extras dropped with warning `IMAGES_TRUNCATED`
  (relative order preserved; if image 0 fails the next becomes primary with a
  warning). Variant `image` is a separate reference; failure → variant without
  image + warning. JPEG/PNG only (sniffed), ≤ 40 MP. Total references ≤
  `MAX_IMAGE_REFS` (incl. variants and duplicates).
- **Problems are file-level (block commit) vs warnings:** schema/reference/
  limit errors block; image problems, currency mismatch, duplicates, merges
  warn.
- **ZIP layout/reader:** `catalog.json` at root located **by name**, inflated
  with an abort-at-limit cap of `MAX_JSON_BYTES`; images under
  `images/<[A-Za-z0-9._-]{1,120}>`. Entry names are lookup keys only (never
  filesystem paths). Reader uses the **central directory** (not local headers)
  and **rejects**: duplicate names, encrypted entries, symlinks, methods other
  than stored/deflate, zip64, **overlapping entry ranges** and data before the
  first/after the central directory; **ignores local-header sizes** (our
  streaming writer emits data descriptors) and counts actual inflated bytes with
  hard abort-at-limit caps (no ratio heuristic). Each referenced entry is
  inflated and staged **once**; N references copy from the staged object at run
  time. Unreferenced entries → warning. No `catalog.json` ⇒ `INCOMPLETE_ARCHIVE`
  (also how a truncated streamed export is detected — `catalog.json` is written
  last).

## Architecture

### Code layout

```
apps/api/src/modules/catalog-transfer/      flat module, no DDD-lite layering
  catalog-transfer.module.ts
  catalog-export.controller.ts / .service.ts
  catalog-import.controller.ts / .service.ts     upload, prepare, preview, commit, cancel, report
  catalog-import-runner.service.ts               one slice
  catalog-import-sweep.service.ts                watchdog + retention + orphan + staging-retry
  catalog-import-internal.controller.ts          POST /internal/catalog-imports/:id/run
                                                 POST /internal/catalog-imports/sweep
  catalog-bundle/                                zod schema, issue codes, zip reader/writer, image sniff
  safe-remote-fetch.ts                           (P5)
packages/utils/src/catalog-bundle/               limits, normalizeProductName, slug fallback
packages/queue/src/jobs/catalog-import.jobs.ts   names, payload, cron const
apps/workers/src/jobs/catalog-import/            processor + scheduler (P4)
```

### Data model (additive; expand-only per `docs/core/blue-green-migrations.md`)

```prisma
enum CatalogImportStatus { PREPARING READY QUEUED RUNNING COMPLETED COMPLETED_WITH_ERRORS FAILED CANCELLED EXPIRED }
enum CatalogImportItemStatus { PENDING DONE SKIPPED FAILED }

model CatalogImport {
  id                String   @id @default(cuid())
  storeId           String
  createdById       String                     // no FK, like AuditLog.actorId
  status            CatalogImportStatus
  sourceKind        String                     // "json" | "zip"
  options           Json     @default("{}")    // { duplicates, currency }
  preview           Json     @default("{}")    // counts + warning codes; reduced to counts on terminal
  refMap            Json     @default("{}")    // ref → category/collection id
  collectionBase    Json     @default("{}")    // collection id → base position
  refsResolvedAt    DateTime?                  // "first slice done" discriminator
  error             String?                    // fixed-vocabulary code
  leaseToken        String?                    // fencing token of the active slice
  leaseUntil        DateTime?
  lastSliceAt       DateTime?
  queuedAt          DateTime?
  stallCount        Int      @default(0)
  cancelRequestedAt DateTime?
  stagingDeletedAt  DateTime?
  createdAt         DateTime @default(now())
  expiresAt         DateTime                   // READY sliding TTL (+24h on view, max 72h from createdAt)
  startedAt         DateTime?
  finishedAt        DateTime?
  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
  items CatalogImportItem[]
  @@index([storeId, createdAt])
  @@index([createdById, createdAt])
  @@index([status, expiresAt])
  @@index([status, lastSliceAt])
  @@index([finishedAt])
}

model CatalogImportItem {
  id        String   @id @default(cuid())
  importId  String
  storeId   String                              // copied from the import row, set once
  index     Int                                 // position in file; stable when SKIPPED
  ref       String
  label     String                              // product name (≤ 200) for the report
  status    CatalogImportItemStatus @default(PENDING)
  productId String?                             // set in the SAME tx that creates the product
  error     String?                             // code
  warnings  Json     @default("[]")             // codes + params
  catalogImport CatalogImport @relation(fields: [importId], references: [id], onDelete: Cascade)
  @@unique([importId, index])
  @@index([importId, status, index])
  @@index([storeId])
}
```

`Store` needs back-relation `catalogImports CatalogImport[]`. Migrations in
`packages/db/prisma/migrations`. **No product content is stored in the DB**: the
validated, normalised content lives in staging as `plan.json` (below), so
retention is a staging concern and item rows hold only index/ref/label/status.

**Mutual exclusion:** all check-and-transition steps (create PREPARING, READY
promotion/supersede, commit, cancel) run inside one `$transaction` that first
locks the store row: `SELECT id FROM "Store" WHERE id = $1 FOR UPDATE` via
`$queryRaw` (the row-lock pattern the repo already uses — `coupons.service.ts`,
`create-order.usecase.ts`; **P0 re-verifies** and that it works through the pg
adapter), with an explicit tx `timeout`. Every status change is a
compare-and-set (`updateMany WHERE status IN (…)`, check `count`).
Leases/heartbeats use **DB time**
(`UPDATE … SET leaseUntil = now() + interval
'90 seconds'` via `$executeRaw`)
because two API colors may run at once.

### Staging layout (private bucket)

`<importId>/upload.bin` (raw upload, deleted after prepare) ·
`<importId>/plan.json` (validated+normalised products with, per image, its
source: `{staged: "<importId>/images/<k>.<ext>"}` | `{ownKey: "products/…"}` |
`{foreign: url}` | none, plus per-product `collections: [{colRef, idx}]`) ·
`<importId>/images/<k>.<ext>` (one per distinct referenced zip entry, key
extension and ContentType from the **sniffed** type).

### Flows

**Export** — `GET /stores/:storeId/catalog/export?format=json|zip`

1. `assertOwnership`; D11 limits; in-process semaphore for zip.
2. Dedicated queries (not the dashboard `findAllForStore`s, A2.2), each filtered
   by `storeId` and `deletedAt: null`: categories; collections with ordered
   `CollectionProduct` where `product: { storeId, deletedAt: null }`; products
   with variants + `ProductCategory`. Chunked (200).
3. **Limit awareness** (same constants as import): JSON export always succeeds
   and records `warnings` (codes) for everything the importer would
   reject/truncate (counts, depth, name/description caps, >6 images, JSON
   bytes). ZIP export first computes total image bytes from **S3 HEAD
   ContentLength** (distinct images, concurrency 16) and refuses with 422
   `EXPORT_EXCEEDS_LIMITS` if refs, zip bytes (≈ sum, images don't compress),
   uncompressed bytes or JSON bytes exceed the caps — never a ZIP our importer
   can't read.
4. `json`: build in memory. The web client builds the filename (CORS exposes no
   `Content-Disposition`, A2.5).
5. `zip`: streaming ESM writer (library chosen in P0). Image reads go through
   new `StorageService.getPublicObjectStream(url)`: key must match
   `^products/[A-Za-z0-9._-]+$` **after rejecting** any `%`, `\`, `?`, `#`, `;`,
   non-ASCII, `..` and `//` in the URL path (no decode-and-normalise), and the
   URL must start with `${S3_PUBLIC_URL}/${S3_BUCKET}/` exactly. Images first,
   `catalog.json` last, listing only images written; failures → omitted
   - warning. One entry per reference. Destroy S3 streams on disconnect.
6. Audit `catalog.export` (format, counts).

**Upload → PREPARING** — `POST /stores/:storeId/catalog/imports` (multipart
`file`; no option fields; flag-gated)

1. Guards `AuthGuard` → `assertOwnership` → D11 count checks (429) → multer
   (guards run before interceptors; unauthenticated bodies aren't read).
2. Multer **disk storage** in a per-process subdir of `IMPORT_TMP_DIR` (startup
   writability check; boot cleanup is **age-based only**, never deleting another
   color's live files), `limits.fileSize = MAX_ZIP_BYTES`, type by magic bytes
   (`PK\x03\x04` vs `{`), `.json` ≤ `MAX_JSON_BYTES`. Errors: 413, 415.
3. Store-locked tx: 409 `IMPORT_IN_PROGRESS` if any `PREPARING|QUEUED|RUNNING`
   import exists for the store; insert `PREPARING` row. Respond **202** `{id}`.
   Prepare continues in-process (semaphore 2); the temp file is deleted in
   `finally`.
4. Prepare: JSON → bounded parse + validate. ZIP → central-directory reader over
   the temp file per the rules above; stream-inflate each referenced entry once
   with abort-at-limit counting; sniff (`detectUploadMimeType`, JPEG/PNG only);
   parse pixel dimensions from the header using a vetted tiny library (e.g.
   `image-size`; confirm ESM/maintenance in P0) ≤ 40 MP; PUT to staging with
   explicit ContentType. Write `plan.json`.
5. Preview computation: counts; duplicates vs live (non-deleted,
   `storeId`-filtered) products via `normalizeProductName` (NFKC, lowercase,
   trim, collapse whitespace), each with the matched product id; in-file
   duplicate names (warning only); categories/collections created vs found;
   collection **merges**; per-product image problems; currency mismatches;
   projected totals vs `MAX_LIVE_PRODUCTS_PER_STORE` and
   `MAX_CATEGORIES_PER_STORE`.
6. Store-locked tx: insert `CatalogImportItem` rows (label = name; status
   PENDING), set `READY` + `expiresAt`, and **supersede** the same store's
   previous `READY` import (→ `EXPIRED`, error `SUPERSEDED`). Staging of the
   superseded import is deleted afterwards. Failure at any earlier step →
   `FAILED` with a code (the previous READY import is untouched).

**Report/poll** — `GET …/imports/:id` (status, preview or totals, items
paginated ≤ 100) extends `expiresAt` by 24 h (max 72 h from `createdAt`) while
`READY`; `GET …/imports` (last 20) powers "resume on page load". All lookups via
`findOwnedImport(importId, storeId, userId)`: 404 for any mismatch, including
`import.storeId !== :storeId`.

**Commit** — `POST …/imports/:id/commit` `{ duplicates, currency }`

ONE store-locked tx: import is `READY` and `expiresAt > now()` (410
`IMPORT_EXPIRED` / `IMPORT_SUPERSEDED`); no other `QUEUED|RUNNING` import for
the store (409); **recompute duplicates now** and mark those items `SKIPPED`
when `duplicates=skip`; re-check live-product and category totals; write
`options`; CAS `READY → QUEUED`, `queuedAt = now()`. After the tx: enqueue with
`jobId: catalog-import-<id>-r0` (BullMQ rejects `:` in ids; completed/failed
jobs are retained by default and silently block re-adds of the same id, so
re-enqueues use `-r<stallCount>`). Enqueue failure is tolerated: the sweep
re-enqueues `QUEUED` older than 5 min. Audit `catalog.import.commit`.

**Run** (worker → API) — `POST /internal/catalog-imports/:id/run`

Pattern copied from `coupons/internal-premium-jobs.controller.ts`
(`@ApiExcludeController() @Public()`, `ThrottlerGuard` at a generous 120/min,
`InternalJobsSecretGuard` re-provided by the module; route outside the `api`
prefix via the existing `internal/*splat` exclusion; Caddy 404s `/internal/*`
publicly). Loads by id, **scopes every query by the import row's `storeId`**,
and refuses unless status ∈ {QUEUED, RUNNING} (tested).

A slice:

0. **Terminal ⇒ `{done:true}`** (so redelivery after completion can't loop).
1. **Lease:** CAS
   `status IN (QUEUED,RUNNING) AND (leaseUntil IS NULL OR
   leaseUntil < now())`
   → `RUNNING`, new random `leaseToken`, `leaseUntil =
   now()+90s`,
   `lastSliceAt = now()`. No lease ⇒ `{done:false, retryInMs:5000}`. If
   `cancelRequestedAt` set ⇒ finalise as CANCELLED (below).
2. **Reference pass** (once, when `refsResolvedAt IS NULL`; one tx under the
   store lock; writes `refMap`, `collectionBase`, `refsResolvedAt` atomically):
   find-or-create categories by name path (case-insensitive, NFC-trimmed match;
   created rows keep the file's casing); find-or-create collections by
   `(storeId, slug)` compound key (merge →
   `collectionBase =
   current max position + 1`, else 0). Accepted race: a
   seller creating the same root category by hand during the run can duplicate
   it (root uniqueness isn't DB-enforced, G12) — documented, no data loss.
3. **Items** (≤ 25 per slice, slice deadline ≈ 45 s, per-item deadline 20 s),
   `plan.json` read once per slice. For each `PENDING` item: a. Images, outside
   any tx, to deterministic keys `products/imp-<importId>-<index>-<n>.<ext>`
   (variant: `…-v<k>`): staged object or own-CDN key → S3 `CopyObject` with
   `MetadataDirective: REPLACE` and explicit ContentType. Own-CDN source key
   must match the same strict `^products/[A-Za-z0-9._-]+$` rules as export and
   exact prefix `${S3_PUBLIC_URL}/${S3_BUCKET}/` (a URL from another environment
   is "foreign"). Overwrites are idempotent. (Accepted, documented: a seller can
   copy any public product-image URL they know — keys are random UUIDs and
   already public; S3 object metadata `imported-from=<importId>` gives
   provenance for takedowns.) b. ONE `$transaction` with explicit `timeout`: i.
   **fence:**
   `UPDATE "CatalogImport" SET leaseUntil = now()+90s,
         lastSliceAt = now() WHERE id = ? AND status = 'RUNNING' AND
         leaseToken = ? RETURNING id`
   — 0 rows ⇒ abort (zombie slice); ii.
   `UPDATE item SET status='DONE', productId=… WHERE id = ? AND
         status='PENDING'`
   — 0 rows ⇒ abort tx, **do not clean up** (another writer owns those keys);
   iii. allocate the product slug with `allocateProductSlug` from the
   product-URL-slug work (§8) inside this tx; create product `DRAFT` (`storeId`
   from the import row; currency per option), variants via `createMany` **with
   `storeId` set** (no synthesised variant — mirrors `create`; revisit if §9
   finds checkout needs one), `ProductCategory` from `refMap` (verify ids belong
   to `import.storeId`, reusing `assertCategoriesInStore` logic), and
   `CollectionProduct` rows `position = collectionBase[col] + idx` with
   `createMany({
         skipDuplicates })`. Collection membership lives in the
   product tx — there is **no end-of-run attach pass**. Skipped items add no
   memberships. A slug unique-violation (P2002) is retried once with a fresh tx,
   then item FAILED `SLUG_CONFLICT`. c. Failure handling: CAS `PENDING → FAILED`
   (code); **only if that CAS succeeds** delete this item's deterministic keys
   (best effort). Infra errors (DB down) release nothing, throw → non-2xx →
   BullMQ retry; the lease just expires.
4. **Finalise** (when no `PENDING` remain; one tx incl. the audit row, fenced by
   the lease token): status via CAS from `RUNNING` — all items DONE/SKIPPED ⇒
   `COMPLETED`; ≥ 1 DONE and ≥ 1 FAILED ⇒ `COMPLETED_WITH_ERRORS`; 0 DONE and ≥
   1 FAILED ⇒ `FAILED(ALL_ITEMS_FAILED)`; set `finishedAt`; reduce `preview` to
   counts; write `AuditLog` `catalog.import.complete` (`actorId = createdById`,
   counts only). **No recount** — everything is DRAFT, so
   `publishedProductCount` is unaffected. After the tx: delete staging
   (`stagingDeletedAt`).

**Cancel** `POST …/cancel` (store-locked tx): `PREPARING|READY` → `CANCELLED` (+
staging delete; an in-flight prepare notices on its next step); `QUEUED` →
`CANCELLED`; if that CAS finds 0 rows (a lease raced in) fall through to the
`RUNNING` branch: set `cancelRequestedAt`. On any transition to a terminal
status (cancel, fail, expire) the same tx marks remaining `PENDING` items
`SKIPPED(CANCELLED|…)`; because the product tx fences on
`status='RUNNING' AND
leaseToken`, a zombie slice can't create products
afterwards. Products already created (and their collection memberships) stay;
undo is P7. A cancel on a RUNNING import whose worker is dead is finalised by
the sweep (≤ 15 min).

**Sweep** — `POST /internal/catalog-imports/sweep`, cron `*/5 * * * *` from
workers (`catalog-import-sweep` scheduler id in `packages/queue`): `PREPARING`
older than 10 min → `FAILED(PREPARE_INTERRUPTED)`, delete its staging; `QUEUED`
with `queuedAt` older than 5 min → re-enqueue (`-r<stallCount>`, increment);
`RUNNING` with `lastSliceAt` older than 15 min → `stallCount++`, re-enqueue, and
after 3 ⇒ `FAILED(STALLED)` (items `SKIPPED`); `READY` past `expiresAt` →
`EXPIRED` + staging delete; terminal imports with `stagingDeletedAt IS NULL` →
retry staging delete; for FAILED/CANCELLED/EXPIRED imports with an expired lease
→ delete `products/imp-<importId>-*` keys of items that are not `DONE`; terminal
imports older than 60 days → delete rows (items cascade). Structured logs:
importId/storeId/counts/durations only — never names, URLs or hostnames.

### Limits (constants in `packages/utils/src/catalog-bundle`, enforced on **both** export and import)

| Constant                                    | Value              | Notes                                                                                     |
| ------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `MAX_JSON_BYTES`                            | 8 MiB              | 300 products × (10 000 CJK chars ≈ 30 KB + variants)                                      |
| `MAX_ZIP_BYTES`                             | 90 MiB             | below Cloudflare's ~100 MB body limit; images don't compress, so this is the real ceiling |
| `MAX_UNCOMPRESSED_BYTES`                    | 120 MiB            |                                                                                           |
| `MAX_PRODUCTS` / `MAX_VARIANTS_PER_PRODUCT` | 300 / 30           |                                                                                           |
| `MAX_IMAGES_PER_PRODUCT`                    | 6                  | = existing `MAX_IMAGES` → move to a shared constant                                       |
| `MAX_IMAGE_REFS`                            | 1 500              | incl. variants + duplicates; effective byte cap is the zip cap                            |
| `MAX_IMAGE_BYTES` / `MAX_IMAGE_PIXELS`      | 5 MiB / 40 MP      | existing / new                                                                            |
| `MAX_CATEGORIES` (file) / `_PER_STORE`      | 300 / 500; depth 5 |                                                                                           |
| `MAX_COLLECTIONS`                           | 100                |                                                                                           |
| `MAX_LIVE_PRODUCTS_PER_STORE`               | 2 000              | re-checked at commit; concurrent manual creation can exceed it by a few (accepted)        |

### Security acceptance criteria

- Every endpoint: `assertOwnership`; import ids via `findOwnedImport` (404);
  every query filters `storeId`; for `ProductCategory`/`CollectionProduct` (no
  `storeId` column) isolation is via the parent relation and by verifying
  referenced category/collection ids belong to the store. **Test:** user B
  cannot read/commit/cancel A's import; a file containing another store's
  collection slug merges only into B's own `(storeId, slug)`.
- File content never supplies `id`/`storeId`/product slug.
- Strict S3 key rules for export reads and own-CDN copies (above); new helpers
  assert the prefix (`deleteImage` doesn't, A2.4).
- ZIP rules above; sniff + dimension cap on every image; extension and
  ContentType from the sniffed type.
- Internal endpoints: secret guard, 120/min throttle, not routed by Caddy,
  status precondition; leaked-secret blast radius = driving already-committed
  imports only.
- P5 fetcher (if built): `https`/443 only; DNS-resolve then connect to the
  validated IP; block loopback/private/link-local/CGNAT/ULA/multicast/
  metadata/Docker ranges and IPv4-mapped IPv6; ≤ 3 re-validated redirects; 10 s
  timeout; streamed 5 MiB cap; ≤ 4 concurrent; no cookies; fixed UA.
- Errors/warnings are codes + params; web owns the text. Logs/audit carry ids
  and counts only. Retention: staging deleted at terminal/TTL; import rows 60
  days (items hold only the product `label`).
- HTTP vocabulary: 202 accepted, 404, 409 `IMPORT_IN_PROGRESS`, 410
  `IMPORT_EXPIRED|IMPORT_SUPERSEDED`, 413, 415, 422 `FILE_INVALID`
  (issues)|`EXPORT_EXCEEDS_LIMITS`, 429.

## Phases

Each phase ends green on `pnpm typecheck`, `pnpm lint`, `pnpm --filter api test`
(+ web where touched). P1, P2, and P3 (flag off) are independently
mergeable/deployable; **enable the flag only after P4**. No phase relaxes the
security criteria.

**P0 — verification (no code).** Resolve §9; measure real store image bytes
(sets the ZIP ceiling decision); record in `implementation-log.md`; pick ZIP
libraries (central-directory reader over a file; ESM streaming writer) and the
dimension library.

**P1 — format + JSON export.** zod schema + issue codes in the api module;
limits/normaliser/slug-fallback in `packages/utils` (+ tests incl. adversarial
and fuzz); `docs/core/catalog-import-export.md`, example file and generated JSON
Schema; export service/controller (json); DB-count throttle; audit; OpenAPI (add
the tag to `packages/types/orval.config.ts` `filters.tags`, run
`generate:swagger-metadata`, `generate:openapi`, types `generate`); download
stays raw `fetch`. Tests: service spec with fake Prisma (every call has
`storeId`; parent-relation filter for join tables), controller ownership, e2e
(schema-valid output; B can't export A; soft-deleted excluded; over-limit store
carries warnings). _Acceptance:_ nested categories, ordered collections,
variants round-trip into the schema; no ids/PII.

**P2 — ZIP export + storage helpers.** `getPublicObjectStream`,
`copyPublicObject` (strict keys, explicit ContentType), prefix assertion helper;
HEAD-size pre-check; ZIP writer; semaphore; disconnect handling. Tests: key
fixtures (`..`, `%2e%2e`, `//`, `?`, payment-bucket path, other host), e2e on CI
MinIO (exists, A2.7), memory check. _Acceptance:_ opens in stock tools;
`catalog.json` last; only written images referenced.

**P3 — import engine (API side), flag-gated.** _Precondition:_ product-slug work
Release 1 merged (§8). Prisma + migration; `CATALOG_IMPORT_ENABLED`,
`S3_IMPORT_BUCKET` (required only when on), `IMPORT_TMP_DIR` env + validation +
`.env.example`s + compose/`minio-init` (prod + dev) +
`scripts/ci/minio-e2e.sh` + lifecycle rule + deploy docs; queue registration in
the API `QueueModule` (+ `packages/queue` names); upload/prepare/preview/
commit/cancel/report; runner; sweep; expose `MAX_IMAGES` shared. Tests:
validator + fuzz; zip bomb / slip names / duplicate names / overlapping entries
/ encrypted / zip64 / flood / oversize pixels / JSON bomb inside zip;
duplicates + in-file dups; **concurrency** (two simultaneous slices; commit vs
cancel; two uploads; two tabs → superseded); **crash injection** (after S3 copy,
after tx, before finalise, after finalise before staging delete → rerun gives
exact counts, no duplicates, no deleted live images); lease-token fencing
(zombie slice can't create after cancel); sweep (stuck PREPARING/QUEUED/
RUNNING, jobId round); tenant isolation; terminal-run returns done; e2e
round-trip on MinIO (export zip A → import fresh B; compare **normalised**
catalogs = ignore ids/timestamps/slugs, images by byte hash and must be
different objects). _Acceptance:_ by hand (upload → commit → internal run)
imports a ZIP and a JSON; repeating run/commit is a no-op.

**P4 — worker + schedules.** `apps/workers/src/jobs/catalog-import/` processor
(loops `/run` until `done`, honours `retryInMs`, per-call timeout > slice
budget; **the worker's `INTERNAL_API_URL` is per color — document how the active
color is resolved and that drained-color calls are safe because of fencing**) +
sweep scheduler; queue registered in the workers `QueueModule`; specs mirroring
`expire-premium`. _Acceptance:_ commit completes unattended; killing the API
mid-import and restarting finishes it. Then flip the flag on.

**P5 — foreign image URLs (optional).** `safe-remote-fetch.ts` per the criteria
with exhaustive IP-classifier tests; WebP/AVIF→JPEG via `sharp` as a separate
decision (native dep ⇒ Docker image). Wire into run step 3a.

**P6 — web UI + bulk publish.** `features/catalog-transfer/` per
`apps/web/AGENTS.md`: `api/` (raw fetch; **XHR for upload progress**; blob
download, client-built filename), `queries/` (polling with backoff, stops at
terminal; "resume" from the list endpoint on load; a "taking longer than
expected" state when `QUEUED` > 5 min), `mutations/`, `components/`. Entry:
button in `products-header.tsx` **and the empty-state CTA on a store with no
products** (so "stand up a new store" is one click). Dialog: Export tab (ZIP is
the default button; JSON explained as links-not-pictures; over-limit warnings),
Import tab (drop → progress → paginated preview: counts, warnings, duplicates
with product links and per-run override, merges, currency option → confirm →
progress → report, failed items listed). Notices: "not imported: orders, stock
reservations, sales, store settings, payment methods, theme, sections —
collections appear on the storefront only after you add a section for them".
Bulk publish: small endpoint `POST …/products/publish` (`{productIds}` or all
drafts) that performs exactly what per-product `publish` does (only
`findOwnedProduct` + status update today — P0 confirms) plus **one**
`recountPublishedProducts`; UI "Publish all imported drafts". Strings ES+EN in
`packages/i18n/{en,es}/dashboard.json` keyed by issue/warning code. Tests:
component states, bulk publish service spec. _Acceptance:_ export ZIP → new
store → import → publish → live products with images.

**P7 — follow-ups (own plans).** Chunked upload / multi-volume export for
image-heavy stores; undo import; store profile/payment/sections; onboarding
"start from a file"; upsert by external key; converters; plan quotas;
foreign-URL phase if skipped; fix `CollectionsService.create` empty slug; admin
lookup of an import by id.

## Rollout

Merge P1 → P2 first (export only; no new env; immediate backup value for stores
within the ceiling). P3 ships with the flag off; P4 follows; enable. Deploy
ordering for P3: `deploy.sh` hard-fails when `env/shared.env`'s checksum changes
until `state/shared_env.sha256` is hand-updated (A2.7) — document the step;
`S3_IMPORT_BUCKET` is only `requiredEnv` when the flag is on, so the old color
keeps booting. Create the bucket and lifecycle rule explicitly on the existing
prod MinIO (the inline `minio-init` only runs at compose-up). Migration is
expand-only and must be ordered **after** the slug migration and the pending
`BuyerAccount` migration — don't interleave. Runbook
`docs/core/catalog-import-runbook.md` (cancel/force-fail an import, clean
staging, find an import by id, disk monitoring via Uptime Kuma). Update
CLAUDE.md (module list) and `apps/web/AGENTS.md` at the end.

## Risks

| Risk                                       | Mitigation                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| SSRF                                       | Isolated fetcher, own optional phase, default deny                                                                                             |
| Disk/memory exhaustion                     | disk-backed upload + caps, central-directory reader, abort-at-limit inflate, pixel cap, semaphore, one active import/store, DB-count throttles |
| Duplicate products on retry/redelivery     | store-lock + lease token fencing + `WHERE status='PENDING'` CAS inside the product tx                                                          |
| Deleting a live product's images           | cleanup only after our own CAS-to-FAILED succeeds; terminal sweeps only after lease expiry                                                     |
| Stuck imports                              | lease expiry, sweep with round-suffixed job ids, `FAILED(STALLED)`                                                                             |
| Storage growth (no per-store quota exists) | 2 000-product cap, 20 uploads/day/store, disk alert via Uptime Kuma; revisit with quotas (P7)                                                  |
| Backup ceiling surprises sellers           | UI states it; P0 measures; P7 lifts it                                                                                                         |
| Image-less outcomes from foreign JSON      | clear matrix + warnings; P5                                                                                                                    |
| Scope creep                                | Non-goals, P7                                                                                                                                  |

## 8. Must not be decided silently

Upsert-by-name; publishing on import; any URL fetching outside the P5 fetcher;
reusing `CreateProductDto`; storing a foreign URL in `Product.images`; zip entry
names touching disk; web touching the DB (CLAUDE.md #1); asymmetric
export/import limits; reusing the payment bucket; accepting a product `slug`
from a file.

**Interaction with `docs/plans/2026-10-20-product-url-slugs.md`:** that plan
adds `Product.slug` (nullable then NOT NULL, `@@unique([storeId, slug])`,
`allocateProductSlug` in `ProductsService.create`'s tx with P2002 retry). Import
creates products through its own tx and **must** call the allocator there (run
step 3b.iii); otherwise it writes NULL slugs (regression) or fails after
Release 2. Sequence: slug Release 1 merged before P3 starts; re-check the
allocator's final signature when implementing.

## 9. Still to verify (P0)

1. Cloudflare proxy status/limits for `biasmarket.com`/`api.` (body size,
   timeout) — sets `MAX_ZIP_BYTES`/D2.
2. Real store image byte totals (ceiling decision).
3. Store-row `FOR UPDATE` through `@prisma/adapter-pg` in a `$transaction` (repo
   uses `$queryRaw … FOR UPDATE` elsewhere — confirm and copy exactly; an
   earlier draft wrongly claimed advisory-lock precedent).
4. Library choices: central-directory ZIP reader (dup/encrypted/symlink/ overlap
   detection, size accounting), ESM streaming writer, dimension reader;
   turbo/build impact of adding `zod` to api.
5. MinIO: `CopyObject` across buckets with the API credentials/policy;
   lifecycle-rule syntax for the pinned image.
6. How workers reach the API per color; exact `expire-premium` processor/
   scheduler shape; `packages/queue` default job options (`removeOnComplete`
   /`attempts`) for the new queue.
7. Orders/checkout: need ≥ 1 variant per product? single store currency?
8. **Public collection reads: do they filter `status: PUBLISHED`?** Merging
   DRAFT imports into a live collection must not leak drafts.
9. What per-product `publish` enforces today (confirm: nothing beyond
   ownership + status) so bulk publish matches it.
10. `product-search.service.ts` Postgres-only (no index to refresh); whether
    sitemap/ISR caches need revalidation after bulk publish (the recount stamps
    `contentStaleAt`).
11. Writable temp-disk size in the API container.
12. Where the shared `MAX_IMAGES` lives (suggest `apps/api/src/common/`).
13. Env/infra touchpoint list in P3 is complete (grep for other `S3_*`
    enumerations incl. `docs/core/deploy.md`/`infra.md`).
14. Product slug plan's final allocator API.

## Definition of done

P1–P4 and P6 merged, flag enabled in production after a staging run of a
~300-product ZIP; P5 optional. `docs/core/catalog-import-export.md` and the
runbook published; CLAUDE.md and `apps/web/AGENTS.md` updated;
`implementation-log.md` maps each security criterion to a test; round-trip e2e
green in CI.

## Revision log

- v1: initial draft.
- v2 (round 1): fact fixes, lease/CAS, deterministic keys, limits.
- v3 (round 2; 12+15 and 16+14+8 findings): moved to `docs/` per repo
  convention; async PREPARING; cut `keepStatus`, `collections: create-new`,
  per-item `data` (→ staged `plan.json`), client pre-parse, custom throttler,
  hand-rolled image parser, P5 from definition of done; added lease token +
  fencing, Store-row lock (replacing a false advisory-lock claim), atomic
  commit/supersede, terminal-run semantics, round-suffixed BullMQ ids, missing
  model fields, safe cleanup rules, sweep endpoint, strict S3 key rules,
  Unicode/JSON hardening, ZIP overlap/descriptor/bomb rules, honest ZIP
  ceiling + image matrix, slug-plan interaction, bulk publish, kill switch,
  deploy ordering.
