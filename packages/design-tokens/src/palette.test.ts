import { describe, expect, it } from "vitest";
import {
  buildCustomStorePalette,
  buildStoreThemeConfig,
  darken,
  DEFAULT_STORE_PALETTE,
  lighten,
  resolveStorePalette,
  rgba,
  STORE_PALETTES,
} from "./palette.js";

describe("palette", () => {
  it("keeps the existing preset palette contract", () => {
    expect(STORE_PALETTES).toHaveLength(4);
    expect(DEFAULT_STORE_PALETTE).toBe(STORE_PALETTES[0]);
    expect(resolveStorePalette({ paletteId: "mint-stage" })).toEqual(
      STORE_PALETTES[3],
    );
  });

  it("falls back for missing or malformed persisted configuration", () => {
    expect(resolveStorePalette()).toBe(DEFAULT_STORE_PALETTE);
    expect(resolveStorePalette({ paletteId: 42 })).toBe(DEFAULT_STORE_PALETTE);
    expect(
      resolveStorePalette({
        paletteId: "custom",
        colors: { primary: { unsafe: true } },
      }),
    ).toBe(DEFAULT_STORE_PALETTE);
  });

  it("derives custom colors and preserves explicit overrides", () => {
    expect(buildCustomStorePalette("#123456")).toEqual({
      id: "custom",
      name: "Custom",
      description: "Your own color",
      colors: {
        primary: "#123456",
        accent: "rgb(77, 103, 128)",
        surface: "rgb(236, 239, 241)",
        text: "rgb(5, 13, 22)",
      },
    });

    expect(
      resolveStorePalette({
        paletteId: "custom-brand",
        colors: { primary: "#123456", accent: "#abcdef" },
      }),
    ).toMatchObject({
      id: "custom-brand",
      colors: { primary: "#123456", accent: "#abcdef" },
    });
  });

  it("keeps the existing color helper behavior", () => {
    expect(rgba("#abc", 0.25)).toBe("rgba(170, 187, 204, 0.25)");
    expect(darken("#123456", 0.25)).toBe("rgb(14, 39, 65)");
    expect(darken("#123456", 2)).toBe("rgb(0, 0, 0)");
    expect(lighten("#123456", 0.25)).toBe("rgb(77, 103, 128)");
    expect(lighten("#123456", 2)).toBe("rgb(255, 255, 255)");
  });

  it("serializes a palette to the persisted theme shape", () => {
    expect(buildStoreThemeConfig(STORE_PALETTES[1]!)).toEqual({
      paletteId: "midnight-luxe",
      colors: STORE_PALETTES[1]!.colors,
    });
  });
});
