import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORE_PALETTE,
  contrastRatio,
  ensureContrast,
  getStoreThemeStyle,
  resolveStorePalette,
  STORE_PALETTES,
} from "./store-theme";

describe("store theme", () => {
  it("resolves a custom primary color into portable palette tokens", () => {
    const palette = resolveStorePalette({
      paletteId: "custom",
      colors: { primary: "#123456" },
    });

    expect(palette).toMatchObject({
      id: "custom",
      colors: { primary: "#123456" },
    });
    expect(palette.colors.accent).toMatch(/^rgb\(/);
  });

  it("falls back safely when persisted theme colors are malformed", () => {
    expect(
      resolveStorePalette({
        paletteId: "custom",
        colors: { primary: { unsafe: true } },
      }),
    ).toBe(DEFAULT_STORE_PALETTE);
  });

  it("keeps the DOM-specific CSS adapter in the web app", () => {
    expect(getStoreThemeStyle({ paletteId: "mint-stage" })).toMatchObject({
      "--store-primary": "#0f766e",
      "--store-accent": "#22c55e",
    });
  });

  it("meets AA contrast for price, active tabs, and button gradient across all presets", () => {
    for (const palette of STORE_PALETTES) {
      const style = getStoreThemeStyle({
        paletteId: palette.id,
      }) as unknown as Record<string, string>;
      expect(
        contrastRatio(style["--store-price"], "#ffffff"),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(style["--store-tab-active"], "#ffffff"),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(style["--store-gradient-start"], "#ffffff"),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(style["--store-gradient-end"], "#ffffff"),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(style["--store-placeholder"], palette.colors.surface),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrastRatio(ensureContrast("rgb(244, 114, 182)", "#fff", 4.5), "#fff"),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
