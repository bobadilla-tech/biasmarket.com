/** Canonical Bias Market brand colors in portable sRGB values. */
export const BRAND_PALETTE = {
  ink: "#10091c",
  violet: "#822dda",
  pink: "#f72fa7",
  gold: "#f7c243",
} as const;

export type BrandPaletteToken = keyof typeof BRAND_PALETTE;
