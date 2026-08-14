# Sanity CMS blog — web integration

## Context

Company-level blog for `apps/web` (`/blog`, `/blog/[slug]`), content authored in
an external Sanity project (`n5geyqv5`, dataset `production`; the Studio is
deployed to Vercel from a separate repo). `web` reads published documents over
Sanity's CDN. Repo rules respected: pnpm-only, ESM-only, `web` never touches
Postgres.

## Already in repo (user-added)

- `apps/web/package.json`: `next-sanity@13.3.2`, `@sanity/image-url@2.1.1`
- `apps/web/client/sanity.ts`:
  `client = createClient({ projectId: "n5geyqv5", dataset: "production",
  apiVersion: "2026-08-13", useCdn: true })`
- `apps/web/client/sanity-queries.ts`: `POSTS_QUERY`, `POST_QUERY`
  (`defineQuery`)

## Verified facts

- Live `post` documents contain only: `title`, `slug.current`, `body`
  (portableText), `_createdAt`/`_updatedAt`. No `language`, `excerpt`,
  `coverImage`, `publishedAt`, `author` → locale-agnostic posts (same content
  on `/es/blog` and `/en/blog`); cards are text-only.
- `@sanity/client` (re-exported by `next-sanity`)
  `.fetch(query, params, { next: { tags, revalidate } })` → ISR + tag
  revalidation, no `cacheComponents` flag needed.
- `next-sanity` re-exports `@portabletext/react` → `PortableText` renders
  `body` with no extra dependency.
- `@sanity/image-url` v2 → `createImageUrlBuilder(client)` (not used yet — no
  images in the schema).
- Path alias `@/*` → `apps/web/*`, so `@/client/sanity` resolves.

## Decisions

- **Queries adjusted**: index drops the full `body` and adds a derived
  `excerpt` using the recommended Sanity pattern
  `array::join(string::split((pt::text(body)), "")[0..255], "") + "..."`;
  detail adds `_updatedAt`.
  The fetch layer still normalizes/trimmed output for card/meta copy, matching
  the current implementation in `apps/web/features/blog/server.ts`.
- **No schema additions** (`coverImage`/`excerpt`/`author`) — minimal
  implementation first.
- **Revalidation**: a webhook route handler in `apps/web` + `revalidateTag`.
- **Sitemap + route-handler test**: included.

## Implementation steps

### 1. Queries — `apps/web/client/sanity-queries.ts`

- `POSTS_QUERY`:
  `*[_type == "post"] | order(_createdAt desc) { _id, title, slug, _createdAt,
  "excerpt": array::join(string::split((pt::text(body)), "")[0..255], "") + "..." }`
- `POST_QUERY`:
  `*[_type == "post" && slug.current == $slug][0] { _id, title, slug, body,
  _createdAt, _updatedAt, "excerpt": array::join(string::split((pt::text(body)), "")[0..255], "") + "..." }`

  This follows the recommended Sanity excerpt pattern and keeps the query
  deterministic for the current Portable Text payloads.

### 2. Data layer — `apps/web/features/blog/server.ts`

- `getBlogPosts()` / `getBlogPost(slug)`: call `client.fetch(query, params, {
  next: { tags: ["blog"], revalidate: 300 } })`, wrapped in React `cache()` for
  per-render dedupe. Export the query-result types.
- Both fetchers normalize `excerpt` from the query value and then apply a final
  160-character whitespace-collapsed trim in TypeScript, because the current Sanity
  data shape and GROQ behavior make the runtime truncation more reliable than a
  single query-side slice for the existing Portable Text content.

### 3. Routes

- `apps/web/app/[locale]/(marketing)/blog/page.tsx` — card grid +
  `generateMetadata` from the `blog` i18n namespace.
- `apps/web/app/[locale]/(marketing)/blog/[slug]/page.tsx` —
  `generateStaticParams` from `getBlogPosts()`, `dynamicParams` default-true,
  `PortableText` body, `notFound()` on miss, `generateMetadata` (post title +
  excerpt).
- Both use the `params: Promise<{ locale }>` pattern (Next 16).

### 4. Components — `apps/web/features/blog/components/`

- `blog-card.tsx` (title, `publishedOn` date via `Intl.DateTimeFormat`,
  excerpt, link to `/blog/{slug}`), `blog-post-view.tsx` (article +
  `PortableText`), `index.ts` barrel. Landing/marketing styling.

### 5. i18n — `packages/i18n/{en,es}/blog.json` + `packages/i18n/index.ts`

- Keys: `meta.title`, `meta.description`, `title`, `subtitle`, `readMore`,
  `publishedOn`, `backToBlog`, `notFound`. Wire both locales into `messages`.

### 6. Surface links

- `features/landing/components/hero.tsx`: `blogCta` href `/search` → `/blog`.
- `components/marketing/navbar.tsx`: add `Blog` to the nav items +
  `packages/i18n/{en,es}/marketing.json` `navbar.links.blog`.

### 7. Revalidation

- `apps/web/app/api/blog/revalidate/route.ts` (POST): compare the
  `x-sanity-webhook-secret` header against `SANITY_REVALIDATE_SECRET` using a
  hash-based constant-time comparison (`createHash("sha256")` +
  `timingSafeEqual`), fail closed (401) when env is missing or the header
  mismatches, and on success call `revalidateTag("blog", { expire: 0 })` +
  `{ revalidated: true, now }`.
- Env: add `SANITY_REVALIDATE_SECRET` to `infra/docker/.env.example`
  (manual-entry, like `RESEND_API_KEY`). Configure the Sanity webhook in the
  Sanity console: URL `https://biasmarket.com/api/blog/revalidate`, secret set,
  triggers on `post` create/update/delete.

### 8. Sitemap — `apps/web/app/sitemap.ts`

- Add `/blog` to `STATIC_PATHS`.
- Fetch post slugs via Sanity in a `getBlogPostsForSitemap()` helper
  (try/catch → `[]`, mirroring `getStoreSlugs`); add per-locale entries with
  `_updatedAt` as `lastModified`.

### 9. Config — `apps/web/next.config.ts`

- `images.remotePatterns` += `{ protocol: "https", hostname: "cdn.sanity.io" }`
  (forward-looking; no images render yet).

### 10. Tests

- `apps/web/app/api/revalidate/route.test.ts` (vitest, `vi.mock("next/cache")`):
  missing header → 401; wrong secret → 401; env unset → 401; correct secret →
  200 + `revalidateTag("blog", { expire: 0 })`.

### 11. Verification

- `pnpm --filter web typecheck`, `pnpm --filter web lint`,
  `pnpm --filter web test`.
- Manual: `/es/blog` + `/en/blog` render the seeded posts; updating a post in
  the Studio fires the webhook and the live site reflects the change.

## Out of scope / deferred

`coverImage`/`excerpt`/`author` schema fields, draft/preview mode, per-store
blogs, cross-locale hreflang, env-driven `projectId`, and the `deploy.md`
runbook note (low-priority add-on).
