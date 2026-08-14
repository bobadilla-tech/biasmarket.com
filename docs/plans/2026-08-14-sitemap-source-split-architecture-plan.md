# Sitemap source split and paginated generation plan

**Date:** 2026-08-14\
**Scope:** `apps/web` sitemap routes and libraries, the API contract needed to
page public stores, Sanity sitemap queries, generated API artifacts, and tests.

## Outcome

Keep `https://biasmarket.com/sitemap.xml` as the only sitemap submitted in
`robots.txt`, but make it a real sitemap index whose entries are grouped by
source in their paths:

```text
/sitemap.xml                    sitemapindex
/sitemap-static-0.xml           urlset
/sitemap-stores-0.xml           urlset
/sitemap-stores-1.xml           urlset
/sitemap-blog-0.xml             urlset
/sitemap-blog-1.xml             urlset
```

Every child is generated from only the rows needed for that child. No route
should call a function equivalent to:

```ts
const entries = await getAllEntries();
const chunk = entries.slice(chunkId * CHUNK_SIZE, (chunkId + 1) * CHUNK_SIZE);
```

The chunk id must drive the backend query (`offset`/`limit` for stores and a
GROQ range for blog posts), then the small locale expansion at the boundary may
be trimmed in memory. Static pages remain a fixed source.

## Current implementation and confirmed deficiencies

- `apps/web/app/sitemap.xml/route.ts` currently lists flat URLs such as
  `/sitemap/0.xml` and calls `getChunkCount()`.
- `apps/web/app/sitemap/[id]/route.ts` calls `getAllEntries()` on every child
  request and slices the complete combined array after fetching all stores and
  all blog posts.
- `apps/web/lib/sitemap.ts` combines static pages, all public store slugs from
  `GET /api/stores/public`, and all Sanity posts into one array. Its
  `getChunkCount()` repeats the same full reads only to get `.length`.
- `apps/api/src/modules/stores/stores.service.ts:138` has an unpaginated
  `findAllPublic()` query. The endpoint returns a bare array from
  `stores.controller.ts:210`.
- `POSTS_SITEMAP_QUERY` in `apps/web/features/blog/lib/sanity-queries.ts:27` is
  unbounded.
- `apps/web/app/robots.ts` already points to the correct stable root URL and
  remains unchanged.
- `/[locale]/search` is a public utility/results page, not a stable
  informational resource. It is intentionally excluded from the sitemap and must
  receive `robots: { index: false, follow: true }` metadata in the same
  implementation so the exclusion is explicit rather than accidental.
- The custom route handlers are intentional. Next's sitemap metadata convention
  owns `/sitemap.xml` and generates `/.../sitemap/[id].xml`; this application
  needs to own the root index at exactly `/sitemap.xml`. Keep the hand-rolled
  route handlers and XML serializer, and verify the route layout with the
  installed Next 16 build.

## Sitemap protocol decision: no nested index in the root

The user-facing organization is by source, but the XML hierarchy must remain
valid for Google. Google Search Console explicitly reports a sitemap index that
lists another sitemap index as **“Nested sitemap indexes”** and says an index
may list sitemap files, not other index files. Google's current documentation
also limits one index to 50,000 `<loc>` entries and requires referenced files to
be on the same site and in the same or a deeper directory.

Therefore `/sitemap.xml` must list the source chunk **urlsets directly**. Do not
implement `/sitemap/stores.xml` or `/sitemap/blog.xml` as child indexes of the
root. The source registry is the logical second level: it groups and counts
`static`, `stores`, and `blog`, while the root-level filename makes that
grouping obvious to operators and reviewers.

The public child URLs intentionally stay at the site root
(`/sitemap-stores-0.xml`) instead of `/sitemap/stores/0.xml`. Google can reject
URLs that are higher than the directory containing a submitted sitemap.
Root-level child files avoid that scope ambiguity while still allowing the root
index to list every child. The implementation route can remain internal and
source-qualified at `/sitemap/[source]/[id].xml`; add explicit Next rewrites
from the three public filename patterns to that route and test the rewritten
URLs end to end.

This is not merely a preference: a root index → source index → urlset chain
would cause Google's nested-index error. If a separate source-level index is
desired for a future non-Google operational tool, it must not be linked from a
sitemap index and is out of this implementation.

References:

- [Google Search Console sitemap troubleshooting: nested sitemap indexes](https://support.google.com/webmasters/answer/7451001)
- [Google Search Central: sitemap index limits and location](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps)
- [Google Search Central: sitemap size limits](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

## Target architecture

```text
root index route
  └── registry: Promise.all(source.getChunkCount())
        ├── static source  -> /sitemap-static-{id}.xml
        ├── stores source  -> /sitemap-stores-{id}.xml
        └── blog source    -> /sitemap-blog-{id}.xml

chunk route /sitemap/[source]/[id].xml
  ├── validate source and strict numeric id
  ├── dispatch valid source/id without caching status failures
  ├── let mutable sources detect a stale count and return retryable 503
  └── source.getChunk(id)
        ├── query only the entity window for this URL window
        ├── expand those entities across configured locales
        └── trim only boundary overflow caused by locale fan-out
```

The root index should enumerate sources in registry order (`static`, `stores`,
`blog`) and chunks from `0` through `count - 1`. Sources with zero URLs emit no
child entry. The root index itself must never contain a `<url>` element.

Keep one `CHUNK_SIZE` constant. It is a maximum of 50,000 URLs, not a promise
that every generated XML file will be below Google's separate 50 MB uncompressed
limit. Add a serialized-byte-size assertion to tests; if realistic slugs,
alternate links, or future sources approach 50 MB, lower the constant before
shipping rather than relying on the URL-count limit alone.

## Shared sitemap library

Replace `apps/web/lib/sitemap.ts` with a directory:

```text
apps/web/lib/sitemap/
  types.ts
  constants.ts
  urls.ts
  xml.ts
  chunk-range.ts
  static-source.ts
  stores-source.ts
  blog-source.ts
  registry.ts
```

### `types.ts`

Define a source contract with a count that may be zero:

```ts
export interface SitemapSource {
  id: string;
  getChunkCount(): Promise<number>; // integer >= 0
  getChunk(chunkId: number): Promise<MetadataRoute.Sitemap>;
}
```

The source owns its backend query and URL mapping. The route owns only
validation, dispatch, and serialization. A source count or page-fetch error must
be reported with `reportServerError` and surfaced as a retryable sitemap failure
(HTTP 503 with `Retry-After`, not a successful-looking empty source). This
prevents a transient API/Sanity outage from causing Google to replace known URLs
with an empty sitemap. Add logging/monitoring context that includes the source
and chunk id. The root index should return 503 if any registered source count
cannot be trusted.

503 responses must also include `Cache-Control: no-store`; the dynamic route
configuration is the primary protection, and this header is the defense in depth
that prevents an intermediary from retaining a transient failure.

### `constants.ts`, `urls.ts`, and `xml.ts`

- Move `CHUNK_SIZE = 50000` to `constants.ts`.
- Add `MAX_SITEMAP_BYTES = 50_000_000` and a UTF-8 byte-count guard. The
  serializer or route must reject a generated child/index XML document that
  exceeds this limit with the same controlled 503/configuration error used for
  other invalid sitemap output; a test-only assertion is not sufficient.
- Move `localizedUrl`, `alternates`, and the static path list to small shared
  helpers. Include every currently public marketing page: `""`, `/blog`,
  `/founder`, `/enterprise`, `/contact`, `/for-sellers`, and `/stores`. Preserve
  locale order, URL shapes, `changeFrequency`, priorities, and
  alternate-language output. Do not emit a store `<lastmod>` from `createdAt`:
  the Store model has no `updatedAt`, so creation time is not a truthful
  last-modified signal. Blog posts may continue to use `_updatedAt`.
- Move `escapeXml` and `serializeSitemapXml` from the old module without
  changing their existing field behavior.
- Add `serializeSitemapIndexXml(urls: string[])`, escaping every `<loc>` and
  emitting the XML declaration, sitemap namespace, one `<sitemap>` per URL, and
  no empty/relative locations. Check both the child URL count and the serialized
  UTF-8 byte length before returning either XML document.
- Return `Content-Type: application/xml; charset=utf-8` from both route types.

### `chunk-range.ts`

The current sitemap emits one URL per locale for each entity. Given an entity
locale fan-out `L`, map a URL-space chunk to a bounded entity query:

```ts
export function chunkEntityRange(
  chunkId: number,
  chunkSize: number,
  localeCount: number,
) {
  const urlStart = chunkId * chunkSize;
  const urlEnd = urlStart + chunkSize;
  const entityOffset = Math.floor(urlStart / localeCount);
  const entityLimit = Math.ceil(urlEnd / localeCount) - entityOffset;
  return {
    entityOffset,
    entityLimit,
    sliceStart: urlStart - entityOffset * localeCount,
    sliceEnd: urlEnd - entityOffset * localeCount,
  };
}
```

Validate `localeCount > 0` and a non-negative integer chunk id. The function
must be pure and tested for both evenly and unevenly aligned boundaries. It is
acceptable for a page query to fetch the one entity that straddles each edge; it
is not acceptable for it to fetch the full source.

## Source implementations

### Static source

`static-source.ts` has no I/O. Its count is
`STATIC_PATHS.length * routing.locales.length`, so it returns one chunk today
and can return more if the fixed set ever grows. `getChunk` rejects any id
outside its computed range and returns the same metadata as the current static
entries.

### Stores source and API contract

Do **not** change the existing `GET /stores/public` bare-array response. It is a
public API and may have consumers outside this repository even though the
current in-repo search found only the old sitemap caller. Preserve it for
compatibility.

Add sitemap-specific **internal** endpoints instead; these are not a new
unauthenticated public API:

- `GET /stores/internal/sitemap/count` → `{ total: number }`
- `GET /stores/internal/sitemap?limit={n}&offset={n}` →
  `{ items: [{ slug }], total: number }`

The count endpoint runs only
`prisma.store.count({ where: { isPublic: true } })`. The page endpoint runs
`findMany` and `count` in parallel with the same filter. Use a deterministic
order:

```ts
orderBy: [{ createdAt: "asc" }, { id: "asc" }];
```

Keep the response DTO minimal. Add DTOs for the count and page envelope rather
than repurposing `PublicStoreListingResponseDto`. Add a dedicated parser (for
example `parseSitemapPagination`) with explicit bounds: `offset` is a safe
non-negative integer, `limit` is a positive integer, and `limit <= 50_000`. Do
not reuse the product/search parser’s max limit of 50; sitemap pages need to
fetch up to the URL cap when there is one locale. Require an internal sitemap
token (for example `X-Internal-Sitemap-Token`, backed by a dedicated API/web
secret) and use the repository-supported throttling guard on both endpoints.
Requests without the token fail before Prisma is called. Keep the offset a safe
non-negative integer and reject values above the configured operational maximum;
if the site outgrows that maximum, move the endpoint to keyset pagination rather
than making an unauthenticated deep scan possible. Store the token in dedicated
deployment secrets (for example `SITEMAP_INTERNAL_TOKEN` in both apps), send it
only from the server-side web fetch, and never expose it through browser code or
generated client defaults. Implement this concretely with
`SitemapInternalTokenGuard`, `@Public()` plus
`@UseGuards(SitemapInternalTokenGuard, ThrottlerGuard)` on both endpoints,
`ThrottlerModule.forRoot(...)` in `StoresModule`, and an explicit
`@Throttle(...)` policy. Add `SITEMAP_INTERNAL_TOKEN` to API boot-time env
validation so a deployment cannot silently expose an unguarded endpoint.

Declare the internal routes before any generic route if ordering requires it,
and add `@ApiQuery`/response metadata so the generated OpenAPI contract
describes both endpoints. Use separate DTO classes for the sitemap item
(`slug`), page envelope (`items`, `total`), and count envelope (`total`); never
reuse the legacy `PublicStoreListingResponseDto` for the new page.

`stores-source.ts` should:

1. Get `total` from the count endpoint and return
   `Math.ceil(total * localeCount / CHUNK_SIZE)` or `0`.
2. Convert `chunkEntityRange` to `limit`/`offset`.
3. Fetch only that page from the sitemap page endpoint.
4. Expand each returned row across locales with the existing store URL metadata,
   without `lastModified`, then apply `sliceStart`/`sliceEnd`.

Both store count and page fetches must use the same one-hour Next data-cache
policy and a source tag such as `sitemap:stores`; include `limit` and `offset`
in the page URL so each page is cached independently. A non-2xx response,
invalid envelope, or missing API base URL is a source failure and must become
the route's 503 response after reporting it, not `[]`.

There is currently no API-to-web mutation hook for store creation, deletion, or
`isPublic` changes. The `sitemap:stores` tag is useful cache metadata but must
not be described as mutation-time invalidation; hourly revalidation is the
freshness guarantee in this plan. Adding a signed API-to-web revalidation hook
is a separate optimization if faster store discovery becomes important.

Add/verify a composite database index for the query, for example
`@@index([isPublic, createdAt, id])` on `Store`. This index is confirmed absent
and is mandatory: add migration `20260814120000_add_public_sitemap_order_index`,
run `prisma generate`, and verify
`prisma migrate status`/`prisma migrate deploy` in the deployment check.
Benchmark count and deep-offset page reads at a realistic store volume before
choosing to raise the configured operational offset maximum.

The route handler may keep a small typed server-side `fetch` helper for these
internal sitemap endpoints. Do not force the generated browser-oriented client
into this migration unless its generated query parameters and server runtime
behavior are verified; using it is not worth adding module-load failure or
credentials surprises to the SEO path. If the generated client is used, add the
generated endpoint and an explicit Route Handler test first.

### Blog source and Sanity queries

Replace the unbounded `POSTS_SITEMAP_QUERY` with paired count/page queries that
use the same filter and stable order:

```ts
export const POSTS_SITEMAP_COUNT_QUERY = defineQuery(`
  count(*[_type == "post" && defined(slug.current)])
`);

export const POSTS_SITEMAP_PAGE_QUERY = defineQuery(`
  *[_type == "post" && defined(slug.current)]
    | order(_createdAt asc, _id asc) [$start...$end] {
      slug,
      _updatedAt
    }
`);
```

Use Sanity’s server-side range parameters `$start` and `$end`; never fetch the
whole post list and slice it in JavaScript. This reduces response payload and
application memory; GROQ offset pagination may still scan/sort through the
requested end position, so it is sufficient for the current small/weekly blog
volume but should move to keyset pagination if the blog becomes large. The page
source applies the same `chunkEntityRange`/locale-expansion logic as stores.
Keep the existing `blog` cache tag and hourly revalidation on **both** count and
page queries. The count and page query must use identical filters and ordering
assumptions so their chunk boundaries agree.

## Routes

### Root index: `apps/web/app/sitemap.xml/route.ts`

Run all source counts in parallel, flatten the resulting source/chunk pairs, and
pass absolute URLs such as `${SITE_URL}/sitemap-stores-0.xml` to
`serializeSitemapIndexXml`.

Guard the Google limit: if the number of child sitemap files exceeds 50,000,
report a high-severity configuration/data error and return a controlled server
error rather than emitting an invalid index. This is not expected at current
scale, but the invariant belongs at the root boundary.

Use `dynamic = "force-dynamic"` for the route handler. Do not ISR-cache the HTTP
status/body: a transient source failure must not cache a 503 for an hour. Cache
only the underlying count/page fetches with one-hour data-cache options, using
the same URL/key for a source's count wherever it is read and source tags
(`sitemap:stores` and `blog`) on page/count reads. The root and child data
caches remain independent: a store/post mutation during a crawl can make offset
pages temporarily disagree or make a just-created final chunk appear on the next
root refresh. This is an explicit eventual-consistency boundary, not a
transactional snapshot. Stable unique ordering, shared cache keys, hourly
revalidation, and the existing Sanity webhook bound the window. If strict
snapshot completeness becomes a requirement, follow up with a persisted
generation manifest or keyset/cursor design; do not pretend offset pagination is
transactional.

### Child route: `apps/web/app/sitemap/[source]/[id]/route.ts`

Delete `apps/web/app/sitemap/[id]/route.ts` after the replacement is live.
Resolve `params` as a promise (the installed Next version is 16), require the id
to match `^(0|[1-9][0-9]*)\.xml$`, parse it as a safe integer, look up the
source id in the registry, and 404 only for an unknown source or malformed
identifier. Export `dynamic = "force-dynamic"` here too. Do not cache status
responses from this route. Do not coerce values like `-1.xml`, `01.xml`,
`1.0.xml`, `+1.xml`, whitespace, or huge integers into valid chunks. Call only
the selected source’s `getChunk`, then serialize its urlset. If a mutable source
sees that a valid chunk id is past its current cached count, return 503 with
`Retry-After` as a stale-chunk condition, not 404. Unknown route params must not
trigger any backend query.

Add `rewrites()` in `apps/web/next.config.ts` with these exact mappings:

```text
/sitemap-static-:id.xml  -> /sitemap/static/:id.xml
/sitemap-stores-:id.xml  -> /sitemap/stores/:id.xml
/sitemap-blog-:id.xml    -> /sitemap/blog/:id.xml
```

The source patterns must preserve the literal `.xml` suffix under Next's path
matcher. The public root-level URL is the canonical URL used in the index; the
nested implementation route must not be emitted as a `<loc>`. Verify a public
request reaches the route with `id = "0.xml"`, returns 200 XML, and does not
redirect. The existing `proxy.ts` matcher excludes dotted `.xml` paths and must
remain that way.

## Compatibility and migration

- `/sitemap.xml` remains stable and remains the sole `robots.txt` sitemap.
- Old `/sitemap/{id}.xml` URLs stop being enumerated. They are implementation
  files, not page URLs; no redirect is required, but verify that no external
  automation submits them independently. If preserving them is operationally
  important, add a temporary 410/redirect decision explicitly rather than
  leaving an ambiguous route collision.
- `GET /stores/public` remains backward-compatible. New sitemap endpoints and
  generated artifacts are additive.
- The public child filename is source-qualified, so stores/blog/static
  boundaries can change independently without re-slicing one global array.
- Keep the old `apps/web/app/sitemap/[id]/route.ts` for one deployment/crawl
  window as a narrow `410 Gone` handler for old numeric chunk URLs, with a short
  cache policy. Remove it after the agreed retention window and verify no
  external submission still references those URLs; it must not overlap the new
  source-qualified route.

## Files to add/change/remove

Add:

- `apps/web/lib/sitemap/{types,constants,urls,xml,chunk-range}.ts`
- `apps/web/lib/sitemap/{static-source,stores-source,blog-source,registry}.ts`
- API DTOs for sitemap count/page responses
- API pagination parser and unit tests
- `apps/api/src/modules/stores/sitemap-internal-token.guard.ts`
- `apps/web/app/sitemap/[source]/[id]/route.ts`
- web unit/route tests for range math, XML, registry dispatch, and source
  boundaries

Change:

- `apps/web/app/sitemap.xml/route.ts`
- `apps/web/next.config.ts` (public root-level child rewrites)
- `apps/web/app/[locale]/search/page.tsx` (explicit noindex metadata)
- `apps/web/features/blog/lib/sanity-queries.ts`
- `apps/api/src/modules/stores/stores.controller.ts`
- `apps/api/src/modules/stores/stores.module.ts` (throttler registration)
- `apps/api/src/modules/stores/stores.service.ts`
- `apps/api/src/config/env.validation.ts` (required internal token)
- API/web deployment configuration for the shared internal sitemap token
- `packages/db/prisma/schema.prisma` and the mandatory
  `20260814120000_add_public_sitemap_order_index` migration
- `apps/api/test/stores.e2e-spec.ts` and relevant API unit tests
- `apps/api/openapi.json` and `packages/types/generated/**` through the normal
  generation commands; never hand-edit generated output

Remove after references are gone:

- `apps/web/app/sitemap/[id]/route.ts`
- `apps/web/lib/sitemap.ts`
- the old unbounded `POSTS_SITEMAP_QUERY`

Before deleting the old module, run `rg` across the repository for every
exported symbol (`getAllEntries`, `getChunkCount`, `serializeSitemapXml`, and
`CHUNK_SIZE`), not only the two currently known routes.

## Tests and verification

### High-value automated tests

- `chunkEntityRange`: zero chunk, evenly dividing locales, uneven locale counts,
  boundary in the middle of an entity, and invalid inputs.
- A fake source with a fixed entity list: concatenating all generated chunks
  must exactly equal the old flat-map-then-slice sequence, including the final
  partial chunk.
- XML serializer: escaped locations, XML declaration, namespaces, alternates, no
  more than 50,000 URLs per child, and runtime rejection of UTF-8 output over 50
  MB for both urlsets and indexes.
- Registry/root index: all source counts run, zero-count sources are omitted,
  source order is stable, URLs are absolute and source-qualified, and the
  50,000-child-index guard is enforced.
- Child route: static/stores/blog success through the public rewrites, unknown
  source 404, malformed ids 404, negative/leading-zero/unsafe ids 404, and
  fixed-static out-of-range 404. A mutable-source stale/out-of-range chunk
  returns 503 with `Retry-After`, never a cached 404.
- Exact child status matrix: unknown source or malformed id → 404; fixed static
  source past its fixed count → 404; mutable stores/blog source past a newer
  count than the root index → 503 with `Retry-After` and
  `Cache-Control: no-store`. A valid current chunk always returns 200 XML.
- Stores source: requested page offset/limit matches the computed range; count
  uses the count endpoint; errors are reported and do not fetch an unbounded
  list.
- Sanity source: count/page filters and range parameters match, only the
  requested page is expanded, and both queries carry the `blog` tag and hourly
  revalidation.
- API e2e: legacy `/stores/public` remains an array; sitemap count/page
  endpoints return their envelopes; missing/invalid internal token is rejected
  before Prisma; empty, first-page, last-page, invalid limit, invalid offset,
  over-limit offset, rate limiting, and stable tie ordering are covered.
- Failure behavior: a root count failure and a child page failure both return
  503 with the chosen `Retry-After` value, report the source/chunk error, and do
  not return/cache empty XML.
- Search metadata test: every locale variant of `/search` returns
  `robots: { index: false, follow: true }` and is absent from the static source.

### Commands/manual checks

Run the repository’s normal generation and checks in this order:

```text
pnpm --filter api generate:openapi
pnpm --filter @biasmarket/types generate
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm --filter api test:e2e
pnpm --filter web test
pnpm --filter web build
```

Then run the app and inspect:

```text
/sitemap.xml
/sitemap-static-0.xml
/sitemap-stores-0.xml
/sitemap-blog-0.xml
```

Validate the XML with an XML parser/sitemap validator, check response headers,
check that no child has more than 50,000 `<url>` elements, and request an
unknown source plus malformed and past-end chunks to confirm the documented
status matrix: fixed static past-end is 404, mutable stale past-end is 503 with
`Retry-After`/`no-store`. Verify that `/robots.txt` still advertises exactly the
root index.

## Rollout order

1. Add the API sitemap-specific DTOs, parser, service queries, controller
   routes, tests, and generated OpenAPI/types. Add the composite DB index and
   migration first if needed. Preserve `/stores/public`.
2. Add the web source library and tests, including the Sanity count/page query.
3. Add the root index, public root-level rewrites, and source-qualified child
   route; delete the old flat child route/module only after repository-wide
   reference checks pass.
4. Run typecheck/tests/build and manual XML checks. Deploy and monitor root,
   count, and child-route errors for at least one hourly revalidation cycle.

## Review record

The plan is not implementation-complete until each review round records all
findings as **HIGH**, **MEDIUM**, or **LOW**, resolves every HIGH/MEDIUM item,
and confirms any remaining LOW item is consciously accepted. Reviewers should
specifically re-check:

- nested-index validity against current Google guidance;
- API compatibility and route ordering;
- count/page filter and ordering parity;
- locale boundary arithmetic;
- Next 16 route parameter and route-collision behavior;
- cache inconsistency and backend failure behavior;
- 50,000 URL and 50 MB sitemap limits.

### Completed review rounds

1. **Initial repository/protocol review — HIGH:** child URL directory scope,
   breaking `/stores/public` response, unstable blog ordering. **Resolved:**
   root-level public child filenames plus rewrites, additive internal API
   endpoints, and `_createdAt`/`_id` ordering.
2. **Architecture/API review — MEDIUM:** 50 MB enforcement, missing public
   marketing routes, inaccurate store `lastmod`, missing store index, cache
   consistency, and source failure behavior. **Resolved:** runtime UTF-8 byte
   guards, complete static-page decision, store `lastmod` removal, mandatory
   Prisma index migration, explicit eventual-consistency boundary, and 503
   `no-store` failures.
3. **Operational security/rewrite review — HIGH:** unauthenticated deep-offset
   sitemap API. **Resolved:** internal token guard, boot-time secret validation,
   throttling, and bounded offsets. **MEDIUM:** incomplete DTO, status,
   migration, and search metadata requirements. **Resolved:** separate DTOs,
   exact status matrix, unconditional migration, and noindex test.
4. **Final audit:** no HIGH, MEDIUM, or LOW findings were reported after the
   final cache, status, security, and test-plan corrections.
