# Sanity CMS blog — web integration

## Context

Company-level blog for `apps/web` (`/blog`, `/blog/[slug]`), content authored in
a Sanity project (`n5geyqv5`, dataset `production`). The Studio lives in this
monorepo at `apps/sanity` (`sanity.config.ts`, `schemaTypes/{index,posts}.ts`).
`web` reads published documents over Sanity's CDN. Repo rules respected:
pnpm-only, ESM-only, `web` never touches Postgres.

## Implemented

- `apps/web/package.json` deps: `next-sanity@13.3.2`, `@sanity/image-url@2.1.1`,
  `@sanity/webhook@4.0.4`
- `apps/web/features/blog/lib/sanity.ts`:
  `client = createClient({ projectId, dataset, apiVersion: "2026-08-13",
  useCdn: true })`;
  `null` when `NEXT_PUBLIC_SANITY_PROJECT_ID`/`DATASET` are missing.
- `apps/web/features/blog/lib/sanity-queries.ts`: `POSTS_QUERY`, `POST_QUERY`,
  `POSTS_SITEMAP_QUERY` (`defineQuery`).
- `apps/web/features/blog/schemas/post.schema.ts`: Zod schemas
  (`blogPostSummarySchema`, `blogPostSchema`) + `z.infer` types; validates
  fetched docs at the data boundary (rejects missing `slug.current`/`body`).
- `apps/web/features/blog/server.ts`: `getBlogPosts()` / `getBlogPost(slug)`
  with React `cache()`,
  `client.fetch(query, params, { next: { tags: ["blog"],
  revalidate: 300 } })`,
  Zod `safeParse`, and `[]`/`null` fallbacks on error or validation failure.
- `apps/web/features/blog/format-date.ts`, `components/blog-list-item.tsx`
  (`BlogListItem`), `components/blog-post-view.tsx` (`BlogPostView`),
  `components/index.ts` barrel.
- Routes:
  - `apps/web/app/[locale]/(marketing)/blog/page.tsx` — `BlogIndexPage` card
    list + `generateMetadata` from the `blog.meta` i18n namespace;
    `params:
    Promise<{ locale }>` (Next 16).
  - `apps/web/app/[locale]/(marketing)/blog/[slug]/page.tsx` —
    `generateStaticParams` from `getBlogPosts()`, `dynamicParams` default-true,
    `PortableText` body, `notFound()` on miss, `generateMetadata` (post title +
    excerpt).
- i18n — `packages/i18n/{en,es}/blog.json` wired into `packages/i18n/index.ts`:
  `meta.title`, `meta.description`, `title`, `subtitle`, `readMore`,
  `publishedOn`, `backToBlog`, `notFound`, `empty`.
- Surface links:
  - `components/marketing/navbar.tsx`: `blog` nav item +
    `packages/i18n/{en,es}/marketing.json` `navbar.links.blog`.
  - `features/landing/components/hero.tsx`: blog card linking to `/blog` via
    `landing` i18n `blogTitle`/`blogSubtitle`/`blogCta`.
- Revalidation — `apps/web/app/api/blog/revalidate/route.ts` (POST): uses
  `parseBody(request, secret, false)` from `next-sanity/webhook`, requires
  `isValidSignature === true` (Sanity HMAC `sanity-webhook-signature` header),
  fail closed (401) when `SANITY_REVALIDATE_SECRET` env is missing or the
  signature is invalid, and on success calls
  `revalidateTag("blog", { expire: 0 })` + `{ revalidated: true, now }`.
- Sitemap — `apps/web/app/sitemap.ts`: `/blog` in `STATIC_PATHS`,
  `getBlogPostSlugs()` helper (try/catch → `[]`, mirroring `getStoreSlugs`),
  per-locale blog entries with `_updatedAt` as `lastModified`.
- Config — `apps/web/next.config.ts`: `images.remotePatterns` includes
  `{ protocol: "https", hostname: "cdn.sanity.io" }`.

## Verified facts

- Live `post` documents contain only: `title`, `slug.current`, `body`
  (portableText), `_createdAt`/`_updatedAt`. No `language`, `excerpt`,
  `coverImage`, `publishedAt`, `author` → locale-agnostic posts (same content on
  `/es/blog` and `/en/blog`); cards are text-only.
- `@sanity/client` (re-exported by `next-sanity`)
  `.fetch(query, params, { next: { tags, revalidate } })` → ISR + tag
  revalidation.
- `next-sanity` re-exports `@portabletext/react` → `PortableText` renders `body`
  with no extra dependency.
- `@sanity/image-url` v2 → `createImageUrlBuilder(client)` (not used yet — no
  images in the schema).
- Path alias `@/*` → `apps/web/*`, so `@/features/blog/...` resolves.
- Sanity Studio (`apps/sanity`) schema requires `title` and `slug`
  (`Rule.required()`); `body` is an array of `block`.

## Decisions

- **Queries**: index drops the full `body` and adds a derived `excerpt` using
  the Sanity pattern
  `array::join(string::split((pt::text(body)), "")[0..255],
  "")`; detail adds
  `_updatedAt`. No runtime excerpt trim in the fetch layer — the query-side
  slice is authoritative.
- **Data boundary validation**: fetched documents are validated with Zod
  (`features/blog/schemas/post.schema.ts`) before returning, so a malformed post
  (missing `slug.current` or `body`) can't crash
  `BlogListItem`/`generateStaticParams`/`PortableText`. Validation failures
  degrade to `[]`/`null`, matching the fetch-error posture.
- **No schema additions** (`coverImage`/`excerpt`/`author`) — minimal
  implementation first.
- **Revalidation**: Sanity webhook route handler + `revalidateTag`, using the
  canonical `next-sanity/webhook` `parseBody` signature check.
- **Sitemap + route-handler test**: included.

## Implementation steps

### 1. Queries — `apps/web/features/blog/lib/sanity-queries.ts`

- `POSTS_QUERY`:
  `*[_type == "post"] | order(_createdAt desc) { _id, title, slug, _createdAt,
  "excerpt": array::join(string::split((pt::text(body)), "")[0..255], "") }`
- `POST_QUERY`:
  `*[_type == "post" && slug.current == $slug][0] { _id, title, slug, body,
  _createdAt, _updatedAt, "excerpt": array::join(string::split((pt::text(body)),
  "")[0..255], "") }`
- `POSTS_SITEMAP_QUERY`: `*[_type == "post"] { slug, _updatedAt }`

### 2. Data layer — `apps/web/features/blog/`

- `schemas/post.schema.ts`: `blogPostSummarySchema`, `blogPostSchema`
  (`blogPostSchema` extends the summary with required `body` + `_updatedAt`);
  `BlogPostSummary`/`BlogPost` types via `z.infer`.
- `server.ts`: `getBlogPosts()` / `getBlogPost(slug)` wrapped in React
  `cache()`, `client.fetch(..., { next: { tags: ["blog"], revalidate: 300 } })`,
  `safeParse` results, `[]`/`null` fallbacks. Types re-exported for consumers.
- `schemas/post.schema.test.ts`: accept/reject cases (missing slug, empty slug
  `current`, missing body).

### 3. Routes

- `apps/web/app/[locale]/(marketing)/blog/page.tsx` — card grid +
  `generateMetadata` from the `blog` i18n namespace.
- `apps/web/app/[locale]/(marketing)/blog/[slug]/page.tsx` —
  `generateStaticParams` from `getBlogPosts()`, `dynamicParams` default-true,
  `PortableText` body, `notFound()` on miss, `generateMetadata` (post title +
  excerpt).
- Both use the `params: Promise<{ locale }>` pattern (Next 16).

### 4. Components — `apps/web/features/blog/components/`

- `blog-list-item.tsx` (`BlogListItem`: title, published date, excerpt, link to
  `/blog/{slug}`), `blog-post-view.tsx` (`BlogPostView`: article +
  `PortableText`), `index.ts` barrel. Landing/marketing styling.

### 5. i18n — `packages/i18n/{en,es}/blog.json` + `packages/i18n/index.ts`

- Keys: `meta.title`, `meta.description`, `title`, `subtitle`, `readMore`,
  `publishedOn`, `backToBlog`, `notFound`, `empty`. Wired into `messages`.

### 6. Surface links

- `features/landing/components/hero.tsx`: blog card `href="/blog"` + `landing`
  i18n `blogTitle`/`blogSubtitle`/`blogCta`.
- `components/marketing/navbar.tsx`: `blog` nav item +
  `packages/i18n/{en,es}/marketing.json` `navbar.links.blog`.

### 7. Revalidation

- `apps/web/app/api/blog/revalidate/route.ts` (POST):
  `parseBody(request,
  secret, false)` from `next-sanity/webhook`; 401 when env
  missing or `isValidSignature !== true`; on success
  `revalidateTag("blog", { expire: 0 })`
  - `{ revalidated: true, now }`.
- Env: `SANITY_REVALIDATE_SECRET` (manual-entry, like `RESEND_API_KEY`).
  Configure the Sanity webhook in the Sanity console: URL
  `https://biasmarket.com/api/blog/revalidate`, secret set, triggers on `post`
  create/update/delete.

### 8. Sitemap — `apps/web/app/sitemap.ts`

- `/blog` in `STATIC_PATHS`.
- `getBlogPostSlugs()` helper fetches `{ slug, _updatedAt }` via
  `POSTS_SITEMAP_QUERY` (try/catch → `[]`, mirroring `getStoreSlugs`); adds
  per-locale entries with `_updatedAt` as `lastModified`.

### 9. Config — `apps/web/next.config.ts`

- `images.remotePatterns` += `{ protocol: "https", hostname: "cdn.sanity.io" }`
  (forward-looking; no images render yet).

### 10. Tests

- `apps/web/app/api/blog/revalidate/route.test.ts` (vitest,
  `vi.mock("next/cache")`): missing signature header → 401; env unset → 401;
  invalid signature → 401; wrong secret → 401; valid `encodeSignatureHeader`
  signature → 200 + `revalidateTag("blog", { expire: 0 })`.
- `apps/web/features/blog/schemas/post.schema.test.ts`: schema accept/reject
  cases.

### 11. Verification

- `pnpm --filter web typecheck`, `pnpm --filter web lint`,
  `pnpm --filter web test`.
- Manual: `/es/blog` + `/en/blog` render the seeded posts; updating a post in
  the Studio fires the webhook and the live site reflects the change.

## Out of scope / deferred

`coverImage`/`excerpt`/`author` schema fields, draft/preview mode, per-store
blogs, cross-locale hreflang, env-driven `projectId`, and the `deploy.md`
runbook note (low-priority add-on).
