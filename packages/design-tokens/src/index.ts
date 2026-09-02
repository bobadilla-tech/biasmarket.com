/**
 * @biasmarket/design-tokens
 *
 * Portable design-token data + pure functions shared by web and mobile.
 * Store-palette color data/resolvers live in `palette.ts`; non-color
 * primitives (spacing, radii, typography) in their own modules. No
 * components and no framework imports here — this stays plain TS data so the
 * NativeWind/Tailwind config in apps/mobile (Phase 2) can consume it too.
 */

export {
  buildCustomStorePalette,
  buildStoreThemeConfig,
  darken,
  DEFAULT_STORE_PALETTE,
  lighten,
  resolveStorePalette,
  rgba,
  STORE_PALETTES,
  type StorePalette,
  type StoreThemeConfig,
} from "./palette.js";

export { spacing, type SpacingToken } from "./spacing.js";

export { radii, type RadiusToken } from "./radii.js";

export {
  fontSizes,
  type FontSizeToken,
  fontWeights,
  type FontWeightToken,
  lineHeights,
  type LineHeightToken,
} from "./typography.js";
