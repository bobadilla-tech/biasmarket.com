import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { SocialIcon } from "./social-icon";

// SocialIcon renders a bare fragment (an <svg> glyph + an `sr-only` label
// span), so every assertion goes through an <a> wrapper — a fragment has no
// host element to query an accessible name on. PR A pins current behavior;
// PR D adds the anchor-level `aria-label` + a11y assertions.

const cases: Array<{ platform: string; label: string }> = [
  { platform: "instagram", label: "Instagram" },
  { platform: "facebook", label: "Facebook" },
  { platform: "tiktok", label: "TikTok" },
  { platform: "twitter", label: "X" },
];

for (const { platform, label } of cases) {
  test(`${platform} renders an svg glyph and the "${label}" sr-only label`, () => {
    const { container } = render(
      <a href={`https://example.com/${platform}`}>
        <SocialIcon platform={platform} />
      </a>,
    );

    const link = screen.getByRole("link");
    expect(container.querySelector("svg")).not.toBeNull();
    // The nested `sr-only` span is currently the anchor's only text content,
    // so it is what a screen reader announces as the link's name.
    expect(link.textContent).toBe(label);
  });
}

test("an unknown platform renders nothing", () => {
  const { container } = render(
    <a href="https://example.com/youtube">
      <SocialIcon platform="youtube" />
    </a>,
  );

  expect(container.querySelector("svg")).toBeNull();
  expect(screen.getByRole("link").textContent).toBe("");
});
