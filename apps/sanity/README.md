# Bias Market Sanity Studio

Sanity Studio for the Bias Market blog content. It is the only place blog posts
are authored; `apps/web` reads them and renders the public blog pages.

## What it holds

One document type, `post` (`schemaTypes/posts.ts`, registered in
`schemaTypes/index.ts`): `title`, `slug`, `coverImage` (with an `alt` field),
and `body` (portable-text blocks). The project id and dataset are set in
`sanity.config.ts` and `sanity.cli.ts`. The studio has no secrets; it signs in
through Sanity.

## Run

From the repository root:

```bash
pnpm --filter @biasmarket/sanity dev        # sanity dev, local studio
pnpm --filter @biasmarket/sanity build      # sanity build
pnpm --filter @biasmarket/sanity deploy     # sanity deploy (hosted studio)
pnpm --filter @biasmarket/sanity lint
pnpm --filter @biasmarket/sanity typecheck
```

`@biasmarket/sanity` is the package name in `package.json`. The package also
defines `start` and `deploy-graphql`.

## How web reads it

`apps/web/features/blog/lib/sanity.ts` creates the client from
`NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET`; when either is
unset the blog renders empty. `apps/web/features/blog/server.ts` fetches posts
with the Next.js cache tag `blog` and a time-based revalidate.

For faster updates, configure a Sanity webhook that posts to
`/api/blog/revalidate` on the web app (`apps/web/app/api/blog/revalidate/route.ts`).
The route verifies the webhook signature against the `SANITY_REVALIDATE_SECRET`
environment variable of the web app and calls `revalidateTag("blog")`. Without
the secret the route returns 401. Set the secret value in the webhook settings
in Sanity and in the web environment; never commit it.

## Related

- [docs/core/deploy.md](../../docs/core/deploy.md) — web environment variables
- [apps/web/AGENTS.md](../web/AGENTS.md) — web conventions
