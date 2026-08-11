import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const { default: Page } = await import("../app/[locale]/(marketing)/page");

test("Page", () => {
  renderWithProviders(<Page />);
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /mundo K-Pop/i,
    }),
  ).toBeDefined();
});
