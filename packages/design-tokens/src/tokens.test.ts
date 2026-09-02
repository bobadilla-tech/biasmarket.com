import { describe, expect, it } from "vitest";
import {
  fontSizes,
  fontWeights,
  lineHeights,
  radii,
  spacing,
} from "./index.js";

describe("spacing", () => {
  it("matches Tailwind's numeric px scale used across apps/web", () => {
    expect(spacing[0]).toBe(0);
    expect(spacing[0.5]).toBe(2);
    expect(spacing[1]).toBe(4);
    expect(spacing[1.5]).toBe(6);
    expect(spacing[2]).toBe(8);
    expect(spacing[3]).toBe(12);
    expect(spacing[4]).toBe(16);
    expect(spacing[5]).toBe(20);
    expect(spacing[6]).toBe(24);
    expect(spacing[8]).toBe(32);
    expect(spacing[10]).toBe(40);
    expect(spacing[12]).toBe(48);
    expect(spacing[16]).toBe(64);
  });

  it("is strictly increasing over the semantic scale", () => {
    // Follow the documented step order (0 → 0.5 → 1 → ...) rather than
    // Object.values(), whose numeric-key ordering is not source order.
    const steps = [
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20,
      24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
    ] as const;
    for (let i = 1; i < steps.length; i++) {
      expect(spacing[steps[i]]).toBeGreaterThan(spacing[steps[i - 1]]);
    }
  });
});

describe("radii", () => {
  it("derives from the web radius base with the documented factors", () => {
    const base = 10; // 0.625rem
    expect(radii.sm).toBe(Math.round(base * 0.6));
    expect(radii.md).toBe(Math.round(base * 0.8));
    expect(radii.lg).toBe(Math.round(base * 1));
    expect(radii.xl).toBe(Math.round(base * 1.4));
    expect(radii["2xl"]).toBe(Math.round(base * 1.8));
    expect(radii["3xl"]).toBe(Math.round(base * 2.2));
    expect(radii["4xl"]).toBe(Math.round(base * 2.6));
  });

  it("full denotes a pill/circle", () => {
    expect(radii.full).toBe(9999);
  });
});

describe("typography", () => {
  it("covers the font sizes used across apps/web", () => {
    expect(fontSizes.xs).toBe(12);
    expect(fontSizes.sm).toBe(14);
    expect(fontSizes.base).toBe(16);
    expect(fontSizes.lg).toBe(18);
    expect(fontSizes.xl).toBe(20);
    expect(fontSizes["2xl"]).toBe(24);
    expect(fontSizes["3xl"]).toBe(30);
    expect(fontSizes["4xl"]).toBe(36);
    expect(fontSizes["5xl"]).toBe(48);
  });

  it("line heights match Tailwind defaults", () => {
    expect(lineHeights.none).toBe(1);
    expect(lineHeights.tight).toBe(1.25);
    expect(lineHeights.normal).toBe(1.5);
    expect(lineHeights.loose).toBe(2);
  });

  it("font weights match CSS numeric weights", () => {
    expect(fontWeights.normal).toBe(400);
    expect(fontWeights.medium).toBe(500);
    expect(fontWeights.semibold).toBe(600);
    expect(fontWeights.bold).toBe(700);
  });
});
