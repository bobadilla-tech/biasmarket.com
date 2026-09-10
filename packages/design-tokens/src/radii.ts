/** Unitless CSS-pixel / React Native density-independent radius values. */
export const radii = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  "2xl": 18,
  "3xl": 22,
  "4xl": 26,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radii;
