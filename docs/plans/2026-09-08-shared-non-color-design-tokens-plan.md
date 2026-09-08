# Shared non-color design tokens for mobile

**Status:** Implemented on 2026-09-08.

**Source:** Mobile MVP Phase 0 in
`docs/plans/2026-08-31-mobile-app-mvp-plan.md`.

## Context

`@biasmarket/design-tokens` contained the portable store-palette data and
resolver, but no shared spacing, radius, or typography primitives. The first
mobile auth and catalog screens need those primitives before `apps/mobile` and
its NativeWind configuration are introduced. Without a shared baseline, web
and mobile would independently choose values for the same visual language.

This change extends the package with plain TypeScript data derived from the
web application's existing Tailwind conventions. It does not migrate web
styles, add components, or introduce platform-specific configuration.

## Audit and decisions

The web app uses Tailwind v4 declarations in `apps/web/app/globals.css` rather
than a separate Tailwind configuration file. The extraction used these
boundaries:

- Spacing comes from actual padding, margin, and gap usage in
  `apps/web/components/ui`. Component dimensions, percentages, `auto`, and
  negative variants are not spacing tokens.
- Spacing keeps Tailwind-compatible string keys and unitless numeric values.
  The numbers represent CSS pixels on web and density-independent units on
  React Native.
- Radii resolve the named web CSS scale to numbers. `full: 9999` provides the
  portable pill/circle convention; isolated arbitrary component radii remain
  local.
- Typography pairs each font size with its established line height. Repeated
  `10px` and `11px` web conventions extend the scale as `3xs` and `2xs`.
  Weights remain a separate named map.
- Font families and letter spacing remain platform/component concerns until
  mobile font loading and display treatments are concrete.
- Breakpoints and z-index values were omitted because no Phase 0 consumer
  demonstrates a portable requirement yet.
- Source modules remain internal. The package root is the only supported
  public import path.
- No accessors were added; direct object lookup preserves literal inference
  and avoids unnecessary runtime API.

The exported scales are additive contracts. Later mobile work may add tokens,
but must not rename, remove, or change the meaning of established entries.

## Implementation result

- Moved the existing palette implementation verbatim from `src/index.ts` to
  `src/palette.ts`. Every existing palette export retains its name and package
  import path.
- Added `src/spacing.ts` with the observed `0` through `8` layout subset,
  including half steps used by web UI primitives.
- Added `src/radii.ts` with `sm` through `4xl` plus `full`.
- Added `src/typography.ts` with `3xs` through `4xl` size/line-height pairs and
  `light` through `black` weight steps.
- Exported `SpacingToken`, `RadiusToken`, `TypographySizeToken`, and
  `TypographyWeightToken` key unions.
- Replaced `src/index.ts` with NodeNext-compatible `.js` re-exports for the
  four internal modules.
- Added package-local Vitest coverage for the palette behavior and established
  token values. Token tests use subset assertions so additive extensions do
  not break compatibility checks.
- Added the package `test` script and Vitest as a development-only dependency;
  the package still has zero runtime dependencies.
- Excluded co-located test files from TypeScript build output, matching the
  convention used by other shared packages.
- No `apps/web` source or styling file changed.

## Verification

- `pnpm turbo run build typecheck test --filter=@biasmarket/design-tokens`:
  3/3 tasks passed; 2 test files and 8 tests passed.
- `apps/web`'s `lib/store-theme.test.ts`: 3/3 tests passed against the unchanged
  package-root imports.
- `pnpm typecheck`: 19/19 Turbo tasks passed monorepo-wide.
- `pnpm lint`: 2/2 configured lint tasks passed monorepo-wide.
- `git diff --check`: clean.
- The generated declarations expose the new token objects and key unions.
- The package manifest has no runtime dependencies, and its source imports no
  React, React Native, NativeWind, Tailwind, DOM, or CSS runtime.

## Follow-up boundary

Phase 2 may consume these objects from the mobile NativeWind configuration. If
that work proves a concrete need for breakpoints, stacking values, font-family
metadata, or additional scale entries, extend this package additively in that
ticket rather than changing the contracts established here.
