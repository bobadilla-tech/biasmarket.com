# Apply shared design tokens to web (#203)

**Status:** Implemented on 2026-10-07.

## Context

Issue [#203](https://github.com/bobadilla-tech/biasmarket.com/issues/203)
follows the shared spacing, radius, and typography values added to
`@biasmarket/design-tokens`. The web app already used those values in its
Tailwind conventions, but Tailwind v4's CSS-first theme kept the web consumer
separate from the TypeScript token package.

The starting worktree was clean. `apps/web/app/globals.css` contained the web
theme, including custom radius aliases; `packages/design-tokens/src/spacing.ts`,
`radii.ts`, and `typography.ts` held portable numeric values.

## Decisions

- Keep the package's TypeScript objects as the canonical source.
- Generate a Tailwind v4 CSS theme from those objects. Keep the generated source
  CSS in the package so `web` development can import it without first building
  workspace dependencies; also emit the CSS to `dist` during package builds.
- Migrate arbitrary web utilities only when the shared token reproduces their
  existing value. Preserve custom or unmatched values.
- Leave brand palette behavior unchanged.

## Changes

1. Added `buildTailwindThemeCss()` in
   `packages/design-tokens/src/tailwind-theme.ts`. It maps spacing, radii,
   typography size/line-height pairs, and weights to Tailwind v4 theme
   variables.
2. Added the package build writer and `./theme.css` export. The checked-in
   `src/theme.css` is generated from the TypeScript tokens and tested for
   synchronization.
3. Imported the shared theme in `apps/web/app/globals.css` and removed the
   duplicated radius declarations.
4. Replaced exact-match arbitrary web utilities with named shared utilities.
   This includes matching spacing and radius values, typography size/line-height
   pairs, and standalone line heights represented by the shared spacing scale.
   Unmatched values remain local.

## Verification

- `pnpm --filter @biasmarket/design-tokens build` — passed.
- `pnpm --filter @biasmarket/design-tokens test` — 5 files, 18 tests passed.
- `pnpm --filter @biasmarket/design-tokens typecheck` — passed.
- `pnpm --filter web lint` — passed; the command formatted the changed web
  files.
- `pnpm --filter web typecheck` — passed.
- `NEXT_PUBLIC_API_URL=http://localhost:3000 pnpm --filter web exec next build --webpack`
  — passed, including CSS compilation and static page generation.
- Captured reduced-motion Playwright screenshots for `/en` and
  `/en/for-sellers` at 1440×1000 and 390×844. ImageMagick reported zero
  differing pixels for all four before/after pairs.
- `git diff --check` — clean before the implementation record was added.

## Deviations and limits

- The default Turbopack build could not complete in this environment because
  it could not fetch Google Fonts in the sandbox and its elevated retry hit an
  OS process-port permission error. The Webpack build completed successfully
  with the local API URL supplied for configuration.
- Screenshot comparison covered public landing pages. Dashboard and storefront
  routes need authenticated or API-backed state that was not available in this
  local run.

## Commits

- `548dcac feat(design-tokens): generate Tailwind theme CSS`
- The web utility migration and this implementation record are committed in
  separate follow-up commits.
