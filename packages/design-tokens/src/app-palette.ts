/** Bias Market brand colors, converted to sRGB equivalents for React Native. */
export const APP_PALETTE = {
  ink: "#10091c",
  violet: "#8d2feb",
  pink: "#ff3db1",
  gold: "#f7c243",
} as const;

export type AppPaletteToken = keyof typeof APP_PALETTE;
