/**
 * Radii scale — lifted from apps/web's globals.css `@theme` block, which maps
 * the semantic radius utilities onto a single `--radius` base (0.625rem = 10px)
 * multiplied by fixed factors (sm 0.6, md 0.8, lg 1, xl 1.4, 2xl 1.8, 3xl 2.2,
 * 4xl 2.6). `full` is the pill/circle radius used pervasively (rounded-full).
 * Values are in px.
 */
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
