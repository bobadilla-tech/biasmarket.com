/**
 * Typography scale — the de-facto canonical set lifted from apps/web, which
 * uses Tailwind's default type utilities (`text-*`, `leading-*`, `font-*`)
 * throughout components/ui and app pages. All values in px. Plain data so
 * mobile and web share the exact same type scale without a framework import.
 */
export const fontSizes = {
  /**
   * `text-xs` — 12px
   */
  xs: 12,
  /**
   * `text-sm` — 14px
   */
  sm: 14,
  /**
   * `text-base` — 16px
   */
  base: 16,
  /**
   * `text-lg` — 18px
   */
  lg: 18,
  /**
   * `text-xl` — 20px
   */
  xl: 20,
  /**
   * `text-2xl` — 24px
   */
  "2xl": 24,
  /**
   * `text-3xl` — 30px
   */
  "3xl": 30,
  /**
   * `text-4xl` — 36px
   */
  "4xl": 36,
  /**
   * `text-5xl` — 48px
   */
  "5xl": 48,
} as const;

export type FontSizeToken = keyof typeof fontSizes;

/**
 * Line heights paired with the above font sizes — Tailwind's defaults.
 */
export const lineHeights = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;

export type LineHeightToken = keyof typeof lineHeights;

/**
 * Font weights used across apps/web (Tailwind `font-*` utilities). Numeric
 * values match the CSS weight.
 */
export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
} as const;

export type FontWeightToken = keyof typeof fontWeights;
