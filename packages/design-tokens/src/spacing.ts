/** Unitless CSS-pixel / React Native density-independent spacing values. */
export const spacing = {
  "0": 0,
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
  "2.5": 10,
  "3": 12,
  "3.5": 14,
  "4": 16,
  "5": 20,
  "6": 24,
  "8": 32,
} as const;

export type SpacingToken = keyof typeof spacing;
