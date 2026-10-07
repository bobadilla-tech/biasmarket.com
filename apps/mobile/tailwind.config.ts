import type { Config } from "tailwindcss";
import {
  APP_PALETTE,
  radii,
  spacing,
  typography,
} from "@biasmarket/design-tokens/source";
// NativeWind v4 ships an empty type declaration for this CommonJS preset.
// @ts-expect-error The runtime package exports the Tailwind preset.
import nativewindPreset from "nativewind/preset";

const configuredPreset = nativewindPreset as NonNullable<
  Config["presets"]
>[number];

const px = (value: number) => `${value}px`;

const config: Config = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [configuredPreset],
  theme: {
    extend: {
      borderRadius: Object.fromEntries(
        Object.entries(radii).map(([token, value]) => [token, px(value)]),
      ),
      colors: { app: APP_PALETTE },
      fontSize: Object.fromEntries(
        Object.entries(typography.sizes).map(([token, metrics]) => [
          token,
          [px(metrics.fontSize), { lineHeight: px(metrics.lineHeight) }],
        ]),
      ),
      fontWeight: Object.fromEntries(
        Object.entries(typography.weights).map(([token, value]) => [
          token,
          String(value),
        ]),
      ),
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([token, value]) => [token, px(value)]),
      ),
    },
  },
  plugins: [],
};

export default config;
