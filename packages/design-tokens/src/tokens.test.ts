import { describe, expect, it } from "vitest";
import { radii } from "./radii.js";
import { spacing } from "./spacing.js";
import { typography } from "./typography.js";

describe("non-color token compatibility", () => {
  it("preserves the established spacing values while allowing additions", () => {
    expect(spacing).toMatchObject({
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
    });
  });

  it("preserves the established radius values while allowing additions", () => {
    expect(radii).toMatchObject({
      sm: 6,
      md: 8,
      lg: 10,
      xl: 14,
      "2xl": 18,
      "3xl": 22,
      "4xl": 26,
      full: 9999,
    });
  });

  it("preserves the established type scale while allowing additions", () => {
    expect(typography).toMatchObject({
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
    });
  });
});
