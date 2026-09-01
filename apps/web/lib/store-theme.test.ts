import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORE_PALETTE,
  getStoreThemeStyle,
  resolveStorePalette,
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
});
