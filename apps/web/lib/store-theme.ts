import type { CSSProperties } from "react";

export type StorePalette = {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    accent: string;
    surface: string;
    text: string;
  };
};

export type StoreThemeConfig = {
  paletteId?: string;
  colors?: Partial<StorePalette["colors"]>;
};

export const STORE_PALETTES: StorePalette[] = [
  {
    id: "royal-bloom",
    name: "Royal Bloom",
    description: "Plum, orchid, and soft rose",
    colors: {
      primary: "#6d28d9",
      accent: "#f472b6",
      surface: "#faf5ff",
      text: "#2d1649",
    },
  },
  {
    id: "midnight-luxe",
    name: "Midnight Luxe",
    description: "Deep navy with electric violet",
    colors: {
      primary: "#312e81",
      accent: "#8b5cf6",
      surface: "#eef2ff",
      text: "#1f1b4b",
    },
  },
  {
    id: "sunset-pop",
    name: "Sunset Pop",
    description: "Coral, peach, and warm ivory",
    colors: {
      primary: "#ea580c",
      accent: "#fb7185",
      surface: "#fff7ed",
      text: "#4a1d18",
    },
  },
  {
    id: "mint-stage",
    name: "Mint Stage",
    description: "Fresh mint with bright teal",
    colors: {
      primary: "#0f766e",
      accent: "#22c55e",
      surface: "#ecfeff",
      text: "#13343a",
    },
  },
] as const;

export const DEFAULT_STORE_PALETTE = STORE_PALETTES[0];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const ratio = clamp(1 - amount, 0, 1);
  const toChannel = (channel: number) => Math.round(channel * ratio);
  return `rgb(${toChannel(r)}, ${toChannel(g)}, ${toChannel(b)})`;
}

function isThemeConfig(value: unknown): value is StoreThemeConfig {
  return typeof value === "object" && value !== null;
}

export function resolveStorePalette(themeConfig?: unknown): StorePalette {
  if (!isThemeConfig(themeConfig)) {
    return DEFAULT_STORE_PALETTE;
  }

  const base =
    STORE_PALETTES.find((palette) => palette.id === themeConfig.paletteId) ??
    DEFAULT_STORE_PALETTE;

  return {
    ...base,
    colors: {
      ...base.colors,
      ...(themeConfig.colors ?? {}),
    },
  };
}

export function buildStoreThemeConfig(paletteId: string): StoreThemeConfig {
  const palette =
    STORE_PALETTES.find((item) => item.id === paletteId) ?? DEFAULT_STORE_PALETTE;

  return {
    paletteId: palette.id,
    colors: palette.colors,
  };
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
    "--store-sidebar-start": darken(palette.colors.primary, 0.58),
    "--store-sidebar-mid": darken(palette.colors.primary, 0.68),
    "--store-sidebar-end": darken(palette.colors.primary, 0.78),
  } as CSSProperties;
}
