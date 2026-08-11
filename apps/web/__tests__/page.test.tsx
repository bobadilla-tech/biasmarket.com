import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

vi.mock("@/features/discovery/server", () => ({
  getHomeDiscoveryData: vi.fn().mockResolvedValue({
    latestTrend: null,
    bestSellers: null,
    discoverProducts: null,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    productSearch: { search: vi.fn() },
    stores: { findFeatured: vi.fn(), findDirectory: vi.fn() },
  },
}));

const { default: Page } = await import("../app/[locale]/(marketing)/page");

test("Page", async () => {
  const page = await Page();
  renderWithProviders(page);
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /mundo K-Pop/i,
    }),
  ).toBeDefined();
});
