import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildTailwindThemeCss } from "./tailwind-theme.js";

describe("Tailwind theme generation", () => {
  it("maps portable spacing, radius, typography, and weight tokens", () => {
    expect(buildTailwindThemeCss()).toContain("--spacing: 0.25rem;");
    expect(buildTailwindThemeCss()).toContain("--radius-sm: 0.375rem;");
    expect(buildTailwindThemeCss()).toContain("--radius-full: 624.9375rem;");
    expect(buildTailwindThemeCss()).toContain("--text-3xs: 0.625rem;");
    expect(buildTailwindThemeCss()).toContain(
      "--text-3xs--line-height: 0.75rem;",
    );
    expect(buildTailwindThemeCss()).toContain("--text-base: 1rem;");
    expect(buildTailwindThemeCss()).toContain("--font-weight-semibold: 600;");
  });

  it("maps the canonical brand palette to CSS variables", () => {
    const css = buildTailwindThemeCss();

    expect(css).toContain("--brand-ink: #10091c;");
    expect(css).toContain("--brand-violet: #822dda;");
    expect(css).toContain("--brand-pink: #f72fa7;");
    expect(css).toContain("--brand-gold: #f7c243;");
  });

  it("keeps the checked-in CSS source synchronized with the token objects", async () => {
    const css = await readFile(new URL("./theme.css", import.meta.url), "utf8");
    expect(css).toBe(buildTailwindThemeCss());
  });
});
