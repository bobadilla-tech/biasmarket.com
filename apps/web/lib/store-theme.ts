import type { CSSProperties } from "react";
import {
  buildCustomStorePalette,
  buildStoreThemeConfig,
  darken,
  DEFAULT_STORE_PALETTE,
  resolveStorePalette,
  rgba,
  STORE_PALETTES,
} from "@biasmarket/design-tokens";
import type { StorePalette, StoreThemeConfig } from "@biasmarket/design-tokens";

export {
  buildCustomStorePalette,
  buildStoreThemeConfig,
  DEFAULT_STORE_PALETTE,
  resolveStorePalette,
  STORE_PALETTES,
};
export type { StorePalette, StoreThemeConfig };

function hexToRgb(hex: string) {
  const rgbMatch = hex.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  const value = Number.parseInt(expanded, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function channelLuminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastWithWhiteRgb(r: number, g: number, b: number) {
  const luminance =
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b);
  return 1.05 / (luminance + 0.05);
}

function contrastWithWhite(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return contrastWithWhiteRgb(r, g, b);
}

/** Keep theme-colored text readable on the light dashboard surfaces. */
function readableTextColor(hex: string) {
  if (contrastWithWhite(hex) >= 4.5) return hex;

  for (let amount = 0.05; amount <= 0.8; amount += 0.05) {
    const { r, g, b } = hexToRgb(hex);
    const ratio = 1 - amount;
    const candidate = `rgb(${Math.round(r * ratio)}, ${Math.round(
      g * ratio,
    )}, ${Math.round(b * ratio)})`;
    if (
      contrastWithWhiteRgb(
        Math.round(r * ratio),
        Math.round(g * ratio),
        Math.round(b * ratio),
      ) >= 4.5
    )
      return candidate;
  }

  return darken(hex, 0.8);
}

/** Maps a store palette to accessible CSS custom properties for its storefront. */
export function getStoreThemeStyle(themeConfig?: unknown): CSSProperties {
  const palette = resolveStorePalette(themeConfig);
  const primary = palette.colors.primary;
  const price = ensureContrast(primary, "#ffffff", 4.5);
  const active = ensureContrast(
    ensureContrast(primary, palette.colors.surface, 4.5),
    "#ffffff",
    4.5,
  );
  const accent = ensureContrast(palette.colors.accent, "#ffffff", 4.5);

  return {
    "--store-primary": primary,
    "--store-accent": palette.colors.accent,
    "--store-price": price,
    "--store-tab-active": active,
    "--store-placeholder": active,
    "--store-muted": "#6b6472",
    "--store-card": "#ffffff",
    "--store-on-active": "#ffffff",
    "--store-border": rgba(primary, 0.14),
    "--store-gradient-start": accent,
    "--store-gradient-end": ensureContrast(primary, "#ffffff", 4.5),
    "--store-surface": palette.colors.surface,
    "--store-text": palette.colors.text,
    "--store-ring": rgba(palette.colors.primary, 0.18),
    "--store-shadow": rgba(palette.colors.primary, 0.24),
    "--store-soft-border": rgba(palette.colors.primary, 0.18),
    "--store-primary-text": readableTextColor(palette.colors.primary),
    "--store-sidebar-start": darken(palette.colors.primary, 0.58),
    "--store-sidebar-mid": darken(palette.colors.primary, 0.68),
    "--store-sidebar-end": darken(palette.colors.primary, 0.78),
  } as CSSProperties;
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Returns the WCAG contrast ratio between two colors. */
export function contrastRatio(foreground: string, background: string) {
  const values = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

/** Adjusts a foreground color until it meets the requested contrast ratio. */
export function ensureContrast(
  foreground: string,
  background: string,
  minimum: number,
) {
  if (contrastRatio(foreground, background) >= minimum) return foreground;
  const original = hexToRgb(foreground);
  const towardDark = relativeLuminance(background) > 0.5;
  const colorAt = (amount: number) => {
    const channel = (value: number) =>
      Math.round(
        towardDark ? value * (1 - amount) : value + (255 - value) * amount,
      );
    return `#${[original.r, original.g, original.b]
      .map((value) => channel(value).toString(16).padStart(2, "0"))
      .join("")}`;
  };
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const amount = (low + high) / 2;
    const candidate = colorAt(amount);
    if (contrastRatio(candidate, background) >= minimum) high = amount;
    else low = amount;
  }
  return colorAt(high);
}
