import { describe, expect, test } from "vitest";

const semanticPairs = [
  ["focus ring on light", "#8b5cf6", "#ffffff", 3],
  ["focus ring on sidebar", "#8b5cf6", "#180832", 3],
  ["error on light", "#b42318", "#ffffff", 4.5],
  ["warning on light", "#8a4b00", "#ffffff", 4.5],
  ["sidebar muted on darkest stop", "#eadcff", "#180832", 4.5],
  ["sidebar subtle on darkest stop", "#dcc7f2", "#180832", 4.5],
  ["sidebar badge on darkest stop", "#f7efff", "#180832", 4.5],
] as const;

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const rgb =
    hex
      .slice(1)
      .match(/.{2}/g)
      ?.map((part) => channel(Number.parseInt(part, 16))) ?? [];
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("AA semantic color tokens", () => {
  test.each(semanticPairs)(
    "%s meets its minimum contrast",
    (_name, foreground, background, minimum) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
        minimum,
      );
    },
  );
});
