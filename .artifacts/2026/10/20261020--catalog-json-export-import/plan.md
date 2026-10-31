# Catalog export / import (JSON + ZIP)

Status: proposed.

- Audit: `.artifacts/2026/10/20261020--catalog-json-export-import/audit.md`
  (cited as A2.4 = audit §2.4, G5 = audit gap 5).
- Handoff:
  `.artifacts/2026/10/20261020--catalog-json-export-import/handoff-prompt.md`
- Review history:
  `.artifacts/2026/10/20261020--catalog-json-export-import/review-log.md`
- Related in-flight work:
  `.artifacts/2026/10/20261020--product-url-slugs/plan.md` (adds `Product.slug`;
  see "Interaction with the product slug work").

## Why

Sellers cannot back up their catalog or stand a store up from data they already
have. Goals:

- Download the store catalog (categories, collections + order, products,
  variants, image references) in a documented, versioned format.
- Import that format, or a hand-written/derived file, with a preview, a
  background run and a per-item report.
- Round-trip: export → new store → import → publish.
- Handle **images** deliberately.

### What happens to images

A JSON file cannot sensibly carry binaries (base64 = +33 %, unreadable,
memory-hungry). So the format _references_ images and import always **re-hosts**
them into our bucket. It never stores a foreign or other-store URL:
`deleteImage` would delete an object another product still uses (A2.4) and
`next/image` only renders our CDN host (A2.4).

| Image source                                                     | Works after   | How                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside a **ZIP** exported by us (or built to spec)               | P3            | Travels in the file. **This is the real backup.**                                                                                                                                                       |
| JSON with **our own CDN URLs**, same environment                 | P3            | Server-side S3 copy, only if the key belongs to a product of a store the same user owns (D8). A JSON-only export keeps **links, not pictures**; links rot when images are deleted.                      |
| JSON with foreign URLs (Shopify, Instagram, another environment) | P5 (optional) | SSRF-hardened fetch. Those CDNs mostly serve WebP/AVIF, which we reject (JPEG/PNG only, A2.4), so it also needs a transcode (`sharp`). Until then the product imports **without** that image + warning. |
| Plain `.json` using `{path}` images                              | never         | Warning `IMAGE_PATH_WITHOUT_ZIP`; product imported without the image.                                                                                                                                   |

### Backup ceilings (shown in the UI before download)

- ZIP bundle ≤ **90 MiB**. Images don't compress, so this is the real image
  ceiling; an image-heavy store cannot make a single-file backup in v1 and is
  told so (with the measured size) before anything downloads. The ZIP button is
  disabled above the ceiling and JSON (links only) is offered.
- ≤ **1 000** products in a file, ≤ 30 variants per product, JSON ≤ 24 MiB.
  These are **new import/export ceilings**; the repo enforces no product cap
  today (manual creation stays unlimited in v1). Stores above them get a JSON
  export with `EXCEEDS_IMPORT_LIMITS` warnings (when the JSON itself fits) and a
  refused ZIP.
- Cloudflare proxies api/root/cdn (`infra/terraform/cloudflare.tf`,
  `proxied = true`), so uploads and the streamed ZIP also sit under its body
  limit (~100 MB on lower tiers) and ~100 s origin time-to-first-byte limit.

Lifting these (chunked upload, multi-part export, a real product cap) is a
follow-up; P0 measures real store sizes first.

## Goals

- `GET` export as JSON or ZIP; `POST` upload → preview → commit → report.
- Item-level idempotent, resumable, fenced runner that survives restarts and
  blue/green overlap.
- Everything imports as `DRAFT`; bulk publish scoped to one import.
- Tenant isolation per CLAUDE.md; web never touches the DB.
- ES + EN UI; the API returns error/warning **codes**, web owns the text.

## Non-goals

- Orders, customers, payments, coupons, restock (PII/financial). Store settings,
  payment methods, theme, sections.
- Shopify/CSV converters; upsert by external key; undo.
- Foreign-URL fetching and WebP (P5, optional).
- Publishing on import; accepting a product `slug` from a file; a general
  per-store product cap.

## Decisions

### D1. Format and image carriage

`catalog.json` (below) alone or inside a ZIP with `images/`. Import accepts
either and always copies images into the public bucket under keys it generates.

### D2. Flow and runner

Upload → async **PREPARING** (202, polled) → **READY** preview → commit → async
run → report. Prepare of ≤ 90 MiB (inflate, sniff, hundreds of S3 PUTs) must not
be one HTTP request (Cloudflare ~100 s).

**Both prepare and run execute in the API process**, claimed from the database,
not through BullMQ/`apps/workers`. This deliberately departs from the
thin-worker convention (`expire-premium`): that pattern would add a queue, job
ids, an internal route, a shared secret, a Caddy block, a per-color
`INTERNAL_API_URL` and a Redis dependency on the commit path. Recovery comes
from a **lease** on the import row and an API-side interval
(`setInterval(...)
.unref()` in an `OnApplicationBootstrap` provider;
`@nestjs/schedule` is not a dependency and the API has no such provider today)
that claims runnable imports whose lease has expired. Both colors may run it;
fencing makes that safe. Process rules:

- One import runs per process (a mutex, not a convention); the runner is a
  detached task tracked by the provider, never inlined in a sweep tick; each
  sweep tick has a `running` flag so ticks never overlap.
- Never block the event loop: validation and normalisation yield
  (`setImmediate`) between products; inflate and image work are streams; the
  sweep never reads `plan.json` except to purge orphans of a failed/cancelled
  import. A 24 MiB JSON parse + validation is measured in P0 (RSS, event-loop
  lag); there is no container `mem_limit` in `infra/vps/docker-compose.yml`
  today, so P0 states a memory requirement.
- **Shutdown:** `main.ts` never calls `app.enableShutdownHooks()`; P3 adds it.
  On SIGTERM the runner stops claiming, aborts the current item (AbortSignal)
  and releases its lease in a fenced update (`leaseUntil = now()`), so the other
  color resumes within one tick. `deploy.sh`'s stop timeout must exceed the item
  deadline (P0 verifies).

### D3. Re-import

Create-only. Commit option `duplicates: skip` (default) / `create`. A duplicate
is a live (non-deleted) product of the same store with the same
`normalizeProductName` (NFKC, lowercase, trim, collapse whitespace). Skip is by
count, so retries work: if the store already has _k_ live products named N, the
first _k_ occurrences of N in the file are duplicates and later ones import. The
preview shows each match with its product id; no per-item overrides in v1. To
recover from a partial run, fix and re-upload: products already created are
skipped.

### D4. Status

Always `DRAFT` (file `status` is informational only). Bulk publish (P4) is
scoped to one import.

### D5. Currency

Product `currency` optional → target store's `defaultCurrency`. When the preview
finds a product currency different from the store's, the confirm step **requires
an explicit choice** `currency: keep-file | use-store` (no default). If P0 finds
checkout is single-currency, `keep-file` is removed.

### D6. Existing collection with the same slug

Merge (append after the current max position); merges are listed in the preview.
Merge key = collection slug.

### D7. Flags

- `CATALOG_IMPORT_ENABLED` (default off): gates **upload and commit** (404 when
  off) and the runner start. Report (GET), cancel and bulk-publish routes stay
  available so sellers can still read, cancel and publish earlier imports. Read
  at boot; boot fails if the flag is on and `S3_IMPORT_BUCKET` or
  `IMPORT_TMP_DIR` is unset.
- A **cleanup-only sweep always runs when `S3_IMPORT_BUCKET` is configured**:
  expire READY, purge staging of terminal imports, retention, and finalise a
  `RUNNING` import with `cancelRequestedAt` set once its lease expired. It never
  starts or resumes runs. With the flag off, QUEUED/RUNNING imports stay as they
  are until the flag is re-enabled or they are force-failed (runbook).
- `CATALOG_EXPORT_ZIP_ENABLED` (default on) is a separate kill switch for ZIP
  export so a broken writer can be turned off without removing JSON export.
- `assertCanTransfer(user)` is a seam for future plan gating (no quota
  infrastructure exists, A2.8).

### D8. Own-CDN image copies

An `ownKey` source is copied only when its normalised URL
(`${S3_PUBLIC_URL}/${S3_BUCKET}/products/…`, exact form) appears in
`Product.images` or `ProductVariant.imageOverride` of a product (soft-deleted
included) in a store owned by the **same user**. `images` is a `String[]` with
no GIN index and `imageOverride` has no index, so this is **not** a per-ref
indexed lookup. Instead the runner loads, once per run (at the first claim, kept
in memory), the set of image URLs of the owner's stores using the existing
`storeId` index (`storeId IN (owner's stores)`) and checks refs against that
`Set`; P0 measures the cost on the largest store. This closes copying a
competitor's public storefront images and still permits moving a seller's own
images between their stores. Not found, not owned and unsupported all return the
same code `IMAGE_UNAVAILABLE` (no existence oracle). Copies carry S3 object
metadata `imported-from=<importId>`. Fails safe: a JSON backup whose products
were hard-deleted imports without those images.

### D9. Staging

New private bucket `S3_IMPORT_BUCKET`, accessed through a separate
`ImportStagingService` provided by a factory when the bucket env is set (so old
colors, whose boot validation doesn't know the var, are unaffected). Not the
payment bucket. A MinIO lifecycle rule expires staging after 3 days as a
backstop (also covers a paused zombie that writes after a purge). The raw upload
stays on local temp disk and never goes to the bucket. CI MinIO uses one root
credential, so least-privilege isolation between buckets is not testable there.

### D10. Throttling and abuse bounds

No stock throttler (IP-keyed, per process, A2.5). A guard **before multer**:
session (`request.session.user.id`; the global better-auth `APP_GUARD` runs
first), `assertOwnership`, flag, cookie-session CSRF check, ≤ 6 uploads/hour/
user (re-checked inside the locked tx of step 3; the lock is per store, so
best-effort across one user's several stores), global in-flight caps (uploading
≤ 2, preparing ≤ 2, a waiting room of 2, else 503 + `Retry-After`; bounds are
per process, so ≤ 8 across two colors), a required `Content-Length` ≤
`MAX_ZIP_BYTES` + 64 KiB (no chunked), and a free-disk reserve of 4 ×
`MAX_ZIP_BYTES` on `IMPORT_TMP_DIR`. ZIP export: semaphore (2) + a
time-to-first-byte budget (below). JSON export builds ≤ 24 MiB in memory: it
shares the export semaphore. Read endpoints are unthrottled (authenticated,
cheap).

**CSRF:** a multipart POST is a CORS "simple request". better-auth defaults to
`SameSite=Lax` (`auth.config.ts` sets no cookie attributes), which blocks
cross-site cookies but not same-site siblings (`api.` and `cdn.` share the
registrable domain), and no Origin handling exists in `apps/api/src`
(better-auth's `trustedOrigins` covers only its own routes). New code: when the
request authenticates by **cookie** (no `Authorization` header) require
`Origin === WEB_URL` and reject a missing Origin; bearer-authenticated clients
(mobile) are exempt because the credential is not ambient.

### D11. Where code lives

Zod wire schema + issue codes in `apps/api/.../catalog-bundle` (add `zod` to
api). Limits, `normalizeProductName` and the collection slug fallback in
`packages/utils/src/catalog-bundle` (pure; web shows the limits; consumed as
`@biasmarket/utils/catalog-bundle`, so api typecheck needs the utils build like
`currency` today). No client-side pre-parse in v1.

### D12. Locking

Check-and-transition steps (create PREPARING, READY promotion/supersede, commit,
cancel, reference pass) run in a short `$transaction` that first runs
`SELECT id FROM "Store" WHERE id = $1 FOR NO KEY UPDATE` via `$queryRaw`
(**not** `FOR UPDATE`, which would block every FK insert referencing the store,
such as orders and products). The repo's `FOR UPDATE` precedent
(`coupons.service.ts`, `create-order.usecase.ts`) locks other tables; P0 proves
an order/product insert isn't blocked while the lock is held. Product creation
does not take this lock, so the commit-time total re-check is best-effort. Every
status change is a compare-and-set (`updateMany WHERE status IN (…)`, check
`count`). Lease and heartbeat times use **DB time** (`$executeRaw … now()

- interval`) because two colors may run.

**The lease fence must be a row-locking statement**, never a plain read:
`UPDATE "CatalogImport" SET "lastBeatAt" = now(), "leaseUntil" = now() +
interval '90 seconds' WHERE id = ? AND status = 'RUNNING' AND "leaseToken" = ?`
(0 rows → stop). Inside a product transaction it serialises against `terminate`,
cancel and lease takeover until commit.

## File format v1 (`catalog.json`)

Will be documented for sellers in `docs/core/catalog-import-export.md` (P1),
including the list of issue/warning codes with one actionable sentence each, and
a downloadable example validated by a test.

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
      "productRefs": ["p1", "p2"] // order = position
    }
  ],
  "products": [
    {
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
      "variants": [
        {
          "name": "Jungkook",
          "stock": 10, // null/omitted = unlimited
          "priceOverride": "27.00",
          "image": { "path": "images/p1-v0.jpg" },
          "attributes": { "member": "Jungkook" }
        }
      ]
    }
  ]
}
```

Never exported: `id`, `storeId`, product `slug`, `reserved`, `soldUnits`,
`deletedAt`, `createdAt`, orders, customers. `status` is exported
informationally and ignored on import. **Import never accepts a product slug
from a file** (collision/injection vector; the slug allocator owns it).

Validation (issues are `{code, path, params}`, path like
`products[12].variants[3].price`; at most 100 reported; the server always
re-validates everything; `ref` values compare byte-exact). _File-level_ errors
block commit; _warnings_ don't.

- **Unknown keys:** a denylist (`id`, `storeId`, `ownerId`, product `slug`,
  `createdAt`, `deletedAt`, `reserved`, `__proto__`, `constructor`, `prototype`)
  is file-level. Any other unknown key is ignored with one `UNKNOWN_FIELD`
  warning per path class. Additive changes don't bump `version`; breaking ones
  do. Importer accepts `version ≤` its max.
- **Structure (file-level):** ≥ 1 product (`EMPTY_CATALOG`); refs unique per
  kind and all references resolve; no category cycle; depth ≤ 5; a product at
  most once per collection; two collections resolving to the same slug. Sibling
  category names that differ only by case/NFC are a **warning** and merge into
  one category, because existing stores can legitimately contain `Albums` and
  `albums`.
- **Money:** `^\d{1,8}(\.\d{1,2})?$` (≥ 0), converted to Prisma `Decimal` from
  the string, never `Number` math (A4.5). `currency` ∈ `SUPPORTED_CURRENCIES`.
  `stock`: integer 0…1 000 000 or null. `availableUntil`: ISO-8601 UTC, year
  2000–2100.
- **Text:** product name 2–200 (trimmed), description ≤ 5 000 (plain text: the
  storefront renders text nodes, A2.7), variant name 1–120, attribute keys ≤ 40
  / values ≤ 120 / ≤ 10 entries / ≤ 1 KiB serialised, category name 1–80,
  collection name 1–120. Stored text is **NFC-normalised**. **File-level
  reject:** NUL and other C0/C1 controls (except `\n`, `\t` in description),
  lone surrogates, bidi overrides/isolates (U+202A–202E, U+2066–2069; the error
  message tells the seller to remove invisible text-direction characters),
  Unicode tag characters (U+E0000 block). **Strip with a warning:** other
  invisibles (U+200B, U+200E–200F, U+2060–2064, mid-string U+FEFF). **Allowed:**
  U+200C/U+200D (emoji ZWJ sequences, Persian/Indic/CJK text). Duplicate JSON
  keys are last-wins (accepted; values are validated afterwards).
- **Collection slug:** file `slug`, else `slugify(name)`; if empty (Hangul/CJK:
  `slugify` keeps only `[a-z0-9]`, A2.2) use deterministic
  `c-<first 8 hex of sha1(NFC name)>` so re-imports merge into the same
  collection.
- **Images:** `path` must match `^images/[A-Za-z0-9._-]{1,120}$` (no `..`, no
  leading `/`); ≤ 6 per product (extras dropped, warning `IMAGES_TRUNCATED`,
  order preserved; if image 0 fails the next becomes primary, with a warning);
  variant `image` is a separate reference and a failure only drops that image
  (max 6 + 30 = 36 refs per product). JPEG/PNG only (sniffed), ≤ 40 MP. Total
  references ≤ `MAX_IMAGE_REFS`.
- **ZIP reader:** `catalog.json` at the archive root, exact case, inflated with
  an abort-at-limit cap of `MAX_JSON_BYTES`; images under `images/`. Entry names
  are lookup keys, never filesystem paths. Reads the **central directory** (not
  local headers) and **rejects**: duplicate names, names that collide
  case-insensitively or after NFC, names > 140 bytes, archive comment > 1 KiB,
  more than `MAX_ZIP_ENTRIES` central-directory entries (checked before
  iterating), encrypted entries, symlinks, methods other than stored/deflate,
  zip64, overlapping entry ranges, prepended/appended data. It **ignores
  local-header sizes** (our streaming writer uses data descriptors) and counts
  actual inflated bytes against hard abort-at-limit caps, with
  `MAX_UNCOMPRESSED_BYTES` applied as a **sum across entries**. No ratio
  heuristic. Each referenced entry is inflated and staged **once**; N references
  copy from the staged object. Unreferenced entries → warning. No `catalog.json`
  → `INCOMPLETE_ARCHIVE` (also how a truncated streamed export is detected:
  `catalog.json` is written last).
- **Export applies the same rules:** anything the importer would reject or
  truncate appears in `warnings` of a JSON export; a ZIP export that would
  exceed limits fails with 422 `EXPORT_EXCEEDS_LIMITS`; JSON above
  `MAX_JSON_BYTES` fails with 422 `JSON_TOO_LARGE`.

## Architecture

### Code layout

```
apps/api/src/modules/catalog-transfer/      flat module, no DDD-lite layering
  catalog-transfer.module.ts
  catalog-export.controller.ts / .service.ts
  catalog-import.controller.ts / .service.ts   guard, prepare, preview, commit, cancel, report, publish
  catalog-import-runner.service.ts             claims + runs an import in-process
  catalog-import-sweep.service.ts              interval: resume, expire, purge, retention
  import-staging.service.ts                    private bucket I/O
  catalog-bundle/                              zod schema, issue codes, zip reader/writer, image sniff
  safe-remote-fetch.ts                         (P5)
packages/utils/src/catalog-bundle/             limits, normalizeProductName, slug fallback
```

### Data model (additive; expand-only per `docs/core/blue-green-migrations.md`)

```prisma
enum CatalogImportStatus { PREPARING READY QUEUED RUNNING COMPLETED COMPLETED_WITH_ERRORS FAILED CANCELLED EXPIRED }
enum CatalogImportItemStatus { PENDING DONE SKIPPED FAILED }

model CatalogImport {
  id                String   @id @default(cuid())
  storeId           String
  createdById       String                    // no FK, like AuditLog.actorId
  status            CatalogImportStatus
  sourceKind        String                    // "json" | "zip"
  fileName          String                    // sanitised, ≤ 120
  fileBytes         Int
  options           Json     @default("{}")   // { duplicates, currency }
  preview           Json     @default("{}")   // counts, warning codes, collection merges; reduced to counts at terminal
  refMap            Json     @default("{}")   // ref → { id, created } for categories/collections
  collectionBase    Json     @default("{}")   // collection id → base position
  refsResolvedAt    DateTime?                 // reference pass done
  error             String?                   // fixed-vocabulary code
  leaseToken        String?                   // fencing token of the active runner
  leaseUntil        DateTime?
  leaseClaims       Int      @default(0)      // +1 per claim, reset to 0 whenever an item reaches a final status
  lastBeatAt        DateTime                  // set at insert; heartbeat for prepare and run
  cancelRequestedAt DateTime?
  stagingDeletedAt  DateTime?
  createdAt         DateTime @default(now())
  expiresAt         DateTime                  // PREPARING: createdAt+1h; READY: readyAt+24h (fixed)
  startedAt         DateTime?
  finishedAt        DateTime?                 // set by every terminal transition
  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
  items CatalogImportItem[]
  @@index([storeId, createdAt])
  @@index([createdById, createdAt])
  @@index([status, expiresAt])
  @@index([finishedAt])
}

model CatalogImportItem {
  id               String   @id @default(cuid())
  importId         String
  storeId          String                     // copied from the import row; item writes use WHERE id AND storeId
  index            Int                        // position in file; stable when SKIPPED
  ref              String
  label            String                     // product name (≤ 200) for the report
  status           CatalogImportItemStatus @default(PENDING)
  attempts         Int      @default(0)       // poison-item breaker
  matchedProductId String?                    // existing duplicate found at preview/commit
  productId        String?                    // set in the SAME tx that creates the product
  error            String?                    // code
  warnings         Json     @default("[]")    // codes + params (image, currency, truncation, …)
  catalogImport CatalogImport @relation(fields: [importId], references: [id], onDelete: Cascade)
  @@unique([importId, index])
  @@index([importId, status, index])
}
```

`Store` needs a back-relation `catalogImports CatalogImport[]`. Migrations live
in `packages/db/prisma/migrations`. **Product content is never stored in the
DB**: validated, normalised content lives in staging as `plan.json`. The
paginated report reads only item rows
(`index, label, status, matchedProductId,
productId, error, warnings`);
collection merges and counts live in `preview`. Tables are small, so sweep scans
need no more indexes.

**Tenant rule, stated once:** runner and sweep key on `importId`, but every
read/write of tenant data (products, categories, collections, memberships) uses
`import.storeId`, and item updates are `WHERE id = ? AND storeId = ?`.

### Staging layout (private bucket)

- `<importId>/plan.json`: validated + normalised products; per image its source
  (`{staged: key}` | `{ownKey}` | `{foreign: url}` | none) plus the destination
  `ext` and ContentType; per product `collections: [{colRef, idx}]`. The ext of
  a staged image comes from the sniff; for an `ownKey` it comes from the 16-byte
  sniff done at run time (JPEG→`jpg`, PNG→`png`, else `IMAGE_UNAVAILABLE`), not
  from the source key's extension; the plan records an expected ext only to
  derive orphan keys (both extensions are purged).
- `<importId>/images/<k>.<ext>`: one object per distinct referenced zip entry.

### State machine

| From      | To                                | Actor / predicate                                                                                                                          |
| --------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| (none)    | PREPARING                         | upload tx: no `PREPARING\|QUEUED\|RUNNING` import for the store, except a PREPARING whose `lastBeatAt` is > 5 min old (that one is failed) |
| PREPARING | READY                             | prepare step 6, CAS `WHERE status='PREPARING'`; also supersedes the store's previous READY (→ EXPIRED, `error='SUPERSEDED'`, same tx)      |
| PREPARING | FAILED / CANCELLED                | prepare error or deadline (CAS `WHERE status='PREPARING'`) / cancel / sweep (`lastBeatAt` > 5 min or `expiresAt` passed)                   |
| READY     | QUEUED                            | commit tx, `WHERE status='READY' AND expiresAt > now()`                                                                                    |
| READY     | EXPIRED / CANCELLED               | sweep past `expiresAt` / cancel / superseded                                                                                               |
| QUEUED    | RUNNING                           | runner lease claim                                                                                                                         |
| QUEUED    | CANCELLED                         | cancel CAS (0 rows → a lease raced in → treat as RUNNING)                                                                                  |
| RUNNING   | RUNNING                           | lease takeover by the sweep (any color) after expiry; `leaseClaims++`                                                                      |
| RUNNING   | COMPLETED / COMPLETED_WITH_ERRORS | finalise, fenced; WITH_ERRORS if any item FAILED (including all items failed)                                                              |
| RUNNING   | CANCELLED                         | runner sees `cancelRequestedAt` between items, or the sweep after lease expiry                                                             |
| RUNNING   | FAILED                            | `RUN_ERROR`: unrecoverable infra error, or sweep when `leaseClaims ≥ 3` (three claims with no item reaching a final status in between)     |

Items: `PENDING → DONE | FAILED | SKIPPED`. SKIPPED reasons: `DUPLICATE`
(commit), `CANCELLED`, `IMPORT_FAILED`. Every move into a terminal import status
goes through one helper `terminate(importId, status, code)` which, in one tx,
sets `finishedAt`, reduces `preview` to counts and marks remaining `PENDING`
items `SKIPPED`. Staging is deleted by `terminate`'s caller only when every item
is DONE or SKIPPED(DUPLICATE); otherwise the sweep deletes it after purging
orphans (see Sweep). Cancel and finalise racing: whichever CAS wins; the loser
returns "already finished". READY rows have `leaseUntil = NULL`.

### Flows

**Export** — `GET /stores/:storeId/catalog/export?format=json|zip`

1. `assertOwnership`; export semaphore (503 + `Retry-After` when full); ZIP is
   refused when `CATALOG_EXPORT_ZIP_ENABLED` is off.
2. Dedicated queries (not the dashboard `findAllForStore`s, A2.2), each filtered
   by `storeId` and `deletedAt: null`: categories; collections with ordered
   `CollectionProduct` where `product: { storeId, deletedAt: null }`; products
   with variants + `ProductCategory`. Counts are checked **before** building (no
   unbounded in-memory build); chunk product reads (200).
3. ZIP pre-check: refuse early when distinct images exceed the entry cap; total
   image bytes from S3 **HEAD ContentLength** (concurrency 16) against the caps,
   else 422. The pre-check must finish well inside Cloudflare's time-
   to-first-byte limit (budget 30 s, then 422 `EXPORT_TOO_SLOW`); response
   headers flush immediately after it.
4. JSON: respond with `application/json`; the web client builds the filename
   (CORS exposes no `Content-Disposition`, A2.5).
5. ZIP: streaming ESM writer (library picked in P0). Reads go through
   `getPublicObjectStream(url)`, which **reads by key from `S3_BUCKET` with the
   S3 SDK and never fetches the URL**. The URL must start exactly with
   `${S3_PUBLIC_URL}/${S3_BUCKET}/` and the remainder must match
   `^products/[A-Za-z0-9_-][A-Za-z0-9._-]*$` (no leading dot); any `%`, `\`,
   `?`, `#`, `;`, non-ASCII, `..` or `//` is rejected outright (no
   decode-and-normalise). P0 samples production keys so legacy images aren't
   silently omitted. Images first, `catalog.json` last, listing only images
   written; failures → omitted + warning; destroy S3 streams on disconnect.
6. Audit `catalog.export` (format, counts).

**Upload → PREPARING** — `POST /stores/:storeId/catalog/imports` (multipart
`file` only; flag-gated)

1. The D10 guard (before multer; rejected requests read no body).
2. Multer with a `diskStorage` whose destination is a per-process subdir of
   `IMPORT_TMP_DIR` (startup writability check; age-based cleanup at boot, never
   deleting another color's live files), mode 0600, unlinked on **every** error
   path (multer only cleans up its own errors).
   `limits.fileSize =
   MAX_ZIP_BYTES`; type by magic bytes (`PK\x03\x04` vs
   `{`); `.json` ≤ `MAX_JSON_BYTES`. 413/415.
3. Short locked tx: re-check no active import and the hourly count; insert
   `PREPARING` (`lastBeatAt = now()`, `expiresAt = now+1h`); respond **202**
   `{id}`. Prepare continues in-process; a 30 s timer updates `lastBeatAt` from
   the start (including semaphore wait); hard deadline 8 min.
4. Prepare: JSON → bounded parse + validate (yielding). ZIP → central-directory
   read of the temp file; stream-inflate each referenced entry once with
   abort-at-limit counting; sniff (`detectUploadMimeType`, JPEG/PNG only);
   header pixel dimensions ≤ 40 MP via a vetted tiny library (e.g. `image-size`;
   P0 checks ESM/maintenance); PUT to staging with explicit ContentType. Own-CDN
   sources are **not** HEADed at prepare (up to 40 000 refs); they are validated
   at run time and the preview says so. Write `plan.json`.
5. Preview: counts; duplicates vs live `storeId`-filtered products (D3,
   `matchedProductId`); in-file duplicate names (warning); categories/
   collections created vs found and collection **merges** (in `preview`);
   per-product image problems; currency mismatches; projected totals vs the
   ceilings. Existing-store category match: case-insensitive on NFC+trim; if
   several match, the oldest.
6. Locked tx: insert item rows; CAS `PREPARING → READY` (`expiresAt = now+24h`)
   **and** supersede the store's previous READY (only READY — if that import was
   already committed, the new READY simply coexists with the QUEUED/RUNNING one
   and its commit returns 409 until that finishes). If the CAS affects 0 rows
   (cancelled/swept meanwhile) the prepare deletes its own staging prefix. Any
   earlier failure → `terminate(FAILED, code)` (CAS) + staging delete. The temp
   file is removed in `finally`. A paused zombie that writes after a purge is
   cleaned by the lifecycle rule.

**Report / poll** — `GET …/imports/:id` (status, preview or totals, items
paginated ≤ 100; **no side effects**) and `GET …/imports` (last 20, powers
"resume"). Lookups use `findOwnedImport(importId, storeId, userId)`: 404 on any
mismatch including `import.storeId !== :storeId`.

**Commit** — `POST …/imports/:id/commit` `{ duplicates, currency }`: compute
duplicates with a read **before** the lock; then ONE short store-locked tx
(timeout 10 s): `READY` and `expiresAt > now()` (410 `IMPORT_EXPIRED` /
`IMPORT_SUPERSEDED`); no other `QUEUED|RUNNING` import (409); re-verify the
duplicate set cheaply and mark items `SKIPPED(DUPLICATE)` with one `UPDATE`;
re-check totals (422 with fresh totals); if no `PENDING` item remains → 422
`NOTHING_TO_IMPORT`; write `options` (`currency` omitted while the preview found
a mismatch → 422 `CURRENCY_CHOICE_REQUIRED`; supplied without a mismatch →
ignored); CAS `READY → QUEUED`. Then start the runner in-process; if the process
dies the sweep resumes it. Audit `catalog.import.commit`.

**Run** — `catalog-import-runner.service.ts`, flag-gated, one import at a time
per process. Started by commit and by the sweep (every 60 s) for rows
`status IN (QUEUED,RUNNING) AND (leaseUntil IS NULL OR leaseUntil < now()) AND leaseClaims < 3`.
When an import finishes the runner immediately looks for the next eligible row
instead of waiting for the next tick (the UI shows "queued"):

1. **Claim:** CAS → `RUNNING`, fresh random `leaseToken`,
   `leaseUntil =
   now()+90s`, `leaseClaims++`, `startedAt ??= now()`. Terminal
   or already- leased rows are left alone. If `cancelRequestedAt` is set →
   `terminate(
   CANCELLED)`.
2. **Reference pass** (once, while `refsResolvedAt IS NULL`; short locked tx
   that re-checks `refsResolvedAt IS NULL` and the lease token): create/find
   only refs **reachable from PENDING items** (so a fully skipped import creates
   nothing): categories by name path (case-insensitive NFC+trim match, oldest
   wins; created rows keep the file's casing) and collections by the compound
   `(storeId, slug)` key. A `P2002` (a concurrent seller-created non-root
   category or collection; `@@unique([storeId, slug])` is real) aborts the tx
   and re-runs find-or-create, up to 3 times. Root categories are not DB-unique
   (`parentId` NULL, G12), so a concurrent manual create yields a duplicate
   instead of a `P2002`; matching picks the oldest. Record
   `refMap[ref]
   = { id, created }`, `collectionBase` (current max position +
   1 when merging) and `refsResolvedAt` atomically. Accepted: created categories
   are publicly listed immediately (`findCategoriesPublic` has no product
   filter) even while products are DRAFT; a seller adding products to a merged
   collection mid-run can produce equal `position`s.
3. **Items** in `index` order, `PENDING` only; before each item (including the
   first after a takeover) run the fence update (D12: 0 rows → stop, this runner
   is a zombie), check `cancelRequestedAt`, . Then read `attempts`: a
   pre-increment value ≥ 3 → CAS `FAILED(ITEM_ERROR)` without running it;
   otherwise fenced-`attempts++` and run (breaks poison items, including ones
   that kill the process). A classified **infra stop or shutdown abort** is not
   a failed attempt: it decrements `attempts` in a fenced best-effort update and
   releases the lease (a hard kill leaves the increment, which is the point).
   Item deadline 20 s, enforced with an `AbortSignal` on every S3 call,
   HTTP-handler timeouts and a Prisma tx `timeout` (a `Promise.race` alone
   cancels nothing); on a genuine timeout → CAS `FAILED(ITEM_TIMEOUT)` + cleanup
   (an abort caused by shutdown is **not** a timeout; see D2). The 20 s deadline
   relies on the 90 s lease. a. Images **outside any tx**, to deterministic keys
   `products/imp-<importId>-<index>-<n>.<ext>` (variant: `…-v<k>`): staged
   object, or an `ownKey` that passes D8 and a 16-byte ranged GET sniff, →
   `CopyObject` with `MetadataDirective: REPLACE`, explicit ContentType and
   `imported-from=<importId>`. Source keys follow the strict export key rules.
   Overwrites are idempotent. Any problem → warning `IMAGE_UNAVAILABLE` (no
   oracle) and the product imports without that image. b. ONE `$transaction`
   with an explicit timeout: (i) fence (row-locking update); (ii) allocate the
   slug with `allocateProductSlug` (see below); (iii) create the product `DRAFT`
   (`storeId` from the import row; currency per option), variants via
   `createMany` **with `storeId` set** (no synthesised variant, mirroring
   `create`), `ProductCategory` from `refMap` (verify each id belongs to
   `import.storeId`, reusing the `assertCategoriesInStore` logic) and
   `CollectionProduct` rows at `collectionBase + idx` with
   `createMany({ skipDuplicates })`; (iv)
   `UPDATE
      item SET status='DONE', productId=… WHERE id=? AND storeId=? AND
      status='PENDING'`
   — 0 rows aborts and rolls back everything. Collection membership therefore
   lives in the product tx: no end-of-run attach pass. Skipped items add no
   memberships; reset `leaseClaims = 0` in the same tx. c. Failure: classify.
   **Infra** = connection/timeout only → stop the loop; the lease expires and
   the sweep resumes. Everything else is an item failure: in a small tx **fenced
   by the lease token**, CAS `PENDING → FAILED` (code, e.g. `ITEM_REF_MISSING`
   when a mapped category/collection was deleted mid-run, `SLUG_CONFLICT`,
   `ITEM_TIMEOUT`); **only if the CAS succeeds** delete that item's
   deterministic keys (best effort) and reset `leaseClaims`.
4. **Finalise** (no `PENDING` left; one fenced tx that also writes the
   `AuditLog` row `catalog.import.complete`, `actorId = createdById`, counts
   only): `terminate` with `COMPLETED` / `COMPLETED_WITH_ERRORS`. No
   `publishedProductCount` recount (everything is DRAFT). Staging is deleted
   immediately only if every item is DONE or SKIPPED(DUPLICATE).

**Interaction with the product slug work.**

- It adds `Product.slug` (nullable, then NOT NULL; `@@unique([storeId, slug])`)
  and `allocateProductSlug(client, storeId, name)` from
  `@biasmarket/utils/product-slug`; the schema has no `slug` today.
- Its retry loop wraps the **whole** `$transaction` and matches only the slug
  unique-violation predicate with a bounded attempt count.
- Import calls the allocator with `tx` and applies the **same predicate and
  attempt count**; a P2002 on another table (e.g. a `CollectionProduct` PK) is
  not a slug conflict. Ask the slug work to extract the retry into a shared
  helper so import doesn't copy it.
- Sequence: the slug work's Release 1 (nullable column + allocator) must be on
  `main` before P3b. Re-check the final signature then.

**Cancel** `POST …/cancel` (short locked tx): `PREPARING|READY` →
`terminate(CANCELLED)` + staging delete (an in-flight prepare notices at its
next heartbeat or step-6 CAS and removes what it wrote); `QUEUED` →
`terminate(CANCELLED)`, falling through to the RUNNING branch if the CAS finds 0
rows; `RUNNING` → set `cancelRequestedAt` (the runner stops between items; if
the runner is dead the sweep finalises it after lease expiry). Created products
and memberships stay (no undo in v1).

**Sweep** (interval 60 s; each duty ≤ 50 imports per tick; every transition a
CAS so overlapping colors are harmless): resume runnable imports (only when the
flag is on); `PREPARING` with `lastBeatAt` older than 5 min →
`terminate(FAILED, PREPARE_INTERRUPTED)` + staging delete; `READY` past
`expiresAt` → `terminate(EXPIRED)` + staging delete; `RUNNING` with
`leaseClaims ≥ 3` **and `leaseUntil < now()`** → `terminate(FAILED, RUN_ERROR)`;
terminal FAILED/CANCELLED/ COMPLETED_WITH_ERRORS imports whose lease has expired
(a NULL `leaseUntil` counts as expired) and `stagingDeletedAt IS NULL` → read
`plan.json` (if it is missing, because the import failed before it was written,
skip the purge and just delete staging), derive the deterministic keys of every
non-`DONE` item (both extensions, indexes parsed exactly so `imp-<id>-1-` never
matches `imp-<id>-10-`), `DeleteObjects` in batches of 1 000, then delete
staging and set `stagingDeletedAt` (no bucket listing needed); other terminal
imports with `stagingDeletedAt IS NULL` → delete staging; terminal imports older
than 30 days → delete rows in batches (items cascade). Logs carry
importId/storeId/counts/ durations only.

**Bulk publish** (P4) — `POST …/imports/:id/publish` `{ confirmNoImages? }`:
`findOwnedImport`; allowed while the import is COMPLETED, COMPLETED_WITH_ERRORS,
FAILED or CANCELLED (DONE items only), 409 while QUEUED/RUNNING, 404 once its
rows are purged; then select the import's `DONE` items' `productId`s joined to
products with
`storeId = import.storeId AND status = 'DRAFT' AND deletedAt IS
NULL` (a product
the seller edited or unpublished since is not touched); zero- image products are
skipped unless `confirmNoImages` is true. It does exactly what per-product
`publish` does (ownership + status update; P0 confirms there is nothing else)
and calls `recountPublishedProducts` **once** (exposed with an optional `tx`;
audit G17).

### Limits (constants in `packages/utils/src/catalog-bundle`, enforced on export and import)

| Constant                               | Value         | Notes                                                                                                                                |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `MAX_JSON_BYTES`                       | 24 MiB        | 1 000 × (5 000 CJK chars ≈ 15 KB + variants ≈ 6 KB)                                                                                  |
| `MAX_ZIP_BYTES`                        | 90 MiB        | below Cloudflare's ~100 MB; the effective image ceiling                                                                              |
| `MAX_UNCOMPRESSED_BYTES`               | 120 MiB       | sum across entries                                                                                                                   |
| `MAX_ZIP_ENTRIES`                      | 6 002         | 1 000 products × 6 product images + `catalog.json` + slack; more distinct entries → `ZIP_TOO_MANY_ENTRIES` (export refuses with 422) |
| `MAX_PRODUCTS`                         | 1 000         | file ceiling; import also requires live + incoming ≤ 1 000 (best-effort, D12)                                                        |
| `MAX_VARIANTS_PER_PRODUCT`             | 30            |                                                                                                                                      |
| `MAX_IMAGES_PER_PRODUCT`               | 6             | = existing `MAX_IMAGES` (move to a shared constant)                                                                                  |
| `MAX_IMAGE_REFS`                       | 40 000        | references incl. variants and duplicates; worst case is 1 000 × 36 = 36 000; over → `TOO_MANY_IMAGE_REFS`                            |
| `MAX_IMAGE_BYTES` / `MAX_IMAGE_PIXELS` | 5 MiB / 40 MP | existing / new                                                                                                                       |
| `MAX_CATEGORIES` / depth               | 500 / 5       | file ceiling                                                                                                                         |
| `MAX_COLLECTIONS`                      | 100           | file ceiling                                                                                                                         |

## Security and isolation criteria (each needs a test)

- Every endpoint starts with `assertOwnership`; import ids via `findOwnedImport`
  (404). Every query filters `storeId`. `ProductCategory`/`CollectionProduct`
  have no `storeId`, so isolation is via the parent relation and by verifying
  referenced ids belong to the store. User B cannot read/commit/cancel/publish
  A's import; a file naming another store's collection slug only merges into B's
  own `(storeId, slug)`.
- File content never supplies `id`, `storeId` or a product slug. The report
  echoes only labels and codes (never `source.storeName`/`storeSlug`).
- Strict S3 key rules for export reads and own-CDN copies; D8 ownership lookup;
  new storage helpers assert the prefix (`deleteImage` doesn't, A2.4).
- ZIP rules above; sniff + dimension cap on every image; extension and
  ContentType from the sniffed type.
- Fencing: a zombie runner cannot create a product after cancel/terminate or
  after its lease was taken — tested with injected delays, including `terminate`
  landing between the fence and the insert.
- CSRF matrix tested: cookie + good Origin (allowed), cookie + missing Origin,
  cookie + foreign Origin (rejected), bearer without Origin (allowed).
- Errors/warnings are codes + params; web owns the text. Logs/audit carry ids
  and counts only. Retention: staging deleted at terminal/TTL; import and item
  rows 30 days. Item `label` is a product name (not treated as PII; descriptions
  never leave staging).
- P5 fetcher (if built): `https`/443 only; DNS-resolve then connect to the
  validated IP; block loopback/private/link-local/CGNAT/ULA/multicast/
  metadata/Docker ranges and IPv4-mapped IPv6; ≤ 3 re-validated redirects; 10 s
  timeout; streamed 5 MiB cap; ≤ 4 concurrent; no cookies; fixed UA.
- HTTP vocabulary: 202; 404; 409 `IMPORT_IN_PROGRESS`; 410
  `IMPORT_EXPIRED|
  IMPORT_SUPERSEDED`; 413; 415; 422 `FILE_INVALID` (issues) |
  `EXPORT_EXCEEDS_LIMITS` | `JSON_TOO_LARGE` | `EXPORT_TOO_SLOW` |
  `NOTHING_TO_IMPORT`; 429; 503 `Retry-After`.
- DRAFT products appended to a live collection must not appear on any public
  surface. `StoresService` filters `status === 'PUBLISHED'` on the sections/
  collection path (~l.342), the orphan-products path (~l.362) and the second
  collection read (~l.436); add a regression test covering collection pages,
  product search, counts and the sitemap.

## Phases

P1, P2, P3a and P3b (flag off) are independently mergeable and deployable. No
phase relaxes the security criteria. Each ends green on `pnpm typecheck`,
`pnpm lint` and `pnpm --filter api test` (plus web where touched).

### P0. Verification (no code)

Gate items first: (a) public collection reads filter `PUBLISHED` on every
surface; (b) `FOR NO KEY UPDATE` on `Store` through `@prisma/adapter-pg`, with a
test that an order/product insert isn't blocked; (c) Cloudflare plan limits,
time-to-first-byte, and that large multipart uploads reach origin with
`Content-Length` (the guard rejects chunked); (d) real store image-byte totals
and production S3 key samples; (e) better-auth cookie attributes; (f)
event-loop/RSS measurement of a 24 MiB JSON prepare and a 1 000-product run, and
the API container's memory; (g) `deploy.sh` stop timeout vs item deadline. Then
the open checks below. Choose the libraries: central-directory ZIP reader over a
file, ESM streaming writer, image dimension reader. Record results in
`implementation-log.md`.

### P1. Format + JSON export

zod schema + issue codes (api); limits/normaliser/slug fallback
(`packages/utils`) with adversarial and fuzz tests;
`docs/core/catalog-import-export.md` (format, limits, example file) and a single
code catalog `catalog-bundle/codes.ts` (issue/warning/error codes, one
actionable sentence each) that the web key-parity test reads; export
service/controller (json); semaphore; audit; OpenAPI (add the tag to
`packages/types/orval.config.ts` `filters.tags`, run
`generate:swagger-metadata`, `generate:openapi`, types `generate`); download
stays raw `fetch`. Tests: service spec with a fake Prisma (every call has
`storeId`; parent-relation filter for join tables), controller ownership, e2e
(schema-valid output; B can't export A; soft-deleted excluded; over-limit store
carries warnings). Acceptance: nested categories, ordered collections and
variants round-trip into the schema; no ids/PII.

### P2. ZIP export + storage helpers

`getPublicObjectStream`, `copyPublicObject` (strict keys, explicit ContentType),
prefix-assertion helper; HEAD pre-check with the time budget; ZIP writer;
semaphore; `CATALOG_EXPORT_ZIP_ENABLED`; disconnect handling. Tests: key
fixtures (`..`, `%2e%2e`, `//`, `?`, leading dot, payment-bucket path, other
host), e2e on CI MinIO (exists, A2.7), worst-case memory/time run (up to 6 000
distinct images within the 90 MiB ceiling). Acceptance: opens in stock tools;
`catalog.json` last; references only written images.

### P3a. Import: schema, staging, upload, prepare, preview, cancel, report

Prisma + migration (ordered after the slug and pending `BuyerAccount`
migrations); env `CATALOG_IMPORT_ENABLED`, `S3_IMPORT_BUCKET`, `IMPORT_TMP_DIR`
(+ validation, `.env.example`s, compose/`minio-init` prod + dev,
`scripts/ci/minio-e2e.sh`, lifecycle rule, deploy docs);
`app.enableShutdownHooks()`; `ImportStagingService`; guard (incl. CSRF),
prepare, preview, cancel, report; cleanup-only sweep. Tests: validator + fuzz;
zip bomb, slip names, duplicate/ case-colliding names, overlapping entries,
encrypted, zip64, entry flood, oversize pixels, JSON bomb inside a zip; in-file
duplicates; two uploads/tabs → superseded; upload during RUNNING → 409; crash in
prepare (process killed → swept, nothing left in the catalog); tenant isolation;
Origin matrix; flag off. Acceptance: a ZIP and a JSON upload produce a correct
preview and nothing in the catalog changes.

### P3b. Import: commit, runner, sweep

Precondition: slug Release 1 on `main`. Commit, runner, fencing, lease, sweep
resume/orphan purge, shutdown release, `ProductsService` exposure of
`MAX_IMAGES`, `assertCategoriesInStore`, `recountPublishedProducts(tx?)`. Tests:
**concurrency** (simultaneous runners; commit vs cancel; supersede vs commit);
**crash injection** (after S3 copy, after tx, before finalise, after finalise
before staging delete, SIGTERM mid-item → exact counts, no duplicate products,
no deleted live images); fencing (zombie after cancel/takeover); poison item and
`leaseClaims` breaker; orphan derivation (index/prefix edge cases); D3
count-based duplicate skip across retries; one product with **6 product images +
30 variant images** finishes inside the 20 s deadline on MinIO; D8 ownership
(competitor's image URL → `IMAGE_UNAVAILABLE`); event-loop-lag check; e2e
round-trip on MinIO (export zip A → import fresh B; compare **normalised**
catalogs = ignore ids/ timestamps/slugs, images by byte hash and different
objects). Acceptance: upload → commit imports a ZIP and a JSON unattended;
killing the API mid-run and restarting finishes it. Enable the flag only after a
staging run of a ~300-product ZIP.

### P4. Web UI + bulk publish

`features/catalog-transfer/` per `apps/web/AGENTS.md`: `api/` on raw fetch (XHR
for upload progress; blob download with a client-built filename), `queries/`
(polling with backoff; "resume" via the list endpoint on page load; "taking
longer than expected" after a few minutes), `mutations/`, `components/`. Entry
points: a button in `products-header.tsx` **and** the empty-state CTA of a store
with no products (new stores come from the existing onboarding flow). Dialog:
Export tab (ZIP default; measured size and ceiling shown before download; JSON
explained as links-not-pictures), Import tab (drop → progress → paginated
preview with counts, warnings, duplicates with product links, merges, mandatory
currency choice on mismatch → confirm → progress → report listing failed items
with "fix and re-upload; products already created are skipped"). Notices: not
imported — orders, stock reservations, sales, store settings, payment methods,
theme, sections; categories become visible immediately; published products
appear in the default section at once and collection grouping appears after a
section is added; READY previews expire in 24 h (countdown; on expiry a plain
re-upload prompt). Bulk-publish step lists imported products without images
first and requires an explicit confirmation to publish them. ES + EN strings in
`packages/i18n/{en,es}/dashboard.json` keyed by code (params interpolated, never
concatenated; add a key-parity test; see `docs/core/i18n.md`). Tests: component
states; schema tests; bulk-publish service spec including user B and stale
products. Acceptance: export ZIP → new store → import → publish → live products
with images.

### P5. Foreign image URLs (optional)

`safe-remote-fetch.ts` per the criteria with an exhaustive IP-classifier test
and local-server/fake-resolver integration tests; WebP/AVIF→JPEG via `sharp` is
a separate decision (native dep, Docker image). Cross-environment JSON
round-trips and third-party files need this phase.

## Rollout

Merge P1 → P2 first (export only; no new env; immediate backup value). P3a ships
with the flag off (preview-only), then P3b; enable after the staging run.
`deploy.sh` hard-fails when `env/shared.env`'s checksum changes until
`state/shared_env.sha256` is hand-updated (A2.7): document that step.
`S3_IMPORT_BUCKET` is only read through the factory, so the old color keeps
booting. Create the bucket and lifecycle rule explicitly on the existing prod
MinIO (the inline `minio-init` only runs at compose-up). The runner lives in the
API, so a deploy needs no extra service: the new color's interval resumes any
import whose lease expired (immediately if the old color released it on
SIGTERM). Rollback: pulling the feature leaves already-created DRAFT products
and categories in place; they are traceable through the retained item rows (30
days) and `imported-from` object metadata. Runbook
`docs/core/catalog-import-runbook.md` (disable → in-flight imports wait; force-
fail; clean staging; find an import by id; disk monitoring via Uptime Kuma;
Redis is not involved).

## Tests

See each phase. Cross-cutting: adversarial/fuzz validator tests; service specs
with fake `PrismaService` (house style, `vitest.config.ts` alias); API e2e
(`test:e2e`, real `AppModule`, serial because of the better-auth rate limiter;
CI has MinIO); web jsdom tests; manual: ~300-product / 1 000-image ZIP on
staging watching memory, disk, event-loop lag and time.

## Docs to update when implementing

`docs/core/catalog-import-export.md` (format, limits, codes, example),
`docs/core/catalog-import-runbook.md`, `docs/core/deploy.md` and
`docs/core/infra.md` (new bucket/env/lifecycle), CLAUDE.md (module list,
`S3_IMPORT_BUCKET`), `apps/web/AGENTS.md`, `docs/core/product.md` if the story
is user-facing.

## Risks and mitigations

| Risk                                    | Mitigation                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SSRF                                    | Isolated fetcher, own optional phase, default deny                                                |
| Disk/memory exhaustion                  | Guard before multer, Content-Length + disk reserve, abort-at-limit inflate, pixel cap, semaphores |
| API event-loop starvation               | Yielding validation, streams, one import per process, P0 measurement, shutdown release            |
| Duplicate products on retry/overlap     | Row-locking lease fence + `WHERE status='PENDING'` CAS inside the product tx                      |
| Deleting a live product's images        | Cleanup only after our own fenced CAS-to-FAILED; terminal purge only after lease expiry           |
| Stuck imports                           | Lease expiry + sweep resume + poison breaker + `leaseClaims` limit                                |
| Lock contention on `Store`              | `FOR NO KEY UPDATE`, short txs, tested not to block order/product inserts                         |
| Orphan S3 objects                       | Deterministic keys, derive-and-delete purge before staging delete, lifecycle backstop             |
| Cross-tenant image copying              | D8 ownership lookup; uniform `IMAGE_UNAVAILABLE`; provenance metadata                             |
| Backup ceiling surprises sellers        | Shown before download; 422 instead of a bad file; P0 measures; follow-up lifts it                 |
| Image-less outcomes from foreign JSON   | Matrix + warnings; P5                                                                             |
| Mixed-currency stores                   | Mandatory explicit choice; P0 checks checkout                                                     |
| Public categories before products       | Documented notice; `refMap.created` supports a later undo                                         |
| Feature flag off with imports in flight | Cleanup-only sweep keeps running; runbook for force-fail                                          |

## Open checks (P0, after the gates)

1. ZIP/dimension library suitability and turbo/build impact of `zod` in api.
2. MinIO `CopyObject` across buckets with the API credentials/policy; lifecycle
   rule syntax for the pinned image; mc commands for `minio-e2e.sh`.
3. Checkout: needs ≥ 1 variant per product? single store currency?
4. `product-search.service.ts` Postgres-only; whether sitemap/ISR need
   revalidation after bulk publish (the recount stamps `contentStaleAt`);
   whether per-product `publish` enforces anything beyond ownership + status.
5. Writable temp-disk size in the API container and the `IMPORT_TMP_DIR`
   default.
6. Env/infra touchpoints complete (grep other `S3_*` enumerations incl. docs).
7. Provenance of `allocateProductSlug` on `main` and its final signature.

## Follow-ups

Chunked upload / multi-part export for image-heavy stores; undo import (uses
`refMap.created` and item `productId`s); store profile/payment/sections;
onboarding "start from a file"; upsert by external key; converters; plan quotas;
a real per-store product cap enforced in manual creation and a per-store storage
quota; a worker-based runner if API load becomes a problem; foreign URLs (P5) if
skipped; fix `CollectionsService.create` empty slug; admin lookup of an import
by id; JSON Schema generation for editor validation.
