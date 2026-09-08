/** Unitless CSS-pixel / React Native density-independent type metrics. */
export const typography = {
  sizes: {
    "3xs": { fontSize: 10, lineHeight: 12 },
    "2xs": { fontSize: 11, lineHeight: 13 },
    xs: { fontSize: 12, lineHeight: 16 },
    sm: { fontSize: 14, lineHeight: 20 },
    base: { fontSize: 16, lineHeight: 24 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 28 },
    "2xl": { fontSize: 24, lineHeight: 32 },
    "3xl": { fontSize: 30, lineHeight: 36 },
    "4xl": { fontSize: 36, lineHeight: 40 },
  },
  weights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
} as const;

export type TypographySizeToken = keyof typeof typography.sizes;
export type TypographyWeightToken = keyof typeof typography.weights;
