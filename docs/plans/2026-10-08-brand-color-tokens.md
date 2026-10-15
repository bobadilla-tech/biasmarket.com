# Unify web and mobile brand color tokens (#213)

**Status:** Implemented on 2026-10-08.

## Context

Issue [#213](https://github.com/bobadilla-tech/biasmarket.com/issues/213)
tracks one shared source for Bias Market's core brand colors across web and
mobile. The design token package already exposed `APP_PALETTE` for mobile. Web
defined the core colors in `apps/web/app/globals.css` using OKLCH, and the
landing theme scoped its own violet and pink values.

The web root theme was selected as the source of truth. Its portable sRGB values
are ink `#10091c`, violet `#822dda`, pink `#f72fa7`, and gold `#f7c243`. The
landing's existing violet and pink remain scoped overrides to preserve its
current appearance. Merchant colors and Expo template colors remain outside
this change.

## Decisions

- Replace `APP_PALETTE` and its consumers directly with `BRAND_PALETTE`; do not
  keep compatibility aliases.
- Keep the four shared values in TypeScript and generate the web CSS variables
  from them through the existing theme generator.
- Keep the landing's violet and pink scoped to `.landing-theme`; reference the
  scoped violet in landing gradients instead of repeating its literal value.
- Use the `brand-*` Tailwind namespace in mobile.

## Changes

1. Renamed `app-palette.ts` to `brand-palette.ts` and exported
   `BRAND_PALETTE` / `BrandPaletteToken` from the package barrel.
2. Extended `buildTailwindThemeCss()` to emit the four `--brand-*` root
   variables. Regenerated `src/theme.css` and added palette output assertions
   to the generator test.
3. Updated `apps/mobile/tailwind.config.ts` to use `BRAND_PALETTE` under
   `brand`, and migrated the starter screen from `app-*` to `brand-*` classes.
4. Removed duplicate brand values from the web root theme. Web consumes the
   generated package CSS; `.landing-theme` retains only its violet and pink
   overrides.
5. Replaced repeated landing violet literals with `var(--brand-violet)` and
   changed the for-sellers photocard shadow to use the shared pink variable.

## Verification

- `pnpm --filter @biasmarket/design-tokens build` — passed.
- `pnpm --filter @biasmarket/design-tokens test` — 5 files, 19 tests passed.
- `pnpm --filter @biasmarket/design-tokens typecheck` — passed.
- `pnpm --filter mobile lint` — passed.
- `pnpm --filter mobile typecheck` — passed.
- `pnpm --filter mobile exec expo export --platform android` — passed; Metro
  bundled the Android JavaScript bundle. No simulator or physical-device run was
  part of this validation.
- `pnpm --filter web lint` — passed.
- `pnpm --filter web typecheck` — passed.
- `NEXT_PUBLIC_API_URL=http://localhost:3000 pnpm --filter web exec next build --webpack`
  — passed, including CSS compilation and static page generation.
- Opened the local web application in Chromium. `/en` and `/en/for-sellers`
  returned HTTP 200 at 1440×1000 and 390×844; both had a visible main region and
  page heading. Computed styles showed the landing's scoped pair
  `#8d2feb` / `#ff3db1` and the canonical root pair `#822dda` / `#f72fa7` on
  for-sellers, with ink and gold matching on both routes.
- Captured reduced-motion screenshots before and after at desktop and mobile
  viewports. Same-mode development captures showed 0 changed pixels on the
  landing desktop image, 1 on landing mobile, and 351 / 118 pixels on
  for-sellers desktop / mobile (0.00685% / 0.00617% of each image), where the
  brand colors changed to the canonical values. Final production screenshots
  were inspected after the CSS-variable cleanup. Screenshot files are in
  `/tmp/issue213-before-*.png` and `/tmp/issue213-final-*.png`.
- `git diff --check` — passed.

## Deviations and limits

- The production screenshot pass ran against a production build after the final
  CSS-variable cleanup; initial before/after pixel counts came from matching
  development captures. The final web build and production routes both loaded
  successfully.
- The mobile export proves Metro can bundle the updated token classes; it does
  not prove rendering on an Android device.

## Commits

- `3cc45b2 feat(design-tokens): unify brand palette`
- `b1c2c98 refactor(web): consume canonical brand colors`
- `68e76d6 refactor(web): reuse scoped brand colors`
- This implementation record is committed separately.
