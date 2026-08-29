import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollectionWithProductsResponseDto } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { CollectionCard } from "./collection-card";

const collection = {
  id: "collection-1",
  storeId: "store-1",
  name: "Albums",
  slug: "albums",
  description: "Albums collection",
  createdAt: "2026-01-01T00:00:00.000Z",
  products: [
    {
      collectionId: "collection-1",
      productId: "product-1",
      position: 0,
      product: { id: "product-1", name: "First album" },
    },
    {
      collectionId: "collection-1",
      productId: "product-2",
      position: 1,
      product: { id: "product-2", name: "Second album" },
    },
  ],
} as CollectionWithProductsResponseDto;

test("moves a product up through the keyboard-reachable reorder control", async () => {
  const onReorder = vi.fn();
  const user = userEvent.setup();

  renderWithProviders(
    <CollectionCard
      collection={collection}
      products={[]}
      onDelete={vi.fn()}
      onReorder={onReorder}
      onRemoveProduct={vi.fn()}
      onAddProduct={vi.fn()}
    />,
  );

  const moveUpButtons = screen.getAllByRole("button", { name: "Subir" });
  moveUpButtons[1].focus();
  await user.keyboard("{Enter}");

  expect(onReorder).toHaveBeenCalledWith(collection, 1, -1);
});
