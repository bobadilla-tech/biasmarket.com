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

export function getStoreThemeStyle(themeConfig?: unknown): CSSProperties {
  const palette = resolveStorePalette(themeConfig);

  return {
    "--store-primary": palette.colors.primary,
    "--store-accent": palette.colors.accent,
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
