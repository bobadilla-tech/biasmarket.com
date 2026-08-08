import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StoreSectionResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../../../../test-utils/render-with-providers";

vi.mock("@/features/stores", () => ({
  useDashboardStore: () => ({
    storeId: "store-1",
    slug: "my-store",
    loading: false,
  }),
}));

const {
  findAllSections,
  findAllCollections,
  updateSection,
  reorderSections,
} = vi.hoisted(() => ({
  findAllSections: vi.fn(),
  findAllCollections: vi.fn(),
  updateSection: vi.fn(),
  reorderSections: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    storeSections: {
      findAll: findAllSections,
      update: updateSection,
      reorder: reorderSections,
      create: vi.fn(),
      remove: vi.fn(),
    },
    collections: { findAll: findAllCollections },
  },
}));

const bannerSection: StoreSectionResponseDto = {
  id: "section-banner",
  storeId: "store-1",
  type: "BANNER",
  collectionId: null,
  content: { imageUrl: "https://example.com/banner.png" },
  position: 0,
  hidden: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const textSection: StoreSectionResponseDto = {
  id: "section-text",
  storeId: "store-1",
  type: "TEXT_BLOCK",
  collectionId: null,
  content: { body: "Welcome to the store" },
  position: 1,
  hidden: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const { SectionsPageClient } = await import("./sections-page-client");

afterEach(() => {
  vi.clearAllMocks();
});

test("renders section tiles and their content in the live preview", async () => {
  findAllSections.mockResolvedValue([bannerSection, textSection]);
  findAllCollections.mockResolvedValue([]);

  renderWithProviders(<SectionsPageClient />);

  expect(await screen.findByText("Banner")).toBeTruthy();
  expect(screen.getByText("Bloque de texto")).toBeTruthy();
  expect(await screen.findByText("Welcome to the store")).toBeTruthy();
});

test("hiding a section removes it from the preview and persists the toggle", async () => {
  findAllSections.mockResolvedValue([bannerSection, textSection]);
  findAllCollections.mockResolvedValue([]);
  updateSection.mockResolvedValue({ ...textSection, hidden: true });

  renderWithProviders(<SectionsPageClient />);

  await screen.findByText("Welcome to the store");

  const hideButtons = screen.getAllByRole("button", { name: "Ocultar" });
  await userEvent.click(hideButtons[1]);

  await waitFor(() => {
    expect(screen.queryByText("Welcome to the store")).toBeNull();
  });
  expect(updateSection).toHaveBeenCalledWith(
    "store-1",
    "section-text",
    { hidden: true },
    expect.anything(),
  );
});
